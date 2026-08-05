# The actual platform being built against

See `assets/ctrader-platform-screenshot.png` for the real thing — this file
is a paraphrase of what's in it, useful for quick reference without opening
the image.

## Broker and account

Demo account runs on **Axiory** (`ct.axiory.com`), a cTrader white-label —
not the generic `app.ctrader.com`. Same underlying platform, same MCP
capabilities, but worth knowing in case any setup step behaves differently
on a white-label domain (e.g., where the Remote MCP settings section lives).

The account is **empty**: no open positions, no trade history, zero
balance. Anything built here needs to either work meaningfully against that
(pre-trade checks don't need history), or explicitly flag where it needs
seeded data — a couple of demo positions can be opened by hand in a minute
if a rule genuinely needs to evaluate existing exposure.

## What's visible in the real UI (Symbol Info panel, EURUSD example)

Base/quote asset, min price change, pip position, lot size (100,000 EUR for
a standard lot), commission (quoted per million USD of volume, e.g. 35 USD),
min/max trade quantity, min stop-loss and take-profit distance, swap long
and swap short (quoted in pips/day, can be negative), a **3-day swap** applied
on Wednesdays (triple swap for weekend carry), weekend swap toggle, and
market hours per weekday with a live "closes in" / "opens in" countdown.

The New Order panel shows live bid/ask, a spread figure, buy margin, and pip
value *before* an order is placed — cTrader already surfaces this much to a
human. It does not evaluate any of it against a rule set or a policy; it's
informational display only.

## Depth of Market and other panels

Visible but not directly relevant to Preflight: Depth of Market (order book
levels), Calendar (economic events — empty in the current demo view),
Autochartist, and full trade statistics (currently all zero on this empty
account).
