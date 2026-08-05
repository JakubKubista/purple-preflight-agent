# Case study brief

## Context

This is a 4-hour case study (this afternoon) for an AI Product Engineer role
at Purple Technology / Purple LAB — a fintech builder platform (Hello Purple /
Purple Engine). It's evaluated on product thinking, technical literacy,
communication, and how I work with AI — not on how polished the final app is.
I'll be talking through this build in a follow-up interview, so the reasoning
trail (spec, commits, diary) matters as much as what runs.

Everything you need is in `docs/`. Read it before proposing anything.

## The original assignment

`docs/case-study.pdf` (or its extracted text) is the actual brief from Purple.
In short: connect to the official cTrader remote MCP server, pick a small
product idea that uses it, write a short technical spec (Level 1), then build
it end-to-end (Level 2). Doesn't have to be finished — unfinished with honest
commentary on where it broke beats polished with no reflection. A Level 3
pitch and an AI-collaboration diary are also asked for; the pitch is being
handled outside this repo, but the diary is not — see below.

## The idea I want to build against

I looked at what's already out there. cTrader's own marketplace has dozens of
margin/swap/position-size calculators and risk cBots — that category is
covered. What's genuinely new is what shipped with cTrader AI Agent Connect
(May 2026): an agent can place, modify, and close real orders through the
remote MCP server, and the only control today is a client-side confirmation
click. Nothing evaluates an agent's intent deterministically before execution,
and nothing gets logged when an action is refused — only what executed.

The idea, working name **Preflight**: something that sits between an agent's
stated trade intent and the moment it actually reaches execution on cTrader,
checks it against rules I define, and only lets it through on a clear
decision — with every decision, including refusals, recorded somewhere
durable.

The core thesis, which I don't want lost in the build: **the model proposes,
this decides.** Whatever evaluates the rules should not itself be an LLM call
— if a rule only lives in a prompt, it isn't a control. How you implement
that determinism (language, storage, exact interface) is your call.

One thing to be upfront about, not hide: whatever this is, if it runs as a
client-side check, an agent that skips it can simply not call it. That's a
real limitation, not a bug to engineer around — it's fine for it to show up
honestly in the README.

## Where my thinking currently is — push back on this if you see better

- My leaning is an MCP server, not a CLI I'd later have to migrate. Purple
  Engine's whole pitch is SDK/CLI/MCP surfaces, and I want the artifact itself
  to look like something other agents plug into. But if you see a genuinely
  better shape for this — e.g. a skill layered over cTrader's own MCP and
  Open API rather than a standalone server — argue for it. I'd rather hear
  that in the plan than discover it at hour three.
- It should read cTrader account/market context via the **cTrader remote
  MCP** server, since I'm on cTrader Web, not Windows desktop — local MCP
  is off the table for that reason, not by preference.
- Everything else — repo layout, stack, exact tool names, how the rules are
  authored, how decisions get stored, commit granularity, test approach — is
  yours to design. Propose it, don't just build it silently; I want to see
  the reasoning, especially anywhere you'd cut scope given the clock.

## Materials

Detailed reference material — the original JD and case study brief,
condensed interview notes, what the cTrader remote MCP actually exposes, the
real state of the demo platform, and the regulatory/market grounding behind
the idea — lives in the `case-study-context` skill, not dumped into this
file or into `docs/`. Consult it when you actually need one of those things,
not upfront. Its own index tells you which reference file answers which
question.

## Account reality

The demo account is empty — no positions, no history, zero balance. Whatever
you design needs to work against that, or you need to flag where it doesn't
and what you'd seed manually to test it (I can open a couple of demo
positions by hand if needed).

## Constraints

- ~4 hours total, this afternoon. Optimize for finishing over completeness;
  cut scope out loud rather than leaving something half-wired.
- `DIARY.md` gets written as we go, not reconstructed at the end. Real
  prompts, including ones that failed, matter more here than a clean
  narrative.
- No secrets committed. Token goes in `.env`.

## Skills available

`case-study-context` (background material for this specific case study —
see above), `superpowers`, `prompt-engineer`, `mcp-builder`, `grill-me`,
`Thermo-Nuclear Code Quality Review`, and the official cTrader skills. Use
your judgment on when each earns its context — I'd rather you load what's
relevant when it's relevant than front-load all of them.

## What "done" looks like

- `SPEC.md` — the Level 1 spec: problem, who it's for, scope (including what's
  deliberately cut), how it uses the cTrader remote MCP, success metrics
- A working build demonstrating the check end-to-end against the live
  cTrader remote MCP server, with tests over whatever the deterministic core
  turns out to be
- `README.md` — what it is, how to run it, and an honest account of what it
  doesn't do
- `DIARY.md` — written throughout
- A commit history that shows how the thing came together, not one giant drop

Propose your plan before you start building it.
