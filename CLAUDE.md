# Case study brief

## Context

This is a 4-hour case study (2026-08-05) for an AI Product Engineer role at
Purple Technology / Purple LAB — a fintech builder platform (Hello Purple /
Purple Engine). It's evaluated on product thinking, technical literacy,
communication, and how I work with AI — not on how polished the final app is.
I'll be talking through this build in a follow-up interview, so the reasoning
trail (spec, commits, diary) matters as much as what runs.

**Design is settled. `SPEC.md` and `PLAN.md` carry the current decisions —
read those before touching code.** This file is the standing brief: the
reasoning, the constraints, and the working agreement. Where it and `PLAN.md`
disagree on a *design decision*, `PLAN.md` wins. Where they disagree on *how I
want to be worked with*, this file wins.

## The original assignment

The brief from Purple: connect to the official cTrader remote MCP server, pick
a small product idea that uses it, write a short technical spec (Level 1),
then build it end-to-end (Level 2). Doesn't have to be finished — unfinished
with honest commentary on where it broke beats polished with no reflection.

**Out of scope for this repo and for Claude Code — I'm writing both myself,
elsewhere:**

- **Level 3**, the pitch for something Hello Purple could build.
- **"Vision for AI-agent trading at Hello Purple"** — listed in the assignment
  as a separate submission item from the pitch. Also mine.

Don't produce either, don't scaffold them, don't leave placeholders. The
**AI-collaboration diary is not** out of scope — that's `DIARY.md`, and it gets
written here, as we go.

Full assignment text is in the `case-study-context` skill
(`references/assignment.md`).

## The idea I want to build against

I looked at what's already out there. cTrader's own marketplace has dozens of
margin/swap/position-size calculators and risk cBots — **that category is
covered, and I don't want to rebuild it.** If a feature idea starts drifting
toward "help the trader size a position correctly," that's the wrong direction:
it's a solved problem with established vendors, and it answers a question
nobody is asking me.

What's genuinely new is what shipped with cTrader AI Agent Connect (May 2026):
an agent can place, modify, and close **real orders** through the remote MCP
server, and the only control today is a client-side confirmation click.
Nothing evaluates an agent's intent deterministically before execution, and
nothing gets logged when an action is refused — only what executed.

The distinction that picks the idea: existing tools answer *"how do I, a human,
size this trade correctly?"* Preflight answers *"does an agent's stated intent
pass a rule check before it executes?"* Different question, unserved.

The idea, working name **Preflight**: something that sits between an agent's
stated trade intent and the moment it actually reaches execution on cTrader,
checks it against rules I define, and only lets it through on a clear
decision — with every decision, including refusals, recorded somewhere durable.

The core thesis, which I don't want lost in the build: **the model proposes,
this decides.** Whatever evaluates the rules must not itself be an LLM call —
if a rule only lives in a prompt, it isn't a control.

### Shape, as decided

Full reasoning in `PLAN.md`, argued in `DIARY.md`:

- A **local MCP server that exclusively holds the cTrader `trading`
  credential**. The agent gets cTrader's `data` profile plus Preflight, and no
  direct mutation tools at all — so a denial has no path to the broker.
- Two modes, **`observe` → `enforce`**. Shadow first, logging what it would
  have blocked; promote once the journal shows it isn't over-blocking.
- Proxies all five mutating tools; gates `create_order` in v1.

Rejected: a CLI (would need migrating later); a skill layered over cTrader's
own MCP (a rule living in a markdown skill is a rule living in a prompt —
violates the thesis).

### The limitation to state honestly rather than hide

Enforcement is by **tool availability**, not by the broker. A user who re-adds
the `trading` profile to their MCP config bypasses Preflight entirely. That's a
real limitation, not a bug to engineer around — it belongs in the README.
Genuine enforcement has to live server-side at the broker, which is the
argument for this being platform capability rather than a bolt-on.

## How I want to be worked with

- **Propose it, don't just build it silently.** I want to see the reasoning,
  **especially anywhere you'd cut scope given the clock.** This applies to the
  build, not just the design — there is a scope-cut checkpoint scheduled at
  20:15, and cuts made there get argued, not assumed.
- **Push back rather than accommodate.** Say "that's unnecessary" when it is.
  Two failures this session came from the opposite: adding structure because
  each addition was locally defensible, and deleting rationale because each
  deletion was locally defensible. Both times the aggregate was wrong.
