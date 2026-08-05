import type { EvaluationContext, OrderIntent, RuleResult } from '../domain.js';

const RULE = 'mandatory-stop-loss';

/**
 * Refuses any order that carries no stop loss.
 *
 * This is the cheapest protection against the most common agent failure: a naked
 * market order. It needs nothing but the intent — no account state, no market
 * data — which is why it's the rule that ships first.
 *
 * cTrader accepts a stop in two mutually exclusive forms, and which one is legal
 * depends on the order type (quirk Q-R4):
 *
 *   MARKET / MARKET_RANGE  -> relativeStopLoss, a positive integer of POINTS
 *                             offset from the fill price. Absolute stopLoss is
 *                             rejected by the broker outright, because the fill
 *                             price isn't known at send time.
 *   LIMIT / STOP / STOP_LIMIT -> absolute stopLoss, a DISPLAY price.
 *
 * We accept either and let normalization enforce which is legal where. This rule
 * answers one question only: is there a stop at all?
 */
export function mandatoryStopLoss(
  intent: OrderIntent,
  _ctx: EvaluationContext,
): RuleResult {
  const relative = intent.relativeStopLoss;
  const absolute = intent.stopLoss;

  // Explicit about 0 and negatives. `if (relative)` would reject 0 too, but for
  // the wrong reason — and would silently accept a negative, which cTrader's
  // schema declares exclusiveMinimum: 0.
  const hasRelative = typeof relative === 'number' && relative > 0;
  const hasAbsolute = typeof absolute === 'number' && absolute > 0;

  if (hasRelative) {
    return {
      rule: RULE,
      pass: true,
      reason: `stop loss present: ${relative} points from fill price`,
    };
  }

  if (hasAbsolute) {
    return {
      rule: RULE,
      pass: true,
      reason: `stop loss present: absolute price ${absolute}`,
    };
  }

  const form =
    intent.orderType === 'MARKET' || intent.orderType === 'MARKET_RANGE'
      ? 'relativeStopLoss (points from fill price)'
      : 'stopLoss (absolute price) or relativeStopLoss (points from fill price)';

  return {
    rule: RULE,
    pass: false,
    reason:
      `${intent.tradeSide} ${intent.orderType} order carries no stop loss; ` +
      `policy requires one. Set ${form}.`,
  };
}
