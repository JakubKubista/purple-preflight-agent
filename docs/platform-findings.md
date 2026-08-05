# Platform findings

Things discovered by probing the live cTrader remote MCP that contradict the official
documentation. All verified against `rest-proxy 1.0.18` on 2026-08-05, against an Axiory
demo account.

These are part of the deliverable, not incidental notes — each one changed the design.

---

## 1. Remote MCP exposes no per-symbol contract specifications

**Claim in Spotware's own skill** (`references/remote-http-server.md`): *"`pipDigits` is
part of each symbol's static metadata (resolve via `get_symbols`; cache once per
session)."*

**Reality: it isn't there.** Verified three independent ways.

**Live `tools/list`** — 16 tools on the `trading` profile, and no `get_symbol_details`:

```
get_balance      get_symbols       get_assets          get_spot_prices
get_trendbars    get_positions     get_position_details get_pending_orders
get_order_history get_deals        get_version
amend_position   close_position    create_order        amend_order   cancel_order
```

`get_symbol_details` exists only on the **local** MCP server, which this build doesn't use.

**Live `get_symbols`** — takes no parameters, returns 481 symbols, seven fields each:

```json
{ "symbolId": 1, "symbolName": "EURUSD", "enabled": true,
  "baseAssetId": 5, "quoteAssetId": 15, "symbolCategoryId": 1,
  "description": "Euro vs US Dollar" }
```

No `pipDigits`. No `lotSize`. No `minVolume`. No `volumeStep`.

**Official docs** — the remote-MCP account and analysis pages document symbol
*availability* only (*"Is XAUUSD available for trading?"*), never contract specs.

Scanning all 16 tool schemas, `lotSize` appears in exactly three places: the **input**
descriptions of `create_order`, `amend_order` and `close_position`, where it warns that
*"the authoritative `lotSize` is per-symbol on the broker side."* The API tells you to
know it; nothing returns it.

### Consequence

Preflight's arithmetic cannot be sourced from the system it polices. It carries
`symbols.yaml`, hand-transcribed from the cTrader Web Symbol Info panel with provenance
recorded (broker, account, who read it, when), and **fails closed**: an unknown symbol
returns `ERROR: unknown_symbol_metadata`, never a guess.

This matters because the failure mode is silent. `lotSize` is 100,000 for EURUSD and
100 for XAUUSD. Reuse the forex constant for gold and a 0.01-lot order becomes a **1000×
oversize position** — no error, no warning, just a confident wrong answer. cTrader's own
`create_order` description calls this "the single most common sizing mistake."

It also means `symbols.yaml` is a **build-time snapshot**, broker-specific and not
portable. A production deployment needs a metadata sync against broker reference data.

---

## 2. Price encoding is asymmetric

**Claim in the same file**: every price field — `limitPrice`, `stopPrice`, `stopLoss`,
`takeProfit`, `bid`, `ask` — is *"an integer in pipettes."*

**Reality: only market data is.** Order inputs are display floats.

Live `get_spot_prices` for EURUSD returns `bid: 115502` — pipettes. But the live
`create_order` schema says, verbatim:

> `limitPrice`: Limit price as **DISPLAY** price (not pipettes)
> `stopLoss`: Stop loss as absolute **DISPLAY** price (not pipettes)

The skill's quirks ledger (`Q-K19`) agrees with the schema against its own prose.

### Consequence

Mixing them submits `115502` where `1.15502` was meant — an order at a price of one
hundred fifteen thousand, filled silently at 10⁵ the intended level.

Preflight rejects any 5+ digit integer appearing in a display-price field as
`ERROR: malformed_price`. This is deliberately **not** a policy rule: it's a
data-integrity check in the normalization layer. No trader would ever want it switched
off, so it isn't configurable, and it's excluded from policy-decision counts.

---

## 3. `amend_position` deletes by omission (`Q-R10`)

Documented in the skill's quirks ledger and not yet gated by this build.

A position has both `stopLoss` and `takeProfit` set. Call
`amend_position(positionId, stopLoss=<new>)` to tighten the stop, omitting `takeProfit`.
**The take-profit is removed**, not preserved. Passing `takeProfit: null` is rejected
outright — the schema declares it non-nullable.

So an agent doing something entirely reasonable — tightening a stop as a trade moves in
your favour — silently strips your profit target, with no error at any layer.

This is the strongest candidate for the next gated tool: a hardcoded check that refuses
any `amend_position` touching one leg while omitting the other. It needs an open position
with both legs set to demonstrate, which a flat demo account can't provide without
seeding.

---

## Other quirks relevant to this build

| Quirk | Effect |
|---|---|
| `Q-R4` | `create_order` with `orderType: MARKET` **rejects absolute** SL/TP — must use `relativeStopLoss`/`relativeTakeProfit` in integer points |
| `Q-R8` | A single unknown `symbolId` in a `get_spot_prices` batch returns an **empty array for the entire batch** — valid ids are hidden too. Validate every id against a cached `get_symbols` map first |
| `Q-R11` | `get_deals`/`get_order_history` lag behind mutations. Trust the mutation response, not a history read, for immediate verification |
| Rate limits | 50 req/s general, 5 req/s for history-bearing tools |

---

## Also worth recording

The **demo account was not empty**, contrary to the project brief: `balance: 1000000`
with `moneyDigits: 2` and `depositAssetId: 5` (EUR) — **€10,000**. Positions and orders
genuinely were empty. Equity-based rules are therefore demonstrable without seeding.

**Local MCP supports macOS**, contrary to an earlier assumption that it was Windows-only
— the docs say *"cTrader Windows or cTrader Mac."* It was still rejected, for a better
reason: it's an unauthenticated server on `127.0.0.1:9876` riding the open cTrader
session. There'd be no credential for Preflight to exclusively hold, which collapses the
entire enforcement argument.
