# Preflight — technical specification (Level 1)

**A deterministic pre-trade policy gate for cTrader AI Agent Connect.**
The model proposes; this decides.

---

## Problem

cTrader AI Agent Connect (May 2026) lets an AI agent place, modify and close **real
orders** through the official remote MCP server. The only control shipped today is a
client-side confirmation click, plus a disclaimer that the trader bears responsibility.

Three gaps follow from that:

1. **No deterministic evaluation before execution.** cTrader's docs include example
   "risk" prompts — check margin utilisation, estimate the impact of a price move — but
   these are advisory. The agent computes an answer in its own reasoning *when asked*.
   Nothing is applied to every intent, always, the same way twice.
2. **No record of refusals.** cTrader records what executed. If an agent proposes
   something reckless and a human waves it away, that event leaves no trace — so there
   is no way to learn whether the agent is trending safer or worse.
3. **Permission is all-or-nothing.** The remote MCP exposes two profiles: `data`
   (read-only) and `trading` (reads plus every mutation). There is no middle setting
   like "may trade, but only within these limits."

A confirmation dialog is not a control. It looks identical whether the order in front of
you is sane or catastrophic, it arrives when attention is lowest, and it degrades with
repetition — the twentieth confirmation gets the same glance as the first.

## Who it's for

**An individual trader running an AI agent against their own cTrader account.**

They want the agent's speed and availability, but not the tail risk of an agent that
misreads a position size, omits a stop loss, or acts on a hallucinated instruction. They
are willing to write down their own limits once. They are not willing to review every
order by hand — that would remove the reason for using an agent at all.

Explicitly *not* targeted in this version: brokers imposing limits across many accounts,
and prop firms enforcing funded-account rules. Both are natural extensions; neither can
be demonstrated credibly from a single demo account.

## Solution

Preflight is a **local MCP server that exclusively holds the cTrader `trading`
credential**. The agent is given cTrader's `data` profile plus Preflight — and no direct
mutation tools at all.

```
Agent ──┬── ctrader   → .../data/mcp      read-only: balance, symbols, prices, positions
        └── preflight → stdio (local)
               ├─ normalize + validate    Zod; malformed input → ERROR
               ├─ rule engine             pure, deterministic, no LLM, no I/O
               ├─ journal                 append-only JSONL, every decision
               └─ ctrader client ──→ .../trading/mcp   ← the only path to the broker
```

Because the agent never holds the `trading` credential, a denial is not advice the agent
may decline to take — the tool does not exist in its surface. This is the missing middle
between `data` and `trading`.

**The evaluator is not an LLM call.** Rules are pure functions over a normalized intent
and a context snapshot. Same input, same verdict, every time. A rule that lives only in a
prompt is not a control.

### Two modes, and why

`observe` — evaluates, journals, and forwards *anyway*, recording what it would have
blocked. `enforce` — a denial terminates.

Shadow-then-enforce is how policy systems are actually deployed: run alongside, prove it
isn't over-blocking, then make it binding. It also gives the journal a second job — it
stops being an audit log and becomes the evidence that justifies promotion.

### Three outcomes

| Outcome | Meaning |
|---|---|
| `ALLOW` | Evaluated, passed |
| `DENY` | A policy rule refused it — *the only class a false-block metric should count* |
| `ERROR` | The gate could not judge: malformed input, or unknown symbol metadata |

Separating `DENY` from `ERROR` matters. A missing config row is not a policy decision,
and conflating the two makes any future quality metric measure config completeness
instead of policy correctness.

### Rules

Authored in `policy.yaml` — an external file the trader edits, validated by Zod at
startup, which **refuses to start** on a malformed or missing policy rather than falling
back to defaults. YAML rather than JSON specifically for comments: a policy file is where
someone records *why* a limit is what it is.

- **`mandatory-stop-loss`** — presence check on the intent alone.
- **`max-lots-per-symbol`** — intent + symbol metadata + policy; converts `volume` to
  lots via the symbol's `lotSize` and compares against a per-symbol limit.

The two rules deliberately differ in **what context they require** — one needs nothing
but the intent, the other needs live metadata. That forces context to be a parameter of
the engine rather than something a rule reaches out and fetches.

**Reason-string standard.** Every rule must emit the proposed value, the limit, and the
arithmetic connecting them:

```
1.00 lots XAUUSD = 100 oz notional, limit 0.50 lots
```

Self-auditing prose beats structured fields: a human can check the multiplication,
disagree with the limit, or spot a wrong contract size without any replay machinery. This
is the SDK-quality principle *"errors say what to do, not just what broke"* applied to
policy decisions.

## How it uses the cTrader remote MCP

