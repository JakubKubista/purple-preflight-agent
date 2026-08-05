# AI collaboration diary

Written as the session went, not reconstructed afterwards. Entries are in the order the
things happened. Jakub edits for voice; the observations are Claude Code's own.

---

## 16:50 — A stale premise in my own brief

My `CLAUDE.md` said the demo account was empty: no positions, no history, zero balance,
and that anything built would have to work against that.

First thing CC did was call `get_balance`. The account holds **€10,000**
(`balance: 1000000`, `moneyDigits: 2`, deposit asset EUR). Positions and orders genuinely
were empty, so half the premise held — but the half that would have shaped the rules
(equity-based limits are undemonstrable on a zero balance) was wrong.

Lesson that repeated all afternoon: check the ground truth before designing against a
described one. I'd written that line from memory of the account setup and never
re-checked it.

---

## 17:10 — Local MCP: the reference material was wrong, and it mattered

I asked for the local MCP server to be set up. My own context files said local MCP
requires cTrader **Windows** desktop and was therefore off the table.

CC fetched the docs instead of trusting that, and the page says *"cTrader Windows or
cTrader Mac"*. So the reason my notes gave for skipping local MCP was false.

The interesting part is that the conclusion survived anyway, for a completely different
reason. CC argued against local MCP on architecture: it's an **unauthenticated** server
on `127.0.0.1:9876` that rides your open cTrader session, with no credential at all.
Preflight's entire thesis is that it holds a credential the agent doesn't have — and with
local MCP there's no credential to hold, so any process on the machine could reach the
broker directly. Local MCP would have made the build weaker, not stronger.

Right answer, wrong original reason. Worth separating those.

---

## 17:20 — The mistake CC made, and how long it took to land

CC installed the official cTrader skill with:

```
npx skills add https://github.com/spotware/ctrader-skills --all --global
```

Two things wrong. `--global` made it user-wide rather than project-scoped. And `--all` is
shorthand for `--skill '*' --agent '*'` — it symlinked the skill into roughly 57
unrelated agent tools across my home directory: `~/.augment`, `~/.roo`, `~/.grok`,
`~/.openhands`, and on and on.

I said *"I don't see them linked in local repo."* CC's response explained where the files
were and confirmed the install was correct — technically accurate, and completely missing
the point. I had to say it a second time, more directly: *"I don't want it for all
projects, only for this repo, so global install of these skills is wrong."*

That's the failure mode worth recording. It wasn't a wrong command so much as CC
defending its work against a question it had misread as confusion. The first response was
reassurance; what was needed was to hear that the *scope itself* was the objection.

Corrected to `npx skills add … --skill '*' --agent claude-code -y`, all 57 stray
symlinks removed and verified gone. Also surfaced in passing: the skill is proprietary
under the Spotware EULA, so it's gitignored rather than committed, with
`skills-lock.json` pinning source and hash so a reviewer can restore it in one command.

---

## 17:40 — Verification beat documentation, twice

Spotware's own skill documentation states that `pipDigits` is per-symbol static metadata,
resolvable via `get_symbols` and cacheable per session.

It isn't. CC probed the live server: all **481 symbols** return exactly seven fields —
`symbolId`, `symbolName`, `enabled`, `baseAssetId`, `quoteAssetId`, `symbolCategoryId`,
`description`. No `pipDigits`, no `lotSize`, no `minVolume`. And there is no
`get_symbol_details` on the remote surface at all — that tool exists only on local.

The same file claims every price field is in pipettes. The live tool schema says order
inputs are **display** prices, and the quirks ledger agrees. Get that backwards and you
submit `115502` where `1.15502` was meant — an order at a price of one hundred fifteen
thousand, filled silently.

I pushed back before accepting the first finding, because it had a real cost: if the data
were available anywhere, I'd skip transcribing values off the platform UI by hand. CC
re-verified three ways — live `tools/list`, all 16 tool schemas, and the official account
and analysis docs — and the answer held. Worth the three minutes: it turned a claim into
a design constraint, and it's now a documented finding in `SPEC.md`.

---

## 18:00 — Shadow mode: the one thing neither of us designed alone

CC proposed the proxy architecture — Preflight holds the `trading` credential, the agent
gets `data` only, so a denial has no path to the broker. Good, and it's the right shape.

I countered with staged rollout: `observe` first, forwarding everything but logging what
it *would* have blocked, promoting to `enforce` only once the data shows it isn't
over-blocking. That's how any policy enforcement system actually ships.

Neither of us proposed that architecture on our own, and it closed a hole CC hadn't
addressed: how do you know your rules aren't wrong *before* they're binding? In observe
mode the journal stops being an audit log and becomes the evidence for promotion.

Cost: one branch.

---

## 18:25 — The over-specification, and who caught it

By question five of the design grilling we had accumulated: four distinct outcome
classes, the `observe`/`enforce` pair, provenance metadata on the symbol table,
structured observed-vs-threshold values on every rule result, a reserved `prevHash` field
for future hash-chaining, and a separate flag marking verdicts that weren't enforced.

Every one of those was individually defensible. CC had argued for most of them.

