import { describe, it, expect, beforeEach } from 'vitest';
import { gate } from './gate.js';
import { mandatoryStopLoss } from './rules/mandatory-stop-loss.js';
import type { EvaluationContext, OrderIntent, JournalEntry } from './domain.js';

/**
 * The most important test in this repo.
 *
 * Every other test checks that a rule computes the right answer. This one checks
 * that the answer is *enforced* — that a DENY has no path to the broker. If this
 * passes and everything else fails, the thesis still holds. If this fails and
 * everything else passes, Preflight is a linter.
 */

/** Records calls instead of making them, so we can assert the broker was never reached. */
class FakeCTraderClient {
  calls: OrderIntent[] = [];
  async createOrder(intent: OrderIntent): Promise<unknown> {
    this.calls.push(intent);
    return { orderId: 12345, status: 'FILLED' };
  }
}

const ctx: EvaluationContext = {
  equity: 10_000,
  symbol: { symbolName: 'EURUSD', pipDigits: 5, lotSize: 100_000 },
  spotPrice: 1.15502,
};

const rules = [mandatoryStopLoss];

/** 0.01 lots EURUSD, no stop loss — mandatory-stop-loss will refuse this. */
const denied: OrderIntent = {
  symbolId: 1,
  orderType: 'MARKET',
  tradeSide: 'BUY',
  volume: 100_000,
};

/** Same order with a 300-point stop. Passes. */
const allowed: OrderIntent = { ...denied, relativeStopLoss: 300 };

describe('gate', () => {
  let client: FakeCTraderClient;
  let journal: JournalEntry[];
  const record = (e: JournalEntry) => { journal.push(e); };

  beforeEach(() => {
    client = new FakeCTraderClient();
    journal = [];
  });

  describe('enforce mode', () => {
    it('DENY never reaches the broker', async () => {
      const d = await gate({ intent: denied, ctx, mode: 'enforce', rules, client, record });
      expect(d.outcome).toBe('DENY');
      expect(client.calls).toHaveLength(0);
    });

    it('ALLOW forwards exactly once', async () => {
      const d = await gate({ intent: allowed, ctx, mode: 'enforce', rules, client, record });
      expect(d.outcome).toBe('ALLOW');
      expect(client.calls).toHaveLength(1);
      expect(client.calls[0]).toEqual(allowed);
    });
  });

  describe('observe mode', () => {
    it('DENY forwards anyway, but the journal records the refusal', async () => {
      // This is the row a reviewer would most doubt, and it's what shadow mode
      // lives or dies on: the verdict is real, the enforcement is not yet.
      const d = await gate({ intent: denied, ctx, mode: 'observe', rules, client, record });
      expect(d.outcome).toBe('DENY');
      expect(client.calls).toHaveLength(1);
      expect(journal).toHaveLength(1);
      expect(journal[0]?.outcome).toBe('DENY');
      expect(journal[0]?.mode).toBe('observe');
    });
  });

  describe('journalling', () => {
    it('records every decision, allowed and denied alike', async () => {
      await gate({ intent: allowed, ctx, mode: 'enforce', rules, client, record });
      await gate({ intent: denied, ctx, mode: 'enforce', rules, client, record });
      expect(journal.map((e) => e.outcome)).toEqual(['ALLOW', 'DENY']);
    });

    it('carries the reason and the per-rule results', async () => {
      await gate({ intent: denied, ctx, mode: 'enforce', rules, client, record });
      const e = journal[0]!;
      expect(e.reason).toMatch(/stop loss/i);
      expect(e.rules.map((r) => r.rule)).toContain('mandatory-stop-loss');
    });

    it('records a denial even though nothing was sent', async () => {
      // A refusal that leaves no trace is the gap Preflight exists to close.
      await gate({ intent: denied, ctx, mode: 'enforce', rules, client, record });
      expect(client.calls).toHaveLength(0);
      expect(journal).toHaveLength(1);
    });
  });

  describe('ERROR is not a policy decision', () => {
    it('returns ERROR, not DENY, when symbol metadata is missing', async () => {
      const d = await gate({
        intent: allowed,
        ctx: { equity: 10_000 }, // no symbol metadata
        mode: 'enforce',
        rules,
        client,
        record,
      });
      expect(d.outcome).toBe('ERROR');
      expect(d.code).toBe('unknown_symbol_metadata');
    });

    it('does not forward on ERROR in enforce mode', async () => {
      await gate({
        intent: allowed, ctx: { equity: 10_000 }, mode: 'enforce', rules, client, record,
      });
      expect(client.calls).toHaveLength(0);
    });
  });

  it('is deterministic — the same intent decides identically twice', async () => {
    const a = await gate({ intent: denied, ctx, mode: 'enforce', rules, client, record });
    const b = await gate({ intent: denied, ctx, mode: 'enforce', rules, client, record });
    expect(a).toEqual(b);
  });
});
