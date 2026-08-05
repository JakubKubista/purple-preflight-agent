# Case study brief

## Context

This is a 4-hour case study (2026-08-05) for an AI Product Engineer role at
Purple Technology / Purple LAB — a fintech builder platform (Hello Purple /
Purple Engine). It's evaluated on product thinking, technical literacy,
communication, and how I work with AI — not on how polished the final app is.
I'll be talking through this build in a follow-up interview, so the reasoning
trail (spec, commits, diary) matters as much as what runs.

### Precedence

1. **`CLAUDE.md`** — how to work: constraints, thesis, authorisations. Wins on
   process, always.
2. **`SPEC.md`** — wins on scope and metrics. It's the graded artifact.
3. **`PLAN.md`** — wins on how it's built and in what order.
4. **`docs/`** — wins on design detail: architecture, findings, standards.
5. **`README.md`** — user-facing, derived, never authoritative.
6. **`DIARY.md`** — narrative record, never authoritative.

## The original assignment

Connect to the official cTrader remote MCP server, pick a small product idea
that uses it, write a short technical spec (Level 1), then build it end-to-end
(Level 2). Doesn't have to be finished — unfinished with honest commentary on
where it broke beats polished with no reflection.

**Out of scope for this repo and for Claude Code — I'm writing both myself,
elsewhere:**

- **Level 3**, the pitch for something Hello Purple could build.
- **"Vision for AI-agent trading at Hello Purple"** — listed in the assignment
  as a separate submission item from the pitch. Also mine.

Don't produce either, don't scaffold them, don't leave placeholders. The
**AI-collaboration diary is not** out of scope — that's `DIARY.md`, written as
we go.

Full assignment text: `case-study-context` skill, `references/assignment.md`.

## The idea I want to build against

I looked at what's already out there. cTrader's own marketplace has dozens of
margin/swap/position-size calculators and risk cBots — **that category is
covered, and I don't want to rebuild it.** If a feature idea starts drifting
toward "help the trader size a position correctly," that's the wrong direction:
it's a solved problem with established vendors, and it answers a question
nobody is asking me.

What's genuinely new is what shipped with cTrader AI Agent Connect (May 2026):
an agent can place, modify and close **real orders** through the remote MCP
server, and the only control today is a client-side confirmation click.
Nothing evaluates an agent's intent deterministically before execution, and
nothing gets logged when an action is refused — only what executed.

The distinction that picks the idea: existing tools answer *"how do I, a human,
size this trade correctly?"* Preflight answers *"does an agent's stated intent
pass a rule check before it executes?"* Different question, unserved.

**Preflight** sits between an agent's stated trade intent and execution, checks
it against rules I define, and only lets it through on a clear decision — with
every decision, including refusals, recorded durably.

The core thesis, which must not get lost in the build: **the model proposes,
this decides.** Whatever evaluates the rules must not itself be an LLM call —
if a rule only lives in a prompt, it isn't a control.

Shape: a **locally-run stdio MCP server** that exclusively holds the cTrader
`trading` credential, proxying all five mutating tools and gating
`create_order`, in `observe` or `enforce` mode. Detail in
[`docs/architecture.md`](docs/architecture.md); decisions in
[`PLAN.md`](PLAN.md). *(Note: "local MCP" unqualified means cTrader's own
`127.0.0.1:9876` server, which this build rejects — always say "locally-run
stdio MCP server" for Preflight.)*

Rejected: a CLI (would need migrating later); a skill layered over cTrader's
own MCP (a rule living in a markdown skill is a rule living in a prompt).

**Design invariant:** Preflight is bypassable by re-adding the `trading`
profile. That is a real limitation to state, **not a bug to engineer around** —
don't add machinery that pretends to close it. Full statement in `README.md`.

## How I want to be worked with

- **Propose it, don't just build it silently.** I want to see the reasoning,
  **especially anywhere you'd cut scope given the clock.** This applies during
  the build, not just design — scope cuts get argued, not assumed.
- **Push back rather than accommodate.** Say "that's unnecessary" when it is.
  Both of us have added things that were locally defensible and wrong in
  aggregate.
- **Verify before asserting.** Where a reference file conflicts with a live
  probe, the probe wins — and the discrepancy goes in `DIARY.md`, because those
  findings are part of the deliverable.
- **Check facts you could check.** Don't estimate elapsed time, file contents,
  or tool availability forward from an earlier reading. Run the command.

## Constraints

- **~4 hours total, hard deadline. Scope is the variable, not the deadline.**
  An accurate 4h with named, reasoned cuts reads as scope control; an overrun
  on my own estimate reads as an estimation failure however honestly reported.
  Cut out loud rather than leaving something half-wired.
- **Test-first on anything that ships.** Commit the failing test separately
  from the implementation — the red-then-green git history is the evidence and
  can't be reconstructed later.
- `DIARY.md` gets written as we go, not reconstructed at the end. Real prompts,
  including ones that failed, matter more than a clean narrative.
- **No secrets committed.** Token goes in `.env`.

### Two platform facts that constrain the code

Both verified against the live server; full evidence in
[`docs/platform-findings.md`](docs/platform-findings.md).

- **Remote MCP exposes no per-symbol contract specs** — no `pipDigits`,
  `lotSize` or `minVolume` anywhere, and no `get_symbol_details`. Preflight
  therefore carries a hand-verified `symbols.yaml` and **fails closed** on
  unknown symbols. Never guess a contract size.
- **Price encoding is asymmetric** — market data is pipettes (`115502`), order
  inputs are display prices (`1.15502`). Normalization rejects any 5+ digit
  integer in a display-price field.

## Account reality

Demo account on Axiory (`ct.axiory.com`), a cTrader white-label. **€10,000
balance, no open positions, no trade history.** Pre-trade checks don't need
history, so most of this works against a flat account.

- **Live orders are authorised at minimum size, showing me the parameters
  before each one.**
- **Where a rule needs existing exposure, ask** — I can open a couple of demo
  positions by hand in a minute. Currently relevant: `amend_position` (P1)
  can't be tested flat, since `Q-R10` needs a position with both legs set.

## Materials

Reference material — the JD, assignment, interview notes, what the remote MCP
exposes, the platform's real state, regulatory grounding — lives in the
`case-study-context` skill. Pull in whichever file answers the question you
have; don't read it all up front.

**Treat it as dated, not authoritative.** Several of its claims have been
disproved against the live server.

Skills: `case-study-context`, `ctrader-mcp-servers` (Spotware's, project-scoped
and gitignored — proprietary under their EULA), `superpowers`,
`prompt-engineer`, `mcp-builder`, `grilling`, `Thermo-Nuclear Code Quality
Review`. Load what's relevant when it's relevant.

## What "done" looks like

- **`SPEC.md`** — the Level 1 spec. Must contain: the problem; who it's for;
  scope **including what's deliberately cut**; how it uses the cTrader remote
  MCP (which tools, agent-vs-app split); 1–2 success metrics. These stay the
  acceptance criteria if it's revised.
- **`PLAN.md`** — implementation plan and decision record.
- **`DIARY.md`** — written throughout.
- **A working build** demonstrating the gate end-to-end against the **live**
  cTrader remote MCP, with tests over the deterministic core.
- **`README.md`** — what it is, how to run it, an honest account of what it
  doesn't do.
- **A commit history** showing how it came together, not one giant drop.

If the build drifts from the spec, say why — that's useful information, not a
failure.
