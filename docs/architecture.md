# Architecture

How Preflight sits between an agent and the broker, and why it's shaped this way.
Decision record with rationale is in [`../PLAN.md`](../PLAN.md).

## The wiring

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

## The credential model is the whole design

The cTrader remote MCP ships exactly two permission levels:

- **`data`** — every read-only tool. Safe to expose.
- **`trading`** — everything in `data`, **plus** `create_order`, `amend_order`,
  `cancel_order`, `amend_position`, `close_position`.

There is nothing between them. You cannot say "may trade, but only within these limits."
That gap is what Preflight fills.

The agent is given `data` plus Preflight, and **never** the `trading` slug. Because the
agent doesn't hold the credential, a denial isn't advice it may decline to take — the
tool does not exist in its surface. Preflight reads the `trading` slug from `.env` and is
the only process that should ever hold it.

Spotware's own skill documentation confirms the mechanism: *"if no mutating tools are
visible in `tools/list`, the connection is `data`-only and trade workflows cannot execute
the mutation step."*

**All five mutations are proxied, not just the gated one.** Otherwise the trader could no
longer close a position — those tools would have vanished from the agent's surface along
with `create_order`.

## Agent versus app

| | Handled by |
|---|---|
| Understanding what the trader wants | **Agent** |
| Choosing instrument, direction, size | **Agent** |
| Reading account state to inform that choice | **Agent** (via `data`) |
| Schema validation and normalization | **Preflight** |
| Symbol-metadata resolution | **Preflight** |
| Rule evaluation | **Preflight** — pure functions, no model |
| `observe`/`enforce` branch | **Preflight** |
| Journaling | **Preflight** |
| Forwarding to the broker, or refusing | **Preflight** |

The agent proposes. It never executes.

## Two modes

| Mode | Behaviour |
|---|---|
| `observe` | Evaluates, journals, and **forwards anyway** — recording what it *would* have blocked |
| `enforce` | A denial terminates; nothing reaches the broker |

Preflight holds the credential and proxies in **both** modes. The only difference is one
branch: whether a `DENY` stops the forward.

Shadow-then-enforce is how policy systems are actually deployed — WAFs, OPA, fraud rules.
Run alongside, prove it isn't over-blocking, then make it binding. This gives the journal
a second job: it stops being an audit log and becomes the evidence that justifies
promotion to `enforce`.

## Three outcomes

| Outcome | Meaning |
|---|---|
| `ALLOW` | Evaluated, passed |
| `DENY` | A policy rule refused it |
| `ERROR` | The gate could not judge — `code` says why (`malformed_price`, `unknown_symbol_metadata`, `position_not_found`) |

`DENY` and `ERROR` are deliberately separate, and only `DENY` is a policy decision.

A missing `symbols.yaml` row stops an order, but it isn't the policy working — it's the
gate failing. Conflating the two would make any future quality metric (say, a false-block
rate) measure *config completeness* instead of *policy correctness*. Two different
things; one number can't mean both.

An earlier draft had four classes, splitting `ERROR` into malformed-input and
missing-context. Collapsed because you act identically on both: stop, and go fix
something.

## Schema mirroring

Preflight mirrors cTrader's `create_order` schema exactly — same `symbolId`, same
`volume` in cents, same `relativeStopLoss` in points.

Two consequences. It's a drop-in replacement, so swapping the MCP config cannot break a
prompt that already worked. And there is no unit translation anywhere in the request
path, which removes an entire category of silent error.

## No shared rule engine across tools

`create_order` carries symbol, volume, side, prices, SL/TP. `amend_position` carries a
position id and two optional fields. They barely overlap, and a third gated tool isn't
coming soon.

**Shared** (`src/gate.ts`) — the `Decision` type, the journal writer, the
`observe`/`enforce` branch, the forward step. `gate()` takes an already-computed
`Decision`, a tool name, and a zero-argument `forward()` closure, so it never needs to
know how a verdict was reached or what shape the intent behind it takes.

**Disjoint** — how a verdict is reached. `evaluate()` in `src/engine.ts` runs the
declarative rule engine for `create_order`. `checkAmendPreservesLegs(intent, position)`
in `src/amend-guard.ts` is a hardcoded check with no policy input at all — "don't
silently delete the other leg" is a boolean whose only sane value is `true`, and putting
it in `policy.yaml` would invent a setting inviting someone to switch correctness off.

`gate()` was not built generic from the start. The first version was hardcoded to
`create_order`; when `amend_position` shipped, its handler didn't reuse it and hand-rolled
an equivalent pipeline in `server.ts` instead, because there was nothing generic to call.
Generalizing it afterward deleted the duplication *and* fixed a real bug the duplication
had produced — the amend handler's "position not found" case bypassed the shared journal
write entirely, so that one refusal left no trace. See `DIARY.md`.
