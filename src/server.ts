#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { gate } from './gate.js';
import { evaluate } from './engine.js';
import { mandatoryStopLoss } from './rules/mandatory-stop-loss.js';
import { maxLotsPerSymbol } from './rules/max-lots-per-symbol.js';
import { checkAmendPreservesLegs } from './amend-guard.js';
import { createFileJournal } from './journal.js';
import { RemoteCTraderClient } from './ctrader.js';
import { loadPolicy, loadRuntimeConfig, loadSymbols } from './config.js';
import type { Decision, EvaluationContext, Mode, OrderIntent, Rule, RuleResult } from './domain.js';

const policy = loadPolicy('policy.yaml');
const symbols = loadSymbols('symbols.yaml');
const cfg = loadRuntimeConfig(policy, process.env);

const client = new RemoteCTraderClient(cfg.url, cfg.slug);
const record = createFileJournal('journal/decisions.jsonl');

const rules: Rule[] = [];
if (policy.rules['mandatory-stop-loss']?.enabled) rules.push(mandatoryStopLoss);
const lotLimits = policy.rules['max-lots-per-symbol'];
if (lotLimits && Object.keys(lotLimits).length > 0) rules.push(maxLotsPerSymbol(lotLimits));

const server = new McpServer({ name: 'preflight', version: '0.1.0' });

/** Deposit-currency equity, scaled out of moneyDigits. Undefined if unreadable. */
async function readEquity(): Promise<number | undefined> {
  try {
    const b = (await client.callTool('get_balance', {})) as {
      equity?: number;
      moneyDigits?: number;
    };
    if (typeof b.equity !== 'number') return undefined;
    return b.equity / 10 ** (b.moneyDigits ?? 2);
  } catch {
    return undefined;
  }
}

/**
 * amend-guard.ts speaks in RuleResult (one hardcoded check); gate() speaks in
 * Decision (the shape every gated tool's verdict takes). This is that seam.
 */
function toDecision(result: RuleResult): Decision {
  return { outcome: result.pass ? 'ALLOW' : 'DENY', reason: result.reason, rules: [result] };
}

/**
 * Builds the MCP tool response from a verdict. Shared by every gated tool so
 * the response shape can't drift between them the way it did before this was
 * extracted — create_order and amend_position independently hand-rolled
 * near-identical header logic that had already started to disagree.
 */
function toolResponse(decision: Decision, mode: Mode, forwarded: boolean) {
  const stillForwarded = mode === 'observe' && decision.outcome !== 'ALLOW';
  const header =
    decision.outcome === 'ALLOW'
      ? 'ALLOW'
      : `${decision.outcome}${decision.code ? ` (${decision.code})` : ''}` +
        (stillForwarded ? ' [observe mode — forwarded anyway]' : '');

  return {
    content: [
      {
        type: 'text' as const,
        text: `${header}: ${decision.reason}\nmode=${mode} forwarded=${forwarded}`,
      },
    ],
    isError: decision.outcome !== 'ALLOW' && mode === 'enforce',
  };
}

/**
 * The gated tool. Mirrors cTrader's create_order schema exactly so Preflight is
 * a drop-in replacement — swapping the MCP config can't break a prompt that
 * already worked, and there's no unit translation to get wrong.
 */
