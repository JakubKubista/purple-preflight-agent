/**
 * Core types for the deterministic gate.
 *
 * Nothing here touches the network, the filesystem, or the clock. Rules are pure
 * functions over these shapes, so the same intent always yields the same Decision.
 * That is the whole thesis: the model proposes, this decides.
 */

/** How Preflight treats a DENY. See docs/architecture.md. */
export type Mode = 'observe' | 'enforce';

/**
 * Three outcomes, not four.
 *
 * ALLOW and DENY are policy results. ERROR means the gate could not render a
 * policy judgment at all — malformed input, or a symbol we have no verified
 * metadata for. The distinction matters: a missing config row stops an order but
 * isn't the policy working, and counting it as one would make a false-block rate
 * measure config completeness instead of policy correctness.
 */
export type Outcome = 'ALLOW' | 'DENY' | 'ERROR';

/** Why the gate couldn't judge. Only ever set alongside outcome 'ERROR'. */
export type ErrorCode = 'malformed_price' | 'unknown_symbol_metadata' | 'malformed_request';

/**
 * A normalized create_order intent.
 *
 * Deliberately mirrors cTrader's own create_order schema — same symbolId, same
 * volume in cents, same relativeStopLoss in points. Preflight is a drop-in
 * replacement, so there is no unit translation anywhere in the request path.
 * Unit translation is exactly where silent 1000x errors live.
 */
export interface OrderIntent {
  symbolId: number;
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'MARKET_RANGE' | 'STOP_LIMIT';
  tradeSide: 'BUY' | 'SELL';
  /** 1/100 of the base asset. volume = lots x lotSize x 100. */
  volume: number;
  /** Absolute DISPLAY price. Rejected by cTrader on MARKET orders (quirk Q-R4). */
  stopLoss?: number;
  takeProfit?: number;
  /** Positive integer distance in POINTS from fill price. The MARKET-order form. */
  relativeStopLoss?: number;
  relativeTakeProfit?: number;
  limitPrice?: number;
  stopPrice?: number;
  label?: string;
  comment?: string;
}

/** Per-symbol contract facts the remote MCP does not expose. Hand-verified. */
export interface SymbolMeta {
  symbolName: string;
  /** display price = pipettes / 10^pipDigits */
  pipDigits: number;
  /** Units of base asset in one lot. 100_000 for EURUSD, 100 for XAUUSD. */
  lotSize: number;
  minVolume?: number;
  maxVolume?: number;
}

/** Everything a rule may read, passed in rather than fetched. */
export interface EvaluationContext {
  /** Deposit-currency equity, already scaled out of moneyDigits. */
  equity: number;
  /** Undefined when we have no verified metadata for the symbol. */
  symbol?: SymbolMeta;
  spotPrice?: number;
}

export interface RuleResult {
  rule: string;
  pass: boolean;
  /**
   * Must state the proposed value, the limit, and the arithmetic connecting them.
   * A rule that cannot produce this string isn't finished.
   * See docs/design-standards.md.
   */
  reason: string;
}

export interface Decision {
  outcome: Outcome;
  /** Set only when outcome is 'ERROR'. */
  code?: ErrorCode;
  /** The refusal a human reads first. */
  reason: string;
  rules: RuleResult[];
}

/** A rule is pure: same inputs, same result, no I/O. */
export type Rule = (intent: OrderIntent, ctx: EvaluationContext) => RuleResult;

/**
 * One line of the decision journal.
 *
 * Deliberately minimal. An earlier design carried a full replayable context
 * snapshot and structured observed/threshold values per rule; both were cut. The
 * property that matters is whether a human reading one line cold can judge
 * whether the refusal was correct — and for that, a reason string carrying the
 * arithmetic beats any schema. See docs/design-standards.md.
 *
 * `forwarded` is intentionally absent: it is derivable from mode + outcome, and
 * stored state that can drift is worse than derived state.
 */
export interface JournalEntry {
  ts: string;
  mode: Mode;
  tool: string;
  /** Shape depends on `tool`. Structural rather than imported, to avoid a cycle. */
  intent: OrderIntent | { positionId: number; stopLoss?: number; takeProfit?: number };
  outcome: Outcome;
  code?: ErrorCode;
  reason: string;
  rules: RuleResult[];
  equity?: number;
  spotPrice?: number;
  brokerResponse?: unknown;
}

/** Sink for journal entries. Injected so the gate stays testable and pure-ish. */
export type JournalRecorder = (entry: JournalEntry) => void;

/** The only part of cTrader the gate depends on — faked in tests. */
export interface CTraderClient {
  createOrder(intent: OrderIntent): Promise<unknown>;
}

/** True when the decision permits forwarding to the broker under `mode`. */
export function shouldForward(outcome: Outcome, mode: Mode): boolean {
  if (mode === 'observe') return true;
  return outcome === 'ALLOW';
}
