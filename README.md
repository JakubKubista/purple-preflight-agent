# Preflight

**A deterministic pre-trade policy gate for cTrader AI Agent Connect.**
The model proposes; this decides.

cTrader AI Agent Connect lets an AI agent place, modify and close real orders through the
official remote MCP server. The only control shipped today is a client-side confirmation
click, and nothing is recorded when an action is refused — only what executed.

Preflight sits in that gap. It holds the cTrader `trading` credential so your agent
doesn't, evaluates every order intent against rules you define, and journals every
decision including the refusals. The evaluator is never an LLM call.

> ### Status: gate works end-to-end against the live broker
>
> 4-hour case study build (2026-08-05), not a product. **16/16 tests green, and both
> paths verified live** against `https://mcp.ctrader.com/trading/mcp` on an Axiory demo
> account. Rules were committed test-first — the failing test is a separate commit from
> its implementation, so the red-then-green history is real rather than reconstructed.
>
> **Shipped:** the proxy holding the trading credential, `observe`/`enforce`,
> `create_order` gated by `mandatory-stop-loss`, four mutations proxied, the journal,
> fail-closed symbol metadata, and the test asserting a denial never reaches the broker.
>
> **Not shipped:** `max-lots-per-symbol`, `amend_position` gating, the pipettes-leak
> guard, `max-risk-per-trade`. See [Limitations](#limitations) and
> [`DIARY.md`](DIARY.md).

## How it works

```
Agent  ──┬── ctrader MCP  → .../data/mcp        read-only
         └── preflight    → stdio, local process
                ├─ normalize + validate
                ├─ rule engine       pure, deterministic
                ├─ journal           append-only JSONL
                └─ ctrader client ──→ .../trading/mcp
                                      ↑ Preflight alone holds this credential
```

The remote MCP ships two permission levels — `data` (read-only) and `trading` (reads plus
every mutation) — with nothing in between. Preflight is that missing middle.

Your agent gets `data` plus Preflight and no direct mutation tools, so a denial isn't
advice it can decline to take: the tool doesn't exist in its surface.

Runs in **`observe`** mode (forwards everything, logs what it *would* have blocked) or
**`enforce`** (a denial stops the order). Shadow first, promote once the journal shows it
isn't over-blocking.

Every decision resolves to one of three outcomes:

| Outcome | Meaning |
|---|---|
| `ALLOW` | Evaluated, passed |
| `DENY` | A policy rule refused it |
| `ERROR` | The gate couldn't judge — malformed input, or a symbol with no verified metadata |

`ERROR` stops the order too, but it isn't a policy decision — it means Preflight is
missing something it needs, and you should expect to fix a config file rather than
reconsider a trade. Full model in [`docs/architecture.md`](docs/architecture.md).

## Proof: the same order, refused and allowed

Two adjacent lines from a real journal ([`fixtures/example-journal.jsonl`](fixtures/example-journal.jsonl)),
both run through Preflight against the live broker. The intents are **identical but for
one field** — the one the policy asked for:

| Outcome | `relativeStopLoss` | Forwarded | Reason |
|---|---|---|---|
| `DENY` | *absent* | **no** | `BUY MARKET order carries no stop loss; policy requires one. Set relativeStopLoss (points from fill price).` |
| `ALLOW` | `300` | yes | `1 rule(s) passed` |

After the `DENY`, `get_positions` still returned `{positions: [], orders: []}` — the
broker never saw it. After the `ALLOW`, position `10686465` opened at `1.15570` with its
stop at `1.15270`, exactly 300 points below fill.

That pair is the whole thesis in two lines: the model proposed the same trade twice, and
the difference between execution and refusal was a deterministic rule, not a judgement
call.

## Install

Requires Node 22+ and a cTrader remote MCP token from cTrader Web → Settings → Remote MCP.

```bash
npm install
cp .env.example .env      # add your cTrader slug
npm test
npm start
```

## Usage

Point your agent at the `data` profile and Preflight — and **remove the `trading`
profile**. That removal is what makes the gate real rather than advisory.

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

Rules live in `policy.yaml`:

```yaml
rules:
  mandatory-stop-loss:
    enabled: true
  max-lots-per-symbol:
    EURUSD: 1.00
    XAUUSD: 0.50   # 1 lot = 100 oz, not 100,000 — see docs/platform-findings.md
```

A malformed or missing `policy.yaml` is a **startup failure**, not a warning. Preflight
refuses to start rather than run unprotected — a gate that silently allows everything is
worse than no gate, because you'd believe you had one.

Every refusal explains itself, with the arithmetic:

```
DENY  1.00 lots XAUUSD = 100 oz notional, limit 0.50 lots
```

## Limitations

- **Preflight is bypassable.** Enforcement is by *tool availability*, not by the broker.
  Re-add the `trading` profile and it's defeated. Genuine enforcement belongs server-side
  at the broker — which is the argument for this being platform capability, not a
  bolt-on.
- **Symbol metadata is a build-time snapshot.** The remote MCP exposes no contract
  specifications at all, so `symbols.yaml` is hand-transcribed and broker-specific. A
  wrong value gives a confident wrong verdict.
- **`amend_position` is proxied but not evaluated** — and it deletes a take-profit by
  omission. See [`docs/platform-findings.md`](docs/platform-findings.md).
- **The journal is local and unsigned.** Durable against crashes, not against a
  determined local user.
- Single account. No UI. No live-account guards.

## Documentation

| | |
|---|---|
| [`SPEC.md`](SPEC.md) | Specification — problem, audience, scope, MCP usage, metrics |
| [`PLAN.md`](PLAN.md) | Decision record, build order, verification |
| [`DIARY.md`](DIARY.md) | AI-collaboration diary, written during the build |
| [`docs/architecture.md`](docs/architecture.md) | Credential model, modes, outcomes, agent-vs-app split |
| [`docs/platform-findings.md`](docs/platform-findings.md) | Live-server findings that contradict the official docs |
| [`docs/design-standards.md`](docs/design-standards.md) | Reason-string standard, determinism, testing approach |
| [`docs/guide.md`](docs/guide.md) | Manual test walkthrough — copy-paste terminal commands, no coding required |

Precedence, if two disagree: `CLAUDE.md` on process → `SPEC.md` on scope and metrics →
`PLAN.md` on build order → `docs/` on design detail. This README is derived from those
and never authoritative; `DIARY.md` is narrative record.

## License

MIT — see [`LICENSE`](LICENSE).

The official Spotware cTrader skill is installed project-scoped but gitignored; it's
proprietary under the Spotware EULA. Restore command is in `.gitignore`.
