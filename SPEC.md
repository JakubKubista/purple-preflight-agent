# Preflight — technical specification (Level 1)

**A deterministic pre-trade policy gate for cTrader AI Agent Connect.**
The model proposes; this decides.

## Problem

cTrader AI Agent Connect (May 2026) lets an AI agent place, modify and close **real
orders** through the official remote MCP server. The only control shipped today is a
client-side confirmation click. Nothing evaluates an intent deterministically before
execution, and refusals leave no trace — cTrader records only what executed.

A confirmation dialog is not a control. It looks identical whether the order is sane or
catastrophic, and it degrades with repetition: the twentieth confirmation gets the same
glance as the first.

## Who it's for

**An individual trader running an AI agent against their own cTrader account.** They
want the agent's speed but not the tail risk of one that misreads a size, omits a stop,
or acts on a hallucinated instruction. They'll write their limits down once; they won't
review every order by hand, because that removes the reason for using an agent.

## Solution

A locally-run stdio MCP server that **exclusively holds the cTrader `trading`
credential**. The agent gets the read-only `data` profile plus Preflight, and no direct
mutation tools at all — so a denial isn't advice the agent may decline to take, it's a
tool that doesn't exist. The remote MCP ships only `data` and `trading`, with nothing
between; Preflight is that missing middle.

Rules are pure functions over a normalized intent and a context snapshot: same input,
same verdict, every time. Two modes — `observe` forwards while logging what it *would*
have blocked, `enforce` refuses — so the journal can prove the rules aren't over-blocking
before they become binding.

Every decision resolves to one of three outcomes: **`ALLOW`**, **`DENY`** (a policy rule
refused it), or **`ERROR`** (the gate couldn't judge — malformed input, or a symbol it
has no verified metadata for). `DENY` and `ERROR` are deliberately distinct, and that
distinction protects metric 1 below: a missing config row stops an order but isn't the
policy working, and counting it as one would make the metric measure config completeness
instead of policy correctness.

## How it uses the cTrader remote MCP

**The agent handles** understanding what the trader wants, choosing an instrument and a
size, and reading account state to inform that choice. It proposes; it never executes.

**Preflight handles**, deterministically with no model in the loop: schema validation,
symbol-metadata resolution, rule evaluation, the `observe`/`enforce` branch, journaling,
and the decision to forward or refuse.

| Path | Profile | Tools | Called by |
|---|---|---|---|
| Read | `data` | `get_balance`, `get_symbols`, `get_spot_prices`, `get_positions`, `get_assets` | the agent, directly |
| Write | `trading` | `create_order` **(gated)** | Preflight only |
| Write | `trading` | `amend_order`, `cancel_order`, `close_position`, `amend_position` — proxied and journaled, not evaluated in v1 | Preflight only |

All five mutations are proxied, not just the gated one — otherwise the trader could no
longer close a position, since those tools no longer exist in the agent's surface.
Preflight mirrors cTrader's `create_order` schema exactly, so it is a drop-in
replacement and there is no unit translation to get wrong.

## Scope

**In:** the proxy with `observe`/`enforce`; `create_order` gated by `mandatory-stop-loss`
and `max-lots-per-symbol`; all five mutations proxied and journaled; append-only JSONL
journal; symbol metadata that **fails closed** on unknown instruments; malformed-price
rejection; test-first coverage of the deterministic core plus a test asserting a denial
never reaches the broker; a live run against the real remote MCP.

**Deliberately out, given ~4 hours:**

| Cut | Why |
|---|---|
| `max-risk-per-trade` | Deposit currency is EUR, both instruments quote USD. Pip value needs a conversion chain and remote MCP supplies no rates. The chain is the finding. |
| `amend_position` gating | Quirk [`Q-R10`](docs/platform-findings.md): it deletes a take-profit by omission. A real footgun, but a second differently-shaped evaluator. |
| Hash-chained journal | Tamper-evidence is narrative at demo scale; JSONL is schemaless, so it's a later one-liner. |
| `symbol-allowlist` | Redundant — fail-closed metadata already refuses anything unlisted. |
| Broker/prop-firm enforcement | The natural extension, but not credibly demonstrable from one demo account. |
| Multi-account, UI, live-account guards | Not needed to prove the thesis. |

## Success metrics

1. **Zero policy-violating orders reach the broker.** Every intent violating an active
   rule is refused, and nothing corresponding to it appears in cTrader's order history —
   auditable by diffing `journal/decisions.jsonl` against `get_order_history`. Binary,
   and measurable today rather than after a pilot.

2. **Time from install to first enforced rule** — cloning the repo to seeing a real order
   refused for a reason you wrote yourself. Deliberately mirrors the *time-to-first-app*
   metric Purple already tracks: if the value is in the rails, what matters is how fast
   someone reaches their first meaningful interaction with them.

Only `DENY` counts against either metric. `ERROR` is a configuration defect, reported
separately.