- **Verify before asserting.** Where a reference file conflicts with a live
  probe, the probe wins — and the discrepancy goes in `DIARY.md`, because those
  findings are part of the deliverable.

## Corrections to my own earlier assumptions

Things I asserted in the first version of this brief that turned out wrong.
Recorded so they don't get re-introduced:

- **The account is not empty.** It holds **€10,000** (`balance: 1000000`,
  `moneyDigits: 2`, deposit asset EUR). Positions and orders genuinely are
  empty, so equity-based rules are demonstrable without seeding.
- **Local MCP is not Windows-only** — the docs say "cTrader Windows or cTrader
  Mac". Still rejected, but for a better reason: it's an unauthenticated server
  on `127.0.0.1:9876`, so there'd be no credential for Preflight to exclusively
  hold, which collapses the thesis.
- **`docs/` does not exist and never did.** All reference material lives in the
  `case-study-context` skill.
- **Remote MCP exposes no per-symbol contract specs.** Verified three ways: 16
  tools live with no `get_symbol_details`; `get_symbols` returns seven fields
  across all 481 symbols, none of them `pipDigits`/`lotSize`; official docs
  cover availability only. Spotware's own skill documentation claims otherwise
  and is wrong. Preflight therefore carries a hand-verified `symbols.yaml` and
  fails closed on unknown symbols.
- **Price encoding is asymmetric.** Market data is pipettes (`115502`); order
  inputs are display prices (`1.15502`). The skill's prose says otherwise; the
  live tool schema and quirk `Q-K19` are correct.

## Account reality

Demo account on Axiory (`ct.axiory.com`), a cTrader white-label. **€10,000
balance, no open positions, no trade history.**

Pre-trade checks don't need history, so most of this build works against a flat
account. **Where a rule genuinely needs existing exposure, ask — I can open a
couple of demo positions by hand in a minute.** This is live and currently
relevant: `amend_position` (P1) cannot be tested flat, because demonstrating
quirk `Q-R10` requires an open position with both stop-loss and take-profit set.

Live orders on the demo account are authorised at **minimum size, showing me
the parameters before each one.**

## Materials

Reference material — the JD, the assignment, condensed interview notes, what
the remote MCP exposes, the demo platform's real state, and the
regulatory/market grounding — lives in the `case-study-context` skill. Pull in
whichever file answers the question you actually have; don't read it all up
front. Its index says which file answers what.

**Treat it as dated, not authoritative.** Several claims have already been
disproved against the live server (see corrections above).

## Constraints

- **~4 hours total, hard deadline. Scope is the variable, not the deadline.**
  An accurate 4h with named, reasoned cuts reads as scope control; an overrun
  on my own estimate reads as an estimation failure however honestly it's
  reported. Cut out loud rather than leaving something half-wired.
- `DIARY.md` gets written as we go, not reconstructed at the end. Real prompts,
  including ones that failed, matter more than a clean narrative.
- **Test-first on anything that ships.** Commit the failing test separately from
  the implementation — the red-then-green git history is the evidence and can't
  be reconstructed later.
- No secrets committed. Token goes in `.env`.

## Skills available

`case-study-context` (background for this case study — see above),
`ctrader-mcp-servers` (official Spotware skill; **project-scoped and
gitignored** — proprietary under the Spotware EULA, restore command is in
`.gitignore`), `superpowers`, `prompt-engineer`, `mcp-builder`, `grilling`,
`Thermo-Nuclear Code Quality Review`. Load what's relevant when it's relevant
rather than front-loading.

## What "done" looks like

- **`SPEC.md`** — the Level 1 spec. Must contain: the problem; who it's for;
  scope **including what's deliberately cut**; how it uses the cTrader remote
  MCP (which tools, and what the agent handles vs. what the app handles); 1–2
  success metrics. ✅ written — these are the acceptance criteria if it's
  revised, not a completed to-do.
- **`PLAN.md`** — implementation plan and decision record. ✅ written
- **`DIARY.md`** — written throughout. ✅ started, continues during the build
- **A working build** demonstrating the gate end-to-end against the **live**
  cTrader remote MCP, with tests over the deterministic core
- **`README.md`** — what it is, how to run it, and an honest account of what it
  doesn't do
- **A commit history** that shows how the thing came together, not one giant drop

If the build drifts from the spec, say why — that's useful information, not a
failure.
