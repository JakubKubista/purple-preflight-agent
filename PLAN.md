# Implementation plan

Outcome of the design session on 2026-08-05. [`SPEC.md`](SPEC.md) says *what* and *why*;
this says *how* and *in what order*. Decisions here were reached by grilling — each was
argued and several were overturned; [`DIARY.md`](DIARY.md) records the ones worth
remembering.

This file is the **decision record and build order**. It deliberately does not explain
the design — that lives in [`docs/architecture.md`](docs/architecture.md) (credential
model, modes, outcomes, agent-vs-app split) and
[`docs/design-standards.md`](docs/design-standards.md) (reason-string standard,
determinism, testing approach). Each decision below is one line plus its rationale; where
you want the reasoning in full, follow the link.

---

## Decisions

Architecture diagram and the credential model: [`docs/architecture.md`](docs/architecture.md).

| # | Decision | Rationale |
|---|---|---|
| D0 | Audience: individual trader running an AI agent | Not broker, not Hello Purple builder |
| D1 | **Proxy**, not checker — Preflight exclusively holds the `trading` credential | A denial must have no path to the broker, not merely be advice the agent may decline |
| D2 | **`observe` \| `enforce`** modes | Shadow-then-enforce is how policy systems ship; the journal becomes the evidence for promotion |
| D3 | Proxy **all five** mutations; gate `create_order` only | Otherwise the trader can no longer close a position |
| D4 | **No shared rule engine** across tools | `create_order` and `amend_position` barely overlap; a generic intent type would be premature generalization for two cases |
| D5 | Mirror cTrader's `create_order` schema exactly | Drop-in replacement; no unit translation to get wrong |
| D6 | Symbol metadata from hand-verified `symbols.yaml`, **fail closed** | Remote MCP exposes no contract specs (verified 3 ways); guessing `lotSize` is how 0.01 lots becomes a 1000× position |
| D7 | Three outcomes: `ALLOW` / `DENY` / `ERROR` | Policy refusal and gate failure are different events; conflating them corrupts any future quality metric |
| D8 | `policy.yaml` + Zod, fails loudly at startup | The brief says "rules I define"; YAML over JSON for comments, since a policy file is where the *why* lives |
| D9 | Reason-string standard is a hard requirement | "Errors say what to do, not just what broke", applied to policy decisions |
| D10 | Journal: one appended JSON line, no hash chain | Tamper-evidence is narrative at demo scale; JSONL is schemaless so it's a later one-liner |

Rationale for `D4` in full — what is shared gate machinery versus what stays disjoint
per tool — is in
[`docs/architecture.md`](docs/architecture.md#no-shared-rule-engine-across-tools).
`D6`'s evidence (all three probes) is in
[`docs/platform-findings.md`](docs/platform-findings.md).

## Files

As planned above, with two differences from what actually shipped: `symbols.ts` and
`policy.ts` merged into one `config.ts` (both are "load YAML, fail loudly" — splitting
them bought nothing), and `normalize.ts` never got built at all, since the pipettes guard
it would have carried was deferred (see [`SPEC.md`](SPEC.md#scope)) and no other
normalization turned out to be needed once Preflight mirrored cTrader's schema exactly.

```
src/domain.ts                        Intent, Decision, Outcome, RuleResult, JournalEntry
src/config.ts                        policy.yaml + symbols.yaml loaders, Zod, fail loud
src/rules/mandatory-stop-loss.ts
src/rules/max-lots-per-symbol.ts
src/amend-guard.ts                   Q-R10 guard; not a Rule, not routed through engine.ts
src/engine.ts                        pure: (intent, ctx, rules) => Decision
src/gate.ts                          shared pipeline: forward-if-permitted, then journal
src/journal.ts                       appendFileSync, one JSON line
src/ctrader.ts                       fetch-based MCP client (protocol proven via curl)
src/server.ts                        stdio MCP server; 2 gated + 3 pass-through in a loop
symbols.yaml                         EURUSD + XAUUSD, source: spotware-baseline, UNVERIFIED
policy.yaml                          trader-editable; comments carry the why
journal/decisions.jsonl              gitignored; a fixture journal committed as evidence
```

## Build order — TDD, red committed separately from green

Nothing is written yet, so red-green is available and used. For both rules and the
forwarding test: write the test, show it failing, commit it, then implement until green
and commit that. **The git history is the evidence and cannot be reconstructed later.**

| # | Step | Est |
|---|---|---|
| 1 | scaffold — package.json, tsconfig, vitest | 8m |
| 2 | domain types + `Decision` + three outcomes | 5m |
| 3 | `symbols.yaml` + Zod loader + provenance | 6m |
| 4 | `policy.yaml` + Zod loader, fail loud | 8m |
| 5 | normalize + pipettes guard | 8m |
| 6 | journal | 4m |
| 7 | **`mandatory-stop-loss` — test-first** | 10m |
| 8 | **`max-lots-per-symbol` — test-first** | 12m |
| 9 | **fake-client forwarding test — test-first** | 12m |
| 10 | cTrader MCP client | 12m |
| 11 | Preflight MCP server | 19m |
| 12 | live end-to-end against real remote MCP | 15m |
| | **total** | **~119m** |

**Checkpoint 20:15** — if steps 10 and 11 are not wired and green, `max-lots-per-symbol`
drops to P1 and `mandatory-stop-loss` ships alone. Named trigger, decided in advance
rather than judged at 20:45 when optimism is motivated. *(Didn't fire — both rules were
wired and green well before it. `amend_position` gating, not in this table at all when it
was written, shipped afterward against found slack; see `DIARY.md`.)*

**Not traded under any circumstance:** the live order path, and test-first on whatever
ships. Those two are what make the build mean anything.

## Verification

What the test suite must cover, and why, is defined in
[`docs/design-standards.md`](docs/design-standards.md#testing) — the thesis test,
determinism, and the golden conversion tables. This section covers only what must be
checked **for this build to be called done**:

- `npx vitest run` green, and `git log` shows a failing-test commit preceding each
  implementation commit. If the history doesn't show red-then-green, the standard wasn't
  met regardless of the final state.
- **Live, against the real remote MCP** — the claim `SPEC.md` makes and the one thing no
  mock can establish:
  1. **DENY path** — order with no stop loss. Refused, nothing reaches the broker,
     journal line written. Confirm via `get_order_history` that no order exists.
  2. **ALLOW path** — smallest valid order, **parameters shown for confirmation before
     sending**, position verified via `get_positions`, journal line written.
- `git status` clean of secrets; `.env` gitignored.

## Blocking input — resolved

`symbols.yaml` needed hand-transcribed values that never arrived during the build. The
fallback planned for exactly this case is what happened: seeded from the Spotware
baseline table, marked `source: spotware-baseline, status: UNVERIFIED`, caveat carried in
`symbols.yaml` itself and in `README.md`.

## Deferred

The full list with reasons is the "deliberately out" table in [`SPEC.md`](SPEC.md#scope)
— scope control is a graded part of that deliverable, so it's stated there once rather
than restated here. `amend_position`/`Q-R10`, listed as deferred when this plan was
written, shipped instead — see [`docs/platform-findings.md`](docs/platform-findings.md)
for the quirk and [`docs/guide.md`](docs/guide.md) for the live proof.
