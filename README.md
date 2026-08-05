# Preflight

**A deterministic pre-trade policy gate for cTrader AI Agent Connect.**
The model proposes; this decides.

cTrader AI Agent Connect lets an AI agent place, modify and close real orders through
the official remote MCP server. The only control shipped today is a client-side
confirmation click, and nothing is recorded when an action is refused — only what
executed. Preflight sits in that gap: it evaluates an agent's stated intent against
rules you define, allows or denies on a clear verdict, and journals every decision
including the refusals.

The evaluator is never an LLM call. A rule that lives only in a prompt is not a control.

---

## Status — read this first

This is a **4-hour case study build** (2026-08-05), not a product. `SPEC.md` is the
specification, `PLAN.md` the decision record, `DIARY.md` what actually happened —
including where it broke.

Design, specification and platform findings are complete and committed. **The
implementation is unfinished.** The session spent its budget on design rigour and on two
document audits that caught real defects. What that cost, and the reasoning behind each
scope cut, is in `DIARY.md` rather than smoothed over.

Check the git log for what is actually green: rules are committed test-first, with the
failing test in a separate commit from its implementation.

## How it works

```
Agent  ──┬── ctrader MCP  → https://mcp.ctrader.com/data/mcp     read-only
         │                  balance, symbols, prices, positions
         │
         └── preflight    → stdio, local process
                ├─ normalize + validate   Zod; malformed price → ERROR
                ├─ rule engine            pure, deterministic, no LLM, no I/O
                ├─ journal                append-only JSONL, every decision
                └─ ctrader client ──→ https://mcp.ctrader.com/trading/mcp
                                      ↑ Preflight alone holds this credential
```

The agent gets cTrader's **`data`** profile plus Preflight — and no direct mutation tools
at all. Because it never holds the `trading` credential, a denial isn't advice the agent
may decline to take: the tool simply doesn't exist in its surface.

The remote MCP ships exactly two permission levels, `data` and `trading`, with nothing
between them. Preflight is that missing middle.

### Two modes

| Mode | Behaviour |
|---|---|
| `observe` | Evaluates, journals, and **forwards anyway** — recording what it *would* have blocked |
| `enforce` | A denial terminates; nothing reaches the broker |

Shadow-then-enforce is how policy systems are actually deployed: run alongside, prove it
isn't over-blocking, then make it binding. It also gives the journal a second job — it
stops being an audit log and becomes the evidence that justifies promotion.

### Three outcomes

| Outcome | Meaning |
|---|---|
| `ALLOW` | Evaluated, passed |
| `DENY` | A policy rule refused it — **the only class a false-block metric should count** |
| `ERROR` | The gate could not judge: malformed input, or unknown symbol metadata |

`DENY` and `ERROR` are deliberately separate. A missing config row is not a policy
decision, and conflating the two would make any future quality metric measure config
completeness instead of policy correctness.

## Design standard: every refusal explains itself

Every rule **must** emit the proposed value, the limit, and the arithmetic connecting
them:

```
1.00 lots XAUUSD = 100 oz notional, limit 0.50 lots
risk 4.2% exceeds limit 2.0% — SL 30 pips × €10.00/pip × 1.0 lot = €300 against €10,000 equity
```

A rule that cannot produce such a string isn't finished.

This is deliberate, not incidental. Self-auditing prose beats structured fields: a human
can check the multiplication, disagree with the limit, or spot a wrong contract size
without any replay machinery. It applies the SDK-quality principle *"errors say what to
do, not just what broke"* to policy decisions.

## Running it

Requires Node 22+ and a cTrader remote MCP token.

```bash
npm install
cp .env.example .env      # add your cTrader slug
npm test                  # the deterministic core
npm start                 # stdio MCP server
```

Then point your agent at the **`data`** profile and Preflight, and remove the `trading`
profile — that removal is what makes the gate real:

