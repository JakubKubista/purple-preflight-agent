import type { EvaluationContext, OrderIntent, Rule, RuleResult } from '../domain.js';

const RULE = 'max-lots-per-symbol';

/** Per-symbol position-size ceilings, keyed by symbolName. From policy.yaml. */
export type LotLimits = Record<string, number>;

/**
 * Caps position size per instrument.
 *
 * Where mandatory-stop-loss needs nothing but the intent, this needs the
 * intent + live symbol metadata + policy. That difference is the point: it
 * forces context to be a parameter of the engine rather than something a rule
 * reaches out and fetches, which is what keeps evaluation deterministic.
 *
 * The arithmetic is one division, and it is the whole reason symbols.yaml
 * exists:
 *
 *     volume = lots x lotSize x 100      (cTrader's wire encoding)
 *     lots   = volume / (lotSize x 100)
 *
 * lotSize is per-symbol — 100_000 for EURUSD, 100 for XAUUSD. There is no
 * universal constant, the remote MCP does not expose it, and getting it wrong
 * fails silently rather than loudly: a 0.01-lot gold order computed with the
 * forex constant is a 1000x oversize position that the broker will happily fill.
 *
 * Returns a Rule so policy stays out of the Rule signature.
 */
export function maxLotsPerSymbol(limits: LotLimits): Rule {
  return function maxLots(intent: OrderIntent, ctx: EvaluationContext): RuleResult {
    // The engine fails closed before rules run, but a rule must never invent a
    // lotSize if called directly. Guessing is the failure this rule exists to
    // prevent, so it cannot be the failure the rule itself commits.
    if (!ctx.symbol) {
      return {
        rule: RULE,
        pass: false,
        reason:
          `cannot size symbolId ${intent.symbolId}: no verified contract metadata, ` +
          `and lotSize is not guessable — it differs per instrument.`,
      };
    }

    const { symbolName, lotSize } = ctx.symbol;
    const limit = limits[symbolName];

    if (limit === undefined) {
      // Absence of a LIMIT is a policy choice — the trader didn't cap this
      // instrument. Distinct from absence of METADATA, which is a config defect
      // the engine already refuses on.
      return {
        rule: RULE,
        pass: true,
        reason: `no lot limit configured for ${symbolName}`,
      };
    }

    const lots = intent.volume / (lotSize * 100);
    const shown = Number(lots.toFixed(4));

    if (lots > limit) {
      return {
        rule: RULE,
        pass: false,
        reason:
          `${shown} lots ${symbolName} exceeds limit ${limit} lots ` +
          `(volume ${intent.volume} / (lotSize ${lotSize} x 100) = ${shown})`,
      };
    }

    return {
      rule: RULE,
      pass: true,
      reason:
        `${shown} lots ${symbolName} within limit ${limit} lots ` +
        `(volume ${intent.volume} / (lotSize ${lotSize} x 100) = ${shown})`,
    };
  };
}
