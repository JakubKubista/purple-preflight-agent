#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { gate } from './gate.js';
import { mandatoryStopLoss } from './rules/mandatory-stop-loss.js';
import { createFileJournal } from './journal.js';
import { RemoteCTraderClient } from './ctrader.js';
import { loadPolicy, loadRuntimeConfig, loadSymbols } from './config.js';
import type { EvaluationContext, OrderIntent, Rule } from './domain.js';

const policy = loadPolicy('policy.yaml');
const symbols = loadSymbols('symbols.yaml');
const cfg = loadRuntimeConfig(policy, process.env);

const client = new RemoteCTraderClient(cfg.url, cfg.slug);
const record = createFileJournal('journal/decisions.jsonl');

const rules: Rule[] = [];
if (policy.rules['mandatory-stop-loss']?.enabled) rules.push(mandatoryStopLoss);

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
  async (intent) => {
    const ctx: EvaluationContext = {
      equity: (await readEquity()) ?? 0,
      ...(symbols.bySymbolId.get(intent.symbolId)
        ? { symbol: symbols.bySymbolId.get(intent.symbolId)! }
        : {}),
    };

    const decision = await gate({
      intent: intent as OrderIntent,
      ctx,
      mode: cfg.mode,
      rules,
      client,
      record,
    });

    // The refusal a human reads first. Every rule states the proposed value, the
    // limit, and the arithmetic connecting them — see docs/design-standards.md.
    const forwarded = cfg.mode === 'observe' || decision.outcome === 'ALLOW';
    const header =
      decision.outcome === 'ALLOW'
        ? 'ALLOW'
        : `${decision.outcome}${decision.code ? ` (${decision.code})` : ''}` +
          (cfg.mode === 'observe' ? ' [observe mode — forwarded anyway]' : '');

    return {
      content: [
        {
          type: 'text' as const,
          text:
            `${header}: ${decision.reason}\n` +
            `mode=${cfg.mode} forwarded=${forwarded}\n` +
            `Journalled to journal/decisions.jsonl`,
        },
      ],
      isError: decision.outcome !== 'ALLOW' && cfg.mode === 'enforce',
    };
  },
);

/**
 * Pass-through mutations. Proxied but not evaluated in v1.
 *
 * These MUST be exposed even though they aren't gated: Preflight holds the only
 * trading credential, so if it didn't proxy them the trader could no longer
 * close a position at all.
 *
 * amend_position is the known gap — quirk Q-R10 means omitting takeProfit
 * silently deletes it. See docs/platform-findings.md.
 */
const PASS_THROUGH = [
  ['close_position', 'Close a position (proxied, not policy-evaluated)'],
  ['amend_position', 'Amend a position (proxied, not policy-evaluated — see Q-R10)'],
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
