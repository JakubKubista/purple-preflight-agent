import { describe, it, expect } from 'vitest';
import { checkAmendPreservesLegs } from './amend-guard.js';

/**
 * Quirk Q-R10, the scariest thing found during this build.
 *
 * On cTrader's remote MCP, amend_position REMOVES an omitted SL/TP leg rather
 * than preserving it. A position holds both stopLoss and takeProfit; you call
 * amend_position(positionId, stopLoss: <tighter>) to protect a winning trade;
 * the take-profit is silently deleted. No error at any layer, and the trader
 * finds out when the trade runs past a target that no longer exists.
 *
 * Passing takeProfit: null doesn't help — the schema declares it non-nullable
 * and rejects it outright. The only safe amend re-passes both legs.
 *
 * This guard is deliberately NOT policy-configurable. "Don't silently delete
 * the other leg" is a boolean whose only sane value is true; putting it in
 * policy.yaml would invent a setting inviting someone to switch correctness off.
 */

const bothLegs = { positionId: 1, stopLoss: 1.15, takeProfit: 1.16 };
const stopOnly = { positionId: 1, stopLoss: 1.15 };
const naked = { positionId: 1 };

describe('amend-guard (Q-R10)', () => {
  describe('refuses amends that would silently drop a leg', () => {
    it('denies tightening the stop when a take-profit exists', () => {
      // The motivating case: entirely reasonable intent, destructive effect.
      const r = checkAmendPreservesLegs({ positionId: 1, stopLoss: 1.155 }, bothLegs);
      expect(r.pass).toBe(false);
    });

    it('denies moving the target when a stop exists', () => {
      const r = checkAmendPreservesLegs({ positionId: 1, takeProfit: 1.17 }, bothLegs);
      expect(r.pass).toBe(false);
    });

    it('denies dropping the only leg a position has', () => {
      const r = checkAmendPreservesLegs({ positionId: 1, takeProfit: 1.17 }, stopOnly);
      expect(r.pass).toBe(false);
    });

    it('denies an amend carrying no legs at all against a protected position', () => {
      // This would strip both. Nothing about the call says so.
      const r = checkAmendPreservesLegs({ positionId: 1 }, bothLegs);
      expect(r.pass).toBe(false);
    });
  });

  describe('allows amends that preserve everything', () => {
    it('allows re-passing both legs', () => {
      const r = checkAmendPreservesLegs(
        { positionId: 1, stopLoss: 1.155, takeProfit: 1.16 },
        bothLegs,
      );
      expect(r.pass).toBe(true);
    });

    it('allows amending the only leg present, since nothing can be lost', () => {
      const r = checkAmendPreservesLegs({ positionId: 1, stopLoss: 1.155 }, stopOnly);
      expect(r.pass).toBe(true);
    });

    it('allows adding a leg to an unprotected position', () => {
      const r = checkAmendPreservesLegs({ positionId: 1, stopLoss: 1.15 }, naked);
      expect(r.pass).toBe(true);
    });

    it('allows a no-op amend against an unprotected position', () => {
      expect(checkAmendPreservesLegs({ positionId: 1 }, naked).pass).toBe(true);
    });
  });

  describe('edge cases that falsiness would get wrong', () => {
    it('treats a stopLoss of 0 as a real leg, not an absent one', () => {
      // `if (position.stopLoss)` would read 0 as absent and allow it to be
      // deleted. Prices can legitimately be 0 on some instruments.
      const r = checkAmendPreservesLegs({ positionId: 1, takeProfit: 1.16 }, {
        positionId: 1,
        stopLoss: 0,
        takeProfit: 1.16,
      });
      expect(r.pass).toBe(false);
    });

    it('treats an intended stopLoss of 0 as present', () => {
      const r = checkAmendPreservesLegs(
        { positionId: 1, stopLoss: 0, takeProfit: 1.16 },
        bothLegs,
      );
      expect(r.pass).toBe(true);
    });
  });

  describe('reason string', () => {
    it('names the leg, its current value, and how to keep it', () => {
      const r = checkAmendPreservesLegs({ positionId: 1, stopLoss: 1.155 }, bothLegs);
      expect(r.reason).toMatch(/takeProfit/);
      expect(r.reason).toMatch(/1\.16/);
      expect(r.reason).toMatch(/Q-R10/);
      expect(r.reason).toMatch(/re-pass|preserve/i);
    });

    it('names both legs when both would be lost', () => {
      const r = checkAmendPreservesLegs({ positionId: 1 }, bothLegs);
      expect(r.reason).toMatch(/stopLoss/);
      expect(r.reason).toMatch(/takeProfit/);
    });

    it('states what survived when it passes', () => {
      const r = checkAmendPreservesLegs(
        { positionId: 1, stopLoss: 1.155, takeProfit: 1.16 },
        bothLegs,
      );
      expect(r.reason).toMatch(/both/i);
    });
  });

  it('is deterministic', () => {
    const a = checkAmendPreservesLegs({ positionId: 1, stopLoss: 1.155 }, bothLegs);
    const b = checkAmendPreservesLegs({ positionId: 1, stopLoss: 1.155 }, bothLegs);
    expect(a).toEqual(b);
  });

  it('is tagged as its own rule for the journal', () => {
    const r = checkAmendPreservesLegs({ positionId: 1 }, bothLegs);
    expect(r.rule).toBe('amend-preserves-legs');
  });
});
