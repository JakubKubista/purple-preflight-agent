# Preflight

**A deterministic pre-trade policy gate for cTrader AI Agent Connect.**
The model proposes; this decides.

cTrader AI Agent Connect lets an AI agent place, modify and close real orders through the
official remote MCP server. The only control shipped today is a client-side confirmation
click, and nothing is recorded when an action is refused — only what executed.

Preflight sits in that gap. It holds the cTrader `trading` credential so your agent
doesn't, evaluates every order intent against rules you define, and journals every
decision including the refusals. The evaluator is never an LLM call.

> **Status:** 4-hour case study build (2026-08-05), not a product. Design, specification
> and platform findings are complete; **the implementation is unfinished**. See
> [`DIARY.md`](DIARY.md) for what happened and where it broke, and the git log for what
> is actually green.

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

## License

MIT — see [`LICENSE`](LICENSE).

The official Spotware cTrader skill is installed project-scoped but gitignored; it's
proprietary under the Spotware EULA. Restore command is in `.gitignore`.
