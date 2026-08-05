import { evaluate } from './engine.js';
import { shouldForward } from './domain.js';
import type {
  CTraderClient,
  Decision,
  EvaluationContext,
  JournalRecorder,
  Mode,
  OrderIntent,
  Rule,
} from './domain.js';

export interface GateInput {
  intent: OrderIntent;
  ctx: EvaluationContext;
  mode: Mode;
  rules: Rule[];
  client: CTraderClient;
  record: JournalRecorder;
  /** Injected so entries are reproducible in tests. Defaults to now. */
  now?: () => Date;
}

/**
 * The enforcement pipeline: evaluate, decide whether to forward, journal.
 *
 * This is the part shared across every gated tool — the decision type, the
 * observe/enforce branch, the journal write, the forward. How a verdict is
 * *reached* stays per-tool (see engine.ts for create_order); duplicating this
 * would mean implementing observe mode twice and maintaining two journal shapes.
 *
 * The ordering matters: nothing is forwarded before a verdict exists, and the
 * journal is written whether or not anything was sent. A refusal that leaves no
 * trace is precisely the gap Preflight exists to close.
 */
export async function gate(input: GateInput): Promise<Decision> {
  const { intent, ctx, mode, rules, client, record, now = () => new Date() } = input;

  const decision = evaluate(intent, ctx, rules);

  let brokerResponse: unknown;
  if (shouldForward(decision.outcome, mode)) {
    brokerResponse = await client.createOrder(intent);
  }

  record({
    ts: now().toISOString(),
    mode,
    tool: 'create_order',
    intent,
    outcome: decision.outcome,
    ...(decision.code ? { code: decision.code } : {}),
    reason: decision.reason,
    rules: decision.rules,
    ...(ctx.equity !== undefined ? { equity: ctx.equity } : {}),
    ...(ctx.spotPrice !== undefined ? { spotPrice: ctx.spotPrice } : {}),
    ...(brokerResponse !== undefined ? { brokerResponse } : {}),
  });

  return decision;
}
