# Design standards

Two standards this build holds itself to, both deliberate rather than incidental.

---

## Every refusal explains itself

**Every rule must emit the proposed value, the limit, and the arithmetic connecting
them. A rule that cannot produce such a string isn't finished.**

Useless:

```
max-lots-per-symbol: DENY
```

Sufficient:

```
1.00 lots XAUUSD = 100 oz notional, limit 0.50 lots
risk 4.2% exceeds limit 2.0% — SL 30 pips × €10.00/pip × 1.0 lot = €300 against €10,000 equity
```

### Why prose rather than structured fields

An earlier design attached structured `observed` and `threshold` values to every rule
result, so a decision could be re-evaluated programmatically. That was dropped, and the
reason is worth keeping.

The property that actually matters is: **can a human reading one journal line cold judge
whether the refusal was correct?** Against that test, the second example above beats any
schema. A reader can check the multiplication, disagree with the limit, or spot a wrong
contract size — without a replay engine, and without knowing the codebase.

Structured fields serve machine re-evaluation, which serves a false-block metric this
build cannot produce at single-digit sample size. The string serves the human, today.

### Where it comes from

This applies a criterion for good SDK design — *"errors say what to do, not just what
broke"* — to policy decisions. A gate that refuses without explaining is
indistinguishable from a gate that is broken, and a trader who can't tell the difference
will switch it off.

---

## The evaluator is never a model

Rules are pure functions over a normalized intent and a context snapshot. No network, no
clock read inside a rule, no LLM call. Same input, same verdict, every time — asserted by
a determinism test.

A rule that lives only in a prompt is not a control. That's the entire thesis, and it's
why a "policy skill" layered over cTrader's own MCP was rejected as an architecture: it
would put the rules back inside the thing being governed.

Context is a **parameter**, never something a rule fetches. The two shipped rules
deliberately differ in what they require — `mandatory-stop-loss` needs nothing but the
intent, `max-lots-per-symbol` needs symbol metadata and policy — which forces the engine
interface to pass context in rather than letting rules reach out for it.

---

## Testing

Test-first on everything that ships, with the **failing test committed separately from
its implementation**. The red-then-green git history is the evidence, and it cannot be
reconstructed afterwards.

### The most important test isn't a rule test

It asserts that **a denial never reaches the broker**, using a fake cTrader client that
records calls:

| Scenario | Expected |
|---|---|
| `enforce` + `DENY` | client called **zero** times |
| `enforce` + `ALLOW` | called **exactly once** |
| `observe` + `DENY` | called **once**, and the journal records the refusal |

That third row is the one a reviewer would most doubt, and it's what shadow mode lives or
dies on.

### Also covered

- **Golden conversion tables** — lots→volume for EURUSD (`lotSize` 100,000) beside
  XAUUSD (100), and pipettes↔display. This is where a silent 1000× error lives, so the
  values are hand-checked rather than derived from the code under test.
- **Determinism** — the same intent evaluated twice yields an identical `Decision`.

### Deliberately not unit-tested

Transport and MCP wiring. Both are covered by the live end-to-end run against the real
remote MCP instead — unit-testing a transport costs more than it's worth at this scale,
and a passing mock proves nothing about a live broker.
