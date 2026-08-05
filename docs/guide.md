# Manual test guide

For a human testing this by hand, no coding required beyond copy-paste. If you can use a
terminal, you can run every scenario below.

## What you're testing, in one sentence

Preflight sits in front of your cTrader account. You send it an order the same way an AI
agent would; it either lets that order through to the real broker or refuses it and tells
you why — and it writes down every decision either way.

## Before you start

You need:
- **Node.js 22+** installed (`node --version` to check)
- **A cTrader remote MCP token** — from cTrader Web → Settings → Remote MCP. This project
  already has one saved in `.env` if you're continuing from this session.

One-time setup, from the repo root:

```bash
npm install
```

That's it. Nothing else needs building — `npm test` and the commands below run straight
from the TypeScript source.

## Two ways to test

**Option A — terminal, five minutes.** Talk to Preflight directly, no extra software.
This is what the rest of this guide uses.

**Option B — wire it into an AI agent** (Claude Code, Claude Desktop, Cursor). This is how
it's actually meant to be used day to day. See [Option B](#option-b-wire-it-into-an-agent)
at the end — do Option A first so you know what to expect.

## Option A: terminal walkthrough

Every test below follows the same shape: you send Preflight one command, it prints back
a verdict. Copy the block, paste it into your terminal from the repo root, read the
output.

### Test 1 — an order with no safety net gets refused

This asks Preflight to buy a small amount of EURUSD with no stop loss — the kind of
mistake an agent can make without thinking twice.

```bash
set -a; . ./.env; set +a
printf '%s\n%s\n%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-test","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_order","arguments":{"symbolId":1,"orderType":"MARKET","tradeSide":"BUY","volume":100000}}}' \
 | npx tsx src/server.ts 2>/dev/null | python3 -c "
import sys,json
for line in sys.stdin:
    line=line.strip()
    if line.startswith('{'):
        o=json.loads(line)
        if o.get('id')==2: print(o['result']['content'][0]['text'])
"
```

**What you should see:**

```
DENY: BUY MARKET order carries no stop loss; policy requires one. Set relativeStopLoss (points from fill price).
mode=enforce forwarded=false
```

`forwarded=false` is the important part — that word means nothing was sent to the real
broker. You can double check nothing happened by asking cTrader directly (ask your agent
"what are my open positions" or check cTrader Web) — the position count won't have moved.

### Test 2 — the same order, with a stop loss, goes through

Identical order, one extra field. This is the whole idea in one comparison: same trade,
same trader, and the only thing that changed is whether it met the rule.

```bash
set -a; . ./.env; set +a
printf '%s\n%s\n%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-test","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_order","arguments":{"symbolId":1,"orderType":"MARKET","tradeSide":"BUY","volume":100000,"relativeStopLoss":300}}}' \
 | npx tsx src/server.ts 2>/dev/null | python3 -c "
import sys,json
for line in sys.stdin:
    line=line.strip()
    if line.startswith('{'):
        o=json.loads(line)
        if o.get('id')==2: print(o['result']['content'][0]['text'])
"
```

**What you should see:**

```
ALLOW: 1 rule(s) passed
mode=enforce forwarded=true
```

⚠️ **This one is real.** `forwarded=true` means it just placed an actual (tiny, demo-account) position. Ask your agent to run `get_positions` afterwards and you'll see it —
0.01 lots of EURUSD, with a stop loss 300 points below where it filled.

### Test 3 — an oversized order gets refused

`policy.yaml` caps EURUSD at 1.00 lot. This asks for 2.00.

```bash
set -a; . ./.env; set +a
printf '%s\n%s\n%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-test","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_order","arguments":{"symbolId":1,"orderType":"MARKET","tradeSide":"BUY","volume":20000000,"relativeStopLoss":300}}}' \
 | npx tsx src/server.ts 2>/dev/null | python3 -c "
import sys,json
for line in sys.stdin:
    line=line.strip()
    if line.startswith('{'):
        o=json.loads(line)
        if o.get('id')==2: print(o['result']['content'][0]['text'])
"
```

**What you should see:**

```
DENY: 2 lots EURUSD exceeds limit 1 lots (volume 20000000 / (lotSize 100000 x 100) = 2)
mode=enforce forwarded=false
```

Notice the refusal shows its arithmetic. You can check that division by hand — that's
deliberate, not decoration (see [`docs/design-standards.md`](design-standards.md)).

**Try this too:** change `1000` at the start of the symbol note below to try gold instead
of euros — `"symbolId":41` is XAUUSD, whose lot size is 100, not 100,000. A limit written
as if it were forex would be a thousand times too generous. `policy.yaml` already caps it
correctly at 0.50 lots; you can see the trap by editing that number up and trying an order
that would have been wrong under the old (wrong) assumption.