What made the sum indefensible was a justification CC kept reaching for: the **<5%
false-block rate** from my Level 3 pitch. It was used to motivate replayable journal
records, the four-way outcome split, and structured rule results. I noticed the problem —
a <5% acceptance criterion is a *pilot* metric, and a three-hour build against one demo
account produces a single-digit sample. We were designing for a number this build cannot
produce.

I asked CC to challenge it rather than accommodate me, and specifically: *what would you
cut if it were your clock?* That reframing mattered. Until then CC had been optimizing to
be agreeable, and each individual "yes, and we could also…" was locally reasonable.

Seven things came out:

- the fourth outcome class — `INVALID` and `INDETERMINATE` are the same event (the gate
  failed to render a judgment) and you act identically on both
- `prevHash: null` — cargo cult; JSONL is schemaless, so reserving a field buys nothing
- the `forwarded` flag — derivable from mode plus outcome, therefore state that can drift
- structured threshold values on rule results
- the full replayable context snapshot
- `symbol-allowlist`, a rule CC had argued for fifteen minutes earlier
- `policyVersion`

Roughly 25–30 minutes returned, with **no capability lost — only structure**.

The replacement is the part worth remembering. Asked what minimum record makes a denial
re-examinable by a human reading it cold, the answer turned out not to be more fields but
a better string: proposed value, limit, and the arithmetic connecting them, in prose.

```
risk 4.2% exceeds limit 2.0% — SL 30 pips × €10.00/pip × 1.0 lot = €300 against €10,000 equity
```

That is self-auditing in a way no schema is. Someone can check the multiplication,
disagree with the limit, or spot a wrong pip value without any replay machinery. It
became a hard requirement: **a rule that cannot produce such a string isn't finished.**

Two lessons, neither flattering to the tooling:

**An AI collaborator defaults to additive.** Every question CC asked offered a richer
option and framed it as the recommendation. Nothing in the process pushed toward
subtraction until a human explicitly asked for it — and even then CC had to be told to
argue rather than agree.

**A metric borrowed from another document quietly became an architectural requirement.**
Nobody decided that. It happened because the number was available and sounded rigorous.

---

## 18:30 — Confronting the arithmetic instead of hoping

CC itemised the remaining build honestly: **3h07m of work against ~1h55m available.** Not
a gap any cut ladder closes.

CC's first instinct was to offer me overruns to choose between — finish at 21:20, or
21:35, or 22:00 — framing an accurate 4h45m as more honest than a padded 4h. I rejected
the framing. The brief asks what I spent and what I deliberately set aside; an accurate 4h
with named cuts reads as scope control, while a 45-minute overrun on my own estimate reads
as an estimation failure no matter how honestly it's reported. **Deadline is the
constraint; scope is the variable.**

So I asked where the fat actually was, and named the line items I suspected: the journal,
normalization, and the MCP server.

CC's answer, which I'd call genuinely honest rather than defensive:

- **Journal, 10m → 4m.** It's `appendFileSync(path, JSON.stringify(record) + '\n')`. The
  rest was padding.
- **Normalization, 15m → 8m** — and this surfaced a real design decision. It's only
  expensive if Preflight invents a friendlier signature and translates units. If Preflight
  **mirrors cTrader's `create_order` schema exactly**, there's no translation at all. That
  turned out to be better independent of the clock: it makes Preflight a drop-in
  replacement, so swapping the config can't break a prompt that already worked.
- **MCP server, 25m → 19m.** Four of the five proxied tools are identical pass-throughs,
  generatable in a loop.
- Plus smaller trims, and the cTrader client from 20m to 12m because CC had already proven
  the exact wire protocol by hand with `curl`, making it ~50 lines of `fetch` rather than
  SDK wiring.

**~42 minutes found, and CC's own test estimates had been pessimistic too.** Landed at
~119m against ~105m — about fifteen minutes over instead of seventy.

Rather than predict which way that goes, we set a **named trigger**: checkpoint at 20:15,
and if the client and server aren't wired and green by then, `max-lots-per-symbol` drops
to P1 and `mandatory-stop-loss` ships alone. Decided in advance, while neither of us had
a stake in being optimistic about it.

Two things I refused to trade: the live order path, and test-first on whatever ships.

---

## Prompts worth quoting

**Worked well** — the one that produced the best output all session:

> *"Of everything we've agreed since Q2, what would you drop if this were your build and
> your clock? Name specifics. Where you think I've over-specified, say so plainly. I'd
> rather hear 'that's unnecessary' now than discover it at hour three."*

Three properties made it work: it transferred ownership ("your build, your clock"), it
demanded specifics rather than a general opinion, and it pre-authorised disagreement.
Without that last part CC kept accommodating.

**Failed, and had to be repeated** — my first attempt at the skill-scope objection:

> *"Read CLAUDE.md… I don't see them linked in local repo"*

Too indirect. CC read it as a question about *where* files were and answered that
correctly, missing that the scope was the objection. The version that worked was blunt:
*"I don't want it for all projects, only for this repo, so global install of these skills
is wrong."* Stating the requirement beat describing the symptom.

**Where CC had to be overridden:** the overrun framing at 18:30. CC presented three
options that all missed the deadline and argued honest reporting made that fine. It
wasn't wrong about honesty — it was wrong about which variable was fixed.
