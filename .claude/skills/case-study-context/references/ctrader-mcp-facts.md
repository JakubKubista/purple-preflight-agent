# cTrader AI Agent Connect — what's actually there

Source: `help.ctrader.com/ctrader-ai-agent-connect/` (remote MCP setup,
trading, account, analysis pages) and `help.ctrader.com/open-api/`. Shipped
May 2026. If you need exact tool names, parameter schemas, or anything more
precise than the summary below, fetch those pages directly rather than
trusting this paraphrase for implementation details — the URLs are in
`links.md`.

## Two connection modes — this build uses remote, not local

**Remote MCP** authenticates through an active cTrader Web session. You
generate a token from cTrader Web → Settings → Remote MCP and it's scoped
per account (and can expire). It covers account operations, order and
position management, and market data queries. This is the one relevant here
— the demo account is on cTrader Web (Axiory white-label), not a Windows
desktop install.

**Local MCP** requires the cTrader Windows desktop client and adds
workspace control (arranging charts, UI state) on top of what remote offers.
Not usable in this setup regardless of preference — the account isn't on
Windows desktop cTrader. If the Remote MCP section doesn't appear in
Settings on the actual (white-label, `ct.axiory.com`) login, try the same
cTID on `app.ctrader.com` before concluding it's unavailable.

## What the agent can already do through remote MCP

Place, modify, and close real orders; query account state (margin, open
positions, balance); pull market data (symbol details, bid/ask, spread).
The documentation includes example "risk" prompts the agent can run on
request — things like checking current margin utilization, or estimating
the impact of a given price move on open positions. These are advisory: the
agent computes an answer in its own reasoning when asked, not a
deterministic, always-applied check.

## What controls exist today — this is the actual gap

The only control cTrader ships is a **client-side confirmation step**
before an action executes, plus a general disclaimer that AI-generated
actions can trigger real trades and the trader bears responsibility for the
outcome. There is no mechanism that evaluates a trade intent against rules
*before* it reaches that confirmation, and no record kept of intents that
were *not* executed — only of what actually went through. That's the space
Preflight sits in.

## What's already covered elsewhere — don't rebuild this

The cTrader marketplace has a long-established category of margin, swap,
and position-size calculator cBots and indicators (dozens of them, some from
established vendors — two concrete examples are linked in `links.md`).
These solve "how do I as a human size this trade correctly" — a different
problem from "does an agent's stated intent pass a rule check before it
executes." Don't build another calculator; that market is already served.

## Scale, if useful for framing

Spotware's own public statements put cTrader at 300+ brokers and prop firms
and 11M+ traders on the platform — useful context for why a capability like
this matters beyond one demo account, though the business case itself lives
in the Level 3 pitch, not in SPEC.md.
