import { shouldForward } from './domain.js';
import type { Decision, JournalEntry, JournalRecorder, Mode } from './domain.js';

export interface GateInput {
  /** Already evaluated. HOW a verdict is reached stays per-tool, outside this function. */
  decision: Decision;
  intent: JournalEntry['intent'];
  /** Recorded in the journal, and what a human reading it back searches by. */
  tool: string;
  mode: Mode;
  /** Submits the intent to the broker. Called only when the decision permits it. */
  forward: () => Promise<unknown>;
  record: JournalRecorder;
  equity?: number;
  spotPrice?: number;
  /** Injected so entries are reproducible in tests. Defaults to now. */
  now?: () => Date;
}

export interface GateResult {
  decision: Decision;
  forwarded: boolean;
}

/**
 * The enforcement pipeline: decide whether to forward, forward, journal.
 *
 * Shared across every gated tool — create_order and amend_position both call
 * this with an already-computed Decision. How that Decision is reached differs
 * per tool (engine.ts's declarative rules for create_order; amend-guard.ts's
 * hardcoded check for amend_position) and stays outside this function on
 * purpose, per the "no shared rule engine across tools" decision in
 * docs/architecture.md. What IS shared is everything downstream of a verdict:
 * the observe/enforce branch, the forward, the journal write. `forward` takes
 * no argument — callers close over the intent they already have, so this
 * function never needs to know its shape beyond what JournalEntry stores.
 *
 * The ordering matters: nothing is forwarded before a verdict exists, and the
 * journal is written whether or not anything was sent. A refusal that leaves no
 * trace is precisely the gap Preflight exists to close.
 */
export async function gate(input: GateInput): Promise<GateResult> {
  const { decision, intent, tool, mode, forward, record, equity, spotPrice, now = () => new Date() } =
    input;

  const forwarded = shouldForward(decision.outcome, mode);
  let brokerResponse: unknown;
  if (forwarded) brokerResponse = await forward();

  record({
    ts: now().toISOString(),
    mode,
    tool,
    intent,
    outcome: decision.outcome,
    ...(decision.code ? { code: decision.code } : {}),
    reason: decision.reason,
    rules: decision.rules,
    ...(equity !== undefined ? { equity } : {}),
    ...(spotPrice !== undefined ? { spotPrice } : {}),
    ...(brokerResponse !== undefined ? { brokerResponse } : {}),
  });

  return { decision, forwarded };
}
