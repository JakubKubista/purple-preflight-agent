import { describe, it, expect } from 'vitest';
import { mandatoryStopLoss } from './mandatory-stop-loss.js';
import type { EvaluationContext, OrderIntent } from '../domain.js';

const ctx: EvaluationContext = {
  equity: 10_000,
  symbol: { symbolName: 'EURUSD', pipDigits: 5, lotSize: 100_000 },
  spotPrice: 1.15502,
};

/** 0.01 lots EURUSD = 0.01 x 100_000 x 100 = 100_000 cents. */
const base: OrderIntent = {
  symbolId: 1,
  orderType: 'MARKET',
  tradeSide: 'BUY',
  volume: 100_000,
};

describe('mandatory-stop-loss', () => {
  it('denies a market order with no stop loss of any kind', () => {
    const r = mandatoryStopLoss(base, ctx);
    expect(r.pass).toBe(false);
    expect(r.rule).toBe('mandatory-stop-loss');
  });

  it('accepts relativeStopLoss, the form MARKET orders must use', () => {
    // Quirk Q-R4: cTrader rejects absolute SL on MARKET orders outright.
    const r = mandatoryStopLoss({ ...base, relativeStopLoss: 300 }, ctx);
    expect(r.pass).toBe(true);
  });

  it('accepts an absolute stopLoss on a LIMIT order', () => {
    const r = mandatoryStopLoss(
      { ...base, orderType: 'LIMIT', limitPrice: 1.15, stopLoss: 1.145 },
      ctx,
    );
    expect(r.pass).toBe(true);
  });

  it('rejects a zero relativeStopLoss rather than treating it as present', () => {
    // 0 points is not a stop, and `if (intent.relativeStopLoss)` would also
    // reject it — but for the wrong reason. Be explicit that 0 is invalid.
    const r = mandatoryStopLoss({ ...base, relativeStopLoss: 0 }, ctx);
    expect(r.pass).toBe(false);
  });

  describe('reason string', () => {
    it('names what was proposed and what is required when it denies', () => {
      const r = mandatoryStopLoss(base, ctx);
      // The design standard: proposed value, the limit, and the arithmetic
      // connecting them. Here there is no arithmetic, so it must at least name
      // the order and the missing requirement in terms the trader can act on.
      expect(r.reason).toMatch(/BUY/);
      expect(r.reason).toMatch(/MARKET/);
      expect(r.reason).toMatch(/relativeStopLoss/);
      expect(r.reason.length).toBeGreaterThan(40);
    });

    it('states the stop it found when it passes', () => {
      const r = mandatoryStopLoss({ ...base, relativeStopLoss: 300 }, ctx);
      expect(r.reason).toMatch(/300/);
    });
  });

  it('is deterministic — the same intent evaluates identically twice', () => {
    expect(mandatoryStopLoss(base, ctx)).toEqual(mandatoryStopLoss(base, ctx));
  });
});