```jsonc
{
  "mcpServers": {
    "ctrader":   { "type": "http", "url": "https://mcp.ctrader.com/data/mcp",
                   "headers": { "Authorization": "Bearer <your-slug>" } },
    "preflight": { "command": "npx", "args": ["tsx", "src/server.ts"] }
  }
}
```

Preflight reads the `trading` slug from `.env`. Nothing else should hold it.

## Platform findings

Two things found by probing the live server that contradict Spotware's own
documentation. Both are handled in code.

**Remote MCP exposes no per-symbol contract specifications.** Verified three ways: the
live `tools/list` returns 16 tools with no `get_symbol_details`; `get_symbols` returns
seven fields across all 481 symbols, none of them `pipDigits`, `lotSize` or `minVolume`;
the official account and analysis docs cover symbol *availability* only. Spotware's own
skill documentation states `pipDigits` is resolvable via `get_symbols` — it isn't.

So Preflight's arithmetic can't be sourced from the system it polices. It carries
`symbols.yaml`, hand-transcribed from the cTrader Web Symbol Info panel with provenance
recorded, and **fails closed**: an unknown symbol returns `ERROR`, never a guess.
Guessing is how a 0.01-lot XAUUSD order becomes a 1000× oversize position.

**Price encoding is asymmetric.** Market data comes back in *pipettes* (EURUSD bid
`115502`) while order inputs take *display* prices (`1.15502`). The skill's prose says
all prices are pipettes; the live tool schema and quirk `Q-K19` say otherwise. Mixing
them produces a silently wrong fill at 10⁵ the intended price — so any 5+ digit integer
in a display-price field is rejected as malformed input.

## What it doesn't do

- **Preflight is bypassable.** Enforcement is by *tool availability*, not by the broker.
  Re-add the `trading` profile to your MCP config and Preflight is defeated entirely.
  This is a real limitation, not an implementation gap — genuine enforcement belongs
  server-side at the broker, which is the argument for this being a platform capability
  rather than a bolt-on.
- **Symbol metadata is a build-time snapshot**, hand-transcribed and broker-specific
  (Axiory demo). A wrong value produces a confident wrong verdict. Production needs a
  metadata sync against broker reference data.
- **`amend_position` is proxied but not evaluated.** Quirk `Q-R10`: omitting
  `takeProfit` on that call **silently deletes it**, so an agent tightening a stop can
  strip your take-profit with no error. Documented, not yet gated — the next thing worth
  building.
- **`max-risk-per-trade` is deferred.** Deposit currency is EUR; both demo instruments
  quote USD. Pip value needs a currency-conversion chain, and remote MCP supplies no
  rates for it. The chain is the finding.
- **The journal is local and unsigned.** Durable against crashes, not against a
  determined local user. Hash-chaining is a later one-liner — JSONL is schemaless.
- **Single account, no UI, no live-account guards.**

## Testing

Test-first on everything that ships, with the failing test committed separately from the
implementation — the red-then-green history is the evidence and can't be reconstructed
afterwards.

The most important test isn't a rule test. It asserts that **a denial never reaches the
broker**, using a fake cTrader client that records calls:

- `enforce` + `DENY` → client called **zero** times
- `enforce` + `ALLOW` → called **exactly once**
- `observe` + `DENY` → called **once**, and the journal records the refusal

Transport and MCP wiring are deliberately **not** unit-tested — they're covered by the
live end-to-end run against the real remote MCP instead.

## Repository

| File | What it is |
|---|---|
| `SPEC.md` | Level 1 specification — problem, audience, scope, MCP usage, metrics |
| `PLAN.md` | Architecture, decision record, build order, verification |
| `DIARY.md` | AI-collaboration diary, written during the session |
| `CLAUDE.md` | Standing brief and working agreement |

The official Spotware cTrader skill is installed project-scoped but **gitignored** — it's
proprietary under the Spotware EULA. The restore command is in `.gitignore`.