### Test 4 — the sneaky one: tightening a stop can silently wipe your take-profit

This is the platform quirk this project exists partly to catch. On cTrader, if a position
has both a stop-loss and a take-profit, and you "amend" it while only mentioning the stop,
**cTrader deletes the take-profit** — no warning, no error. Preflight catches this before
it happens.

You need an open position with *both* legs set to see it. If you ran Test 2, you have one
open with only a stop. First, add a take-profit (this call is safe — it can only add
protection, never remove it):

```bash
set -a; . ./.env; set +a
printf '%s\n%s\n%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-test","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"amend_position","arguments":{"positionId":<YOUR-POSITION-ID>,"stopLoss":1.1527,"takeProfit":1.1600}}}' \
 | npx tsx src/server.ts 2>/dev/null | python3 -c "
import sys,json
for line in sys.stdin:
    line=line.strip()
    if line.startswith('{'):
        o=json.loads(line)
        if o.get('id')==2: print(o['result']['content'][0]['text'])
"
```

(Replace `<YOUR-POSITION-ID>` with the number from `get_positions` — ask your agent, or
check cTrader Web. `stopLoss` should match whatever the position's current stop already
is, so nothing moves; you're only adding a take-profit.)

Now try to tighten the stop *without* mentioning the take-profit — the move that would
normally wipe it out:

```bash
set -a; . ./.env; set +a
printf '%s\n%s\n%s\n' \
 '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"manual-test","version":"1"}}}' \
 '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
 '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"amend_position","arguments":{"positionId":<YOUR-POSITION-ID>,"stopLoss":1.1530}}}' \
 | npx tsx src/server.ts 2>/dev/null | python3 -c "
import sys,json
for line in sys.stdin:
    line=line.strip()
    if line.startswith('{'):
        o=json.loads(line)
        if o.get('id')==2: print(o['result']['content'][0]['text'])
"
```

**What you should see:**

```
DENY: amend of position <id> would remove takeProfit 1.16 — amend_position deletes omitted legs rather than preserving them (Q-R10). Re-pass that value to preserve it.
mode=enforce forwarded=false
```

Ask your agent to run `get_positions` one more time — the take-profit is still there.
That's the point: the platform would have silently thrown it away, and it didn't.

## Reading the journal

Every decision above, including the refused ones, is written to
`journal/decisions.jsonl` — one line of readable JSON per decision, oldest first.

```bash
tail -5 journal/decisions.jsonl | python3 -m json.tool --json-lines
```

Each line tells you: what was asked for (`intent`), what happened (`outcome`: `ALLOW`,
`DENY`, or `ERROR`), why (`reason`, in plain English with the numbers), and whether it
was actually sent to the broker (`brokerResponse` present = yes).

## Switching modes

`.env` currently has `PREFLIGHT_MODE=enforce`, meaning a `DENY` actually stops the order.
Change it to `PREFLIGHT_MODE=observe` and re-run Test 1 or Test 3 — you'll see the same
`DENY` reasoning, but `forwarded=true`, because in observe mode Preflight only *logs* what
it would have blocked and lets it through anyway. That's for safely trying out new rules
before trusting them to actually stop something.

## Running the automated tests

Everything above is also checked automatically:

```bash
npm test
```

You should see `42 passed`. This includes a test that specifically checks the broker was
never contacted on a DENY, using a fake client instead of the real one — that's the test
that matters most, and it's explained in [`docs/design-standards.md`](design-standards.md).

## Cleaning up

If Test 2 left a position open on the demo account, you can close it by asking your agent
to call `close_position`, or from cTrader Web directly. It's a demo account — nothing is
at financial risk — but it's tidy to close it when you're done.

## Option B: wire it into an agent

To use this the way it's actually meant to be used — as something your AI agent talks to,
not something you talk to by hand — add it to your MCP client's config (Claude Code:
`~/.claude.json` or your project's `.mcp.json`; Claude Desktop: its config file):

```jsonc
{
  "mcpServers": {
    "ctrader": {
      "type": "http",
      "url": "https://mcp.ctrader.com/data/mcp",
      "headers": { "Authorization": "Bearer <your-slug>" }
    },
    "preflight": {
      "command": "npx",
      "args": ["tsx", "src/server.ts"],
      "cwd": "/absolute/path/to/purple-preflight-agent"
    }
  }
}
```

Notice `ctrader` points at `/data/mcp` (read-only) here, **not** `/trading/mcp`. That's
not a typo — it's the whole design. Your agent can read balances and prices directly, but
it has no tool that can place, amend, or close anything; only Preflight does, and only
after it's checked. Restart your agent session, and ask it to place a trade with no stop
loss. It'll try, and Preflight will say no — the same way it just did in your terminal.
