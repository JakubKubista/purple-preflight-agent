import type {
  Decision,
  EvaluationContext,
  OrderIntent,
  Rule,
  RuleResult,
} from './domain.js';

/**
 * Evaluates an intent against the rule set. Pure — no I/O, no clock, no model.
 *
 * Context is a parameter rather than something rules reach out and fetch. That's
 * what makes the same intent decide identically every time, and it's why rules
 * with different context requirements (intent-only vs intent + live metadata)
 * can share one interface.
 */
export function evaluate(
  intent: OrderIntent,
  ctx: EvaluationContext,
  rules: Rule[],
): Decision {
  // Fail closed before any rule runs. Without verified contract metadata we
  // cannot convert volume to lots or points to prices, and guessing lotSize is
  // how a 0.01-lot XAUUSD order becomes a 1000x oversize position.
  //
  // This is ERROR, not DENY: the policy didn't refuse anything, the gate simply
  // couldn't judge. Conflating the two would make a false-block rate measure
  // config completeness instead of policy correctness.
  if (!ctx.symbol) {
    return {
      outcome: 'ERROR',
      code: 'unknown_symbol_metadata',
      reason:
        `no verified contract metadata for symbolId ${intent.symbolId}; ` +
        `refusing to guess lotSize or pipDigits. Add it to symbols.yaml.`,
      rules: [],
    };
  }

  const results: RuleResult[] = rules.map((rule) => rule(intent, ctx));
  const failed = results.filter((r) => !r.pass);

  if (failed.length > 0) {
    return {
      outcome: 'DENY',
      reason: failed.map((r) => r.reason).join(' | '),
      rules: results,
    };
  }

  return {
    outcome: 'ALLOW',
    reason: `${results.length} rule(s) passed`,
    rules: results,
  };
}
