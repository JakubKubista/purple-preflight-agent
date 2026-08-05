import type { RuleResult } from './domain.js';

const RULE = 'amend-preserves-legs';

/** The subset of amend_position Preflight needs to judge. */
export interface AmendIntent {
  positionId: number;
  stopLoss?: number;
  takeProfit?: number;
}

/** Current broker-side state of the position being amended. */
export interface PositionLegs {
  positionId: number;
  stopLoss?: number;
  takeProfit?: number;
}

const present = (v: number | undefined): v is number => typeof v === 'number';

/**
 * Refuses an amend that would silently delete a protective leg (quirk Q-R10).
 *
 * On the remote MCP, amend_position REMOVES an omitted stopLoss or takeProfit
 * rather than leaving it untouched. So the most natural thing an agent can do —
 * tighten the stop on a trade that's moving your way — deletes the take-profit,
 * with no error anywhere in the stack. Passing `takeProfit: null` doesn't help;
 * the schema declares it non-nullable and rejects the call.
 *
 * The only safe amend re-passes every leg the position currently holds. This
 * checks exactly that, and nothing else.
 *
 * NOT routed through the declarative rule engine, and takes no policy argument.
 * "Don't silently delete the other leg" is a boolean whose only sane value is
 * true, and putting it in policy.yaml would invent a setting whose sole purpose
 * would be switching correctness off. Contrast max-lots-per-symbol, which is a
 * factory over limits precisely because those ARE a trader's choice.
 *
 * Note this deliberately does not judge whether the new levels are sensible —
 * widening a stop is a risk decision and belongs to policy. This answers one
 * question: does the call preserve what's already there?
 */
export function checkAmendPreservesLegs(
  intent: AmendIntent,
  position: PositionLegs,
): RuleResult {
  const lost: string[] = [];

  if (present(position.stopLoss) && !present(intent.stopLoss)) {
    lost.push(`stopLoss ${position.stopLoss}`);
  }
  if (present(position.takeProfit) && !present(intent.takeProfit)) {
    lost.push(`takeProfit ${position.takeProfit}`);
  }

  if (lost.length > 0) {
    return {
      rule: RULE,
      pass: false,
      reason:
        `amend of position ${position.positionId} would remove ${lost.join(' and ')} — ` +
        `amend_position deletes omitted legs rather than preserving them (Q-R10). ` +
        `Re-pass ${lost.length > 1 ? 'both values' : 'that value'} to preserve ` +
        `${lost.length > 1 ? 'them' : 'it'}.`,
    };
  }

  const held = [
    present(position.stopLoss) ? 'stopLoss' : undefined,
    present(position.takeProfit) ? 'takeProfit' : undefined,
  ].filter((x): x is string => x !== undefined);

  if (held.length === 0) {
    return {
      rule: RULE,
      pass: true,
      reason: `position ${position.positionId} holds no protective legs; nothing to lose`,
    };
  }

  return {
    rule: RULE,
    pass: true,
    reason:
      held.length === 2
        ? `amend re-passes both legs; nothing removed`
        : `amend preserves ${held[0]}, the only leg held`,
  };
}
