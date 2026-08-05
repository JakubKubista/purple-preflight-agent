import { describe, it, expect } from 'vitest';
import { maxLotsPerSymbol } from './max-lots-per-symbol.js';
import type { EvaluationContext, OrderIntent } from '../domain.js';

/**
 * The rule that exercises the lotSize trap.
 *
 * cTrader's volume is 1/100 of the base asset: volume = lots x lotSize x 100.
 * lotSize is per-symbol and differs by instrument class — 100_000 for EURUSD,
 * 100 for XAUUSD. Reuse the forex constant on gold and a 0.01-lot order becomes
 * a 1000x oversize position, silently. cTrader's own tool description calls this
 * "the single most common sizing mistake".
 *
 * So these tests hand-check the arithmetic rather than deriving it from the code
 * under test.
 */

const eurusd: EvaluationContext = {
  equity: 10_000,
  symbol: { symbolName: 'EURUSD', pipDigits: 5, lotSize: 100_000 },
};

const xauusd: EvaluationContext = {
  equity: 10_000,
  symbol: { symbolName: 'XAUUSD', pipDigits: 3, lotSize: 100 },
};

const limits = { EURUSD: 1.0, XAUUSD: 0.5 };

function order(volume: number, symbolId = 1): OrderIntent {
  return { symbolId, orderType: 'MARKET', tradeSide: 'BUY', volume, relativeStopLoss: 300 };
}

describe('max-lots-per-symbol', () => {
  describe('EURUSD — lotSize 100,000', () => {
    // 1 lot = 100_000 x 100 = 10_000_000 cents
    it('passes 0.01 lots against a 1.00 limit', () => {
      expect(maxLotsPerSymbol(limits)(order(100_000), eurusd).pass).toBe(true);
    });

    it('passes exactly at the limit', () => {
      expect(maxLotsPerSymbol(limits)(order(10_000_000), eurusd).pass).toBe(true);
    });

    it('denies 2.00 lots against a 1.00 limit', () => {
      expect(maxLotsPerSymbol(limits)(order(20_000_000), eurusd).pass).toBe(false);
    });
  });

  describe('XAUUSD — lotSize 100, the trap', () => {
    // 1 lot = 100 x 100 = 10_000 cents. NOT 10_000_000.
    it('reads 10,000 cents as 1.00 lot, not 0.001', () => {
      // With the forex constant this would compute 0.001 lots and sail through.
      const r = maxLotsPerSymbol(limits)(order(10_000, 41), xauusd);
      expect(r.pass).toBe(false); // 1.00 > 0.50 limit
      expect(r.reason).toMatch(/1(\.0+)? lots/);
    });

    it('passes 0.25 lots', () => {
      expect(maxLotsPerSymbol(limits)(order(2_500, 41), xauusd).pass).toBe(true);
    });

    it('would NOT be caught if lotSize were wrongly 100,000', () => {
      // Guards the trap directly: the same volume against a forex-sized contract
      // is a thousandth of the position and passes. If someone "fixes" the
      // arithmetic to use a constant, this test fails.
      const wrong: EvaluationContext = {
        equity: 10_000,
        symbol: { symbolName: 'XAUUSD', pipDigits: 3, lotSize: 100_000 },
      };
      expect(maxLotsPerSymbol(limits)(order(10_000, 41), wrong).pass).toBe(true);
    });
  });

  describe('unconfigured symbols', () => {
    it('passes when the trader set no limit for that symbol', () => {
      // Absence of a LIMIT is a policy choice, unlike absence of METADATA which
      // is a config defect the engine already fails closed on.
      const r = maxLotsPerSymbol({})(order(10_000_000), eurusd);
      expect(r.pass).toBe(true);
      expect(r.reason).toMatch(/no.*limit/i);
    });
  });

  describe('reason string', () => {
    it('carries proposed lots, the limit, and the arithmetic', () => {
      const r = maxLotsPerSymbol(limits)(order(20_000_000), eurusd);
      expect(r.reason).toMatch(/2(\.0+)? lots/); // proposed
      expect(r.reason).toMatch(/1(\.0+)?/);      // limit
      expect(r.reason).toMatch(/100000|100,000/); // the lotSize doing the work
      expect(r.reason).toMatch(/20000000|20,000,000/); // the volume submitted
    });

    it('names the symbol so a multi-symbol journal is readable', () => {
      expect(maxLotsPerSymbol(limits)(order(20_000_000), eurusd).reason).toMatch(/EURUSD/);
    });
  });

  it('is deterministic', () => {
    const rule = maxLotsPerSymbol(limits);
    expect(rule(order(20_000_000), eurusd)).toEqual(rule(order(20_000_000), eurusd));
  });

  it('errors rather than guessing when metadata is absent', () => {
    // The engine fails closed before rules run, but a rule must not crash or
    // invent a lotSize if called directly.
    const r = maxLotsPerSymbol(limits)(order(10_000_000), { equity: 10_000 });
    expect(r.pass).toBe(false);
  });
});