**Preflight (the app) handles**, deterministically, with no model in the loop:
normalization and schema validation, symbol metadata resolution, rule evaluation, the
`observe`/`enforce` branch, journaling, and the decision to forward or refuse.

**The agent handles**: understanding what the trader wants, choosing an instrument and a
size, and reading account state to inform that choice. It proposes; it never executes.

**Read path — `data` profile, called by the agent directly**
`get_balance` (equity for context) · `get_symbols` (symbolId ↔ name, `enabled`) ·
`get_spot_prices` (live quotes) · `get_positions` · `get_assets`

**Write path — `trading` profile, called only by Preflight**
`create_order` **(gated)** · `amend_order`, `cancel_order`, `close_position`,
`amend_position` (proxied and journaled, not evaluated in v1)

All five mutations are proxied, not just the gated one — otherwise the trader could no
longer close a position, since those tools no longer exist in the agent's surface.

**Preflight mirrors cTrader's `create_order` schema exactly** — same `symbolId`, `volume`
in cents, `relativeStopLoss` in points. A drop-in replacement: swapping the config cannot
break a prompt that already worked, and there is no unit translation to get wrong.

### A finding that shapes the design

Remote MCP **exposes no per-symbol contract specifications**. Verified three ways: the
live `tools/list` returns 16 tools with no `get_symbol_details`; `get_symbols` returns
seven fields across all 481 symbols, none of them `pipDigits`, `lotSize` or `minVolume`;
and the official account and analysis documentation covers symbol *availability* only.
`lotSize` appears solely in *input* descriptions, warning that the authoritative value
lives broker-side.

So Preflight's arithmetic cannot be sourced from the system it polices. It carries
`symbols.yaml`, hand-transcribed from the cTrader Web Symbol Info panel with provenance
recorded, and **fails closed**: an unknown symbol returns `ERROR`, never a guess. Guessing
is how a 0.01-lot XAUUSD order becomes a 1000× oversize position — the exact trap
cTrader's own tool description warns about.

Related, and also handled in normalization: market data is returned in **pipettes**
(EURUSD bid `115502`) while order inputs take **display** prices (`1.15502`). Mixing them
produces a silently wrong fill at 10⁵ the intended price, so any 5+ digit integer in a
display-price field is rejected as malformed.

## Scope

**In:** the proxy architecture with `observe`/`enforce`; `create_order` gated by two
rules; all five mutations proxied and journaled; append-only JSONL journal;
fail-closed symbol metadata; malformed-price rejection; test-first coverage of the
deterministic core plus a test asserting a denial never reaches the broker; a live
end-to-end demonstration against the real remote MCP.

**Deliberately out, with reasons:**

| Cut | Why |
|---|---|
| `max-risk-per-trade` | Deposit currency is EUR; both instruments quote USD. Pip value needs a conversion chain, and remote MCP supplies no rates for it. The chain is the finding. |
| `amend_position` gating | Quirk `Q-R10`: omitting `takeProfit` **silently deletes it**. A real footgun and the next thing worth building — but a second, differently-shaped evaluator. |
| Hash-chained journal | Tamper-evidence is narrative at demo scale. JSONL is schemaless, so adding it later costs nothing. |
| `symbol-allowlist` | Redundant: fail-closed metadata already refuses everything not in `symbols.yaml`. |
| Multi-account, UI, live-account guards | Not needed to prove the thesis in the time available. |

## Success metrics

1. **Zero policy-violating orders reach the broker.** Every intent that violates an
   active rule is refused, and nothing corresponding to it appears in cTrader's order
   history. Auditable by diffing `journal/decisions.jsonl` against `get_order_history` —
   binary, and measurable today rather than after a pilot.

2. **Time from install to first enforced rule.** How long it takes a trader to go from
   cloning the repo to seeing a real order refused for a reason they wrote themselves.
   This deliberately mirrors the *time-to-first-app* metric Purple already tracks for
   Hello Purple: if the value is in the rails, the number that matters is how fast
   someone reaches their first meaningful interaction with them.

## Known limitations

- **Preflight is bypassable.** Enforcement is by *tool availability*, not by the broker.
  A user who re-adds the `trading` profile to their MCP config defeats it entirely. This
  is a real limitation, not an implementation gap: genuine enforcement belongs
  server-side at the broker — which is the argument for this being a platform
  capability rather than a bolt-on.
- **Symbol metadata is a build-time snapshot**, hand-transcribed and broker-specific. A
  wrong value yields a confident wrong verdict. Production needs a metadata sync against
  broker reference data.
- **The journal is local and unsigned.** Durable against crashes, not against a
  determined local user.