server.tool(
  'create_order',
  'Place a new order. Evaluated against Preflight policy before it can reach the broker.',
  {
    symbolId: z.number().int(),
    orderType: z.enum(['MARKET', 'LIMIT', 'STOP', 'MARKET_RANGE', 'STOP_LIMIT']),
    tradeSide: z.enum(['BUY', 'SELL']),
    volume: z.number().int().positive().describe('1/100 base asset: lots x lotSize x 100'),
    stopLoss: z.number().optional().describe('Absolute DISPLAY price. Not valid on MARKET.'),
    takeProfit: z.number().optional(),
    relativeStopLoss: z.number().int().positive().optional().describe('POINTS from fill'),
    relativeTakeProfit: z.number().int().positive().optional(),
    limitPrice: z.number().optional(),
    stopPrice: z.number().optional(),
    label: z.string().max(100).optional(),
    comment: z.string().max(256).optional(),
  },
  async (raw) => {
    const intent = raw as OrderIntent;
    const ctx: EvaluationContext = {
      equity: (await readEquity()) ?? 0,
      ...(symbols.bySymbolId.get(intent.symbolId)
        ? { symbol: symbols.bySymbolId.get(intent.symbolId)! }
        : {}),
    };

    const decision = evaluate(intent, ctx, rules);
    const { forwarded } = await gate({
      decision,
      intent,
      tool: 'create_order',
      mode: cfg.mode,
      forward: () => client.createOrder(intent),
      record,
      equity: ctx.equity,
      spotPrice: ctx.spotPrice,
    });

    return toolResponse(decision, cfg.mode, forwarded);
  },
);

/**
 * Gated: amend_position, guarded against quirk Q-R10.
 *
 * Not routed through the declarative rule engine — a separate, hardcoded check
 * with its own shape. create_order carries symbol/volume/side/prices;
 * amend_position carries a position id and two optional fields. Forcing both
 * through one generic evaluator would be premature generalisation across two
 * shapes that barely overlap.
 *
 * Needs live position state, since the question is what the amend would REMOVE
 * relative to what the position currently holds.
 */
server.tool(
  'amend_position',
  'Amend a position. Guarded: refuses amends that would silently delete an existing SL/TP leg (Q-R10).',
  {
    positionId: z.number().int(),
    stopLoss: z.number().optional(),
    takeProfit: z.number().optional(),
  },
  async (intent) => {
    const live = (await client.callTool('get_positions', {})) as {
      positions?: Array<{ positionId: number; stopLoss?: number; takeProfit?: number }>;
    };
    const position = live.positions?.find((p) => p.positionId === intent.positionId);

    // Fail closed, same principle as engine.ts's missing-symbol-metadata check:
    // without current state we cannot know what an amend would remove, so this
    // is ERROR (the gate couldn't judge), not a policy DENY — and it still goes
    // through gate() below, so it's journalled like every other decision.
    const decision: Decision = position
      ? toDecision(checkAmendPreservesLegs(intent, position))
      : {
          outcome: 'ERROR',
          code: 'position_not_found',
          reason: `position ${intent.positionId} not found; cannot check what an amend would remove`,
          rules: [],
        };

    const { forwarded } = await gate({
      decision,
      intent,
      tool: 'amend_position',
      mode: cfg.mode,
      forward: () => client.callTool('amend_position', intent),
      record,
    });

    return toolResponse(decision, cfg.mode, forwarded);
  },
);

/**
 * Pass-through mutations. Proxied but not evaluated in v1.
 *
 * These MUST be exposed even though they aren't gated: Preflight holds the only
 * trading credential, so if it didn't proxy them the trader could no longer
 * close a position or manage a pending order at all.
 *
 * close_position can only reduce exposure. amend_order and cancel_order cannot
 * increase it directly, but amend_order is a real gap: an order sized within a
 * max-lots-per-symbol cap at create_order time can be resized past it here,
 * since this call carries no policy check. See README "What it doesn't do".
 */
const PASS_THROUGH = [
  ['close_position', 'Close a position (proxied, not policy-evaluated)'],
  ['amend_order', 'Amend a pending order (proxied, not policy-evaluated)'],
  ['cancel_order', 'Cancel a pending order (proxied, not policy-evaluated)'],
] as const;

for (const [name, description] of PASS_THROUGH) {
  server.tool(name, description, { args: z.record(z.unknown()).optional() }, async (a) => {
    const result = await client.callTool(name, (a.args ?? {}) as Record<string, unknown>);
    return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `preflight: mode=${cfg.mode} rules=[${rules.map((r) => r.name).join(', ')}] ` +
    `symbols=${symbols.bySymbolId.size} (${symbols.provenance.source}/${symbols.provenance.status})`,
);
