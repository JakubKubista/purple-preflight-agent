# Links

Everything referenced during this case study, with what each is actually
good for. Fetch these directly when you need precision — the other
reference files paraphrase, and paraphrase is not good enough for tool
names, parameter schemas, or auth flows.

## cTrader AI Agent Connect — the thing being built against

- **Remote MCP setup** — https://help.ctrader.com/ctrader-ai-agent-connect/remote-mcp/setup/
  How to generate the token and wire the server up. This is the mode in use.
- **Remote MCP — trading capabilities** — https://help.ctrader.com/ctrader-ai-agent-connect/remote-mcp/trading/
  Order placement, modification, closing. Read before assuming what an
  agent can execute.
- **Remote MCP — account capabilities** — https://help.ctrader.com/ctrader-ai-agent-connect/remote-mcp/account/
  Balance, margin, open positions.
- **Remote MCP — analysis capabilities** — https://help.ctrader.com/ctrader-ai-agent-connect/remote-mcp/analysis/
  Market data, historical candles, the built-in "risk" prompt examples.
- **Local MCP setup** — https://help.ctrader.com/ctrader-ai-agent-connect/local-mcp/setup/
  Requires cTrader Windows desktop. Not usable here — listed so the
  remote-vs-local distinction can be verified rather than taken on trust.

## cTrader platform and API

- **The actual demo platform** — https://ct.axiory.com/
  Axiory white-label cTrader Web. This is where the demo account lives and
  where the Remote MCP token is generated.
- **Open API docs** — https://help.ctrader.com/open-api/
  Protobuf/JSON API underneath. Rate limits (roughly 50 req/s general,
  5 req/s historical data), official SDKs in C# and Python only, access
  tied to cTID. Relevant as a fallback if MCP setup fails, and for
  understanding what the MCP layer is wrapping.
- **cTrader product/marketing site** — https://www.spotware.com/ctrader/
  Spotware's own positioning, platform scale figures.
- **User video library** — https://help.ctrader.com/video-library/
  End-user platform docs. Useful if a UI term in the screenshot is unclear.

## Evidence that the calculator category is already served

Don't rebuild these — they're the reason Preflight targets agent governance
rather than trade-sizing arithmetic:

- https://ctrader.com/products/1514
- https://ctrader.com/products/4338

Both are examples from cTrader's marketplace, which carries a long tail of
margin/swap/position-size calculators and risk cBots.

## Purple

- **Hello Purple** — https://hello.purple.group/
  Currently a pre-launch teaser with a waitlist form. See
  `hello-purple.md` for what's actually on it.
- **lovestock.io** — https://lovestock.io/
  The reference example Purple pointed to in the case study brief, as the
  kind of "small, real app" they mean. Worth a look before deciding how
  ambitious the build should be — it calibrates their expectation of scope.
