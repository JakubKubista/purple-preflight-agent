---
name: case-study-context
description: Background material for the Purple Technology / Purple LAB AI Product Engineer case study (Preflight — a pre-trade policy gate for cTrader AI Agent Connect). Use this whenever you need the original job description, interview notes, cTrader remote MCP capabilities, the actual demo platform's state, or the regulatory/market context behind the idea — instead of asking the user to re-explain it. Trigger this any time you're about to write SPEC.md, justify a scope decision, cite a cTrader MCP capability, or need to know what Purple's engineering team actually said in interviews.
---

# Case study context

Reference material for the Preflight build. Nothing here needs to be read
up front — pull in only the file that answers the question you actually have
right now.

## What's in `references/`

- **`assignment.md`** — the actual job posting and the case study brief from
  Purple LAB (levels, what to submit, how they'll evaluate it). Read this
  before finalizing SPEC.md scope, or if you're unsure whether something is
  in scope for Level 1/2.

- **`links.md`** — every relevant URL with what it's good for: the cTrader
  AI Agent Connect docs (setup, trading, account, analysis), Open API,
  the live demo platform, Hello Purple, and the reference app Purple
  themselves pointed to. **Fetch these rather than trusting the paraphrases
  here** whenever you need exact tool names, parameter schemas, or auth
  details.

- **`interview-notes.md`** — condensed notes from both interview rounds:
  who's assessing this and what they care about, Purple's own account of
  where the product is, the strategic thesis this build extends, and known
  gaps stated openly. Contains Martin Urban's own list of where MCP breaks
  down — one item of which is essentially this build's whole premise. Read
  this before framing SPEC.md or README, and before deciding how much to
  invest in tests.

- **`ctrader-mcp-facts.md`** — what the official cTrader remote MCP server
  actually exposes (trading, account, analysis capabilities), what it
  doesn't, the remote-vs-local distinction, and which product category is
  already saturated on their marketplace. Read this before designing the
  context/adapter layer, or if you're unsure whether a capability you want
  to use actually exists.

- **`platform-notes.md`** — the real state of the demo account being built
  against (broker, empty account, symbol info fields actually visible in the
  UI, market hours). Read this before writing anything that assumes trade
  history, open positions, or a specific instrument's parameters exist.

- **`hello-purple.md`** — what's actually public about Hello Purple (very
  little — it's a pre-launch waitlist page) and what the JD says Purple
  Engine is. Read this if you need to justify why the build takes the shape
  it does, or for anything referencing Purple's own product.

- **`market-context.md`** — the regulatory and market grounding for *why*
  this gap matters (MiFID II / RTS 6, 2026 ESMA guidance on AI in
  algorithmic trading, the Feb 2026 incident referenced in the pitch). This
  is mostly Level 3 territory and already used in the separate pitch — pull
  it in only if you want SPEC.md's problem statement to cite something more
  concrete than "agents can trade now."

## What's in `assets/`

- **`ctrader-platform-screenshot.png`** — a real screenshot of the cTrader
  Web UI on the actual demo account (Axiory white-label). Look at this
  directly if you need to see real field names, layout, or values rather
  than trusting the paraphrase in `platform-notes.md`.
