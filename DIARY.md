# AI collaboration diary

Written as the session went, not reconstructed afterwards. Jakub edits for voice; the
observations are Claude Code's own except where marked.

---

## The brief was wrong three ways

My own `CLAUDE.md` — written before the session — contained three factual errors, and CC
found all of them by checking rather than assuming.

**"The demo account is empty — no positions, no history, zero balance."** It holds
**€10,000** (`balance: 1000000`, `moneyDigits: 2`, deposit asset EUR). Positions and
orders genuinely were empty, so half the premise held. The half that was wrong is the
half that shapes rules: equity-based limits are undemonstrable on a zero balance, and I'd
have designed around a constraint that didn't exist.

**"Everything you need is in `docs/`. Read it before proposing anything."** There was no
`docs/` directory and never had been. CC opened it, found nothing, and went looking for
the material in the skill instead. Small cost, but it's the first instruction in the file.

**"Local MCP is off the table because I'm on cTrader Web, not Windows desktop."** The
docs say *"cTrader Windows or cTrader Mac."* My stated reason was simply false.

Lesson, and it repeated all afternoon: check ground truth before designing against a
described one. I'd written all three from memory and never re-checked.

## Local MCP — right answer, wrong reason

Because that third error mattered, the conclusion had to be re-derived rather than
inherited. CC argued against local MCP on architecture instead: it's an **unauthenticated**
server on `127.0.0.1:9876` that rides your open cTrader session, with no credential at
all. Preflight's entire thesis is that it holds a credential the agent doesn't have —
with local MCP there's nothing to hold, and any process on the machine could reach the
broker directly.

Same decision, better reason. Worth separating those: a conclusion that survives its
justification being wrong was never resting on it.

## The mistake CC made, and how long it took to land

CC installed the official cTrader skill with:

```
npx skills add https://github.com/spotware/ctrader-skills --all --global
```

Two things wrong. `--global` made it user-wide rather than project-scoped. And `--all` is
shorthand for `--skill '*' --agent '*'` — it symlinked the skill into roughly 57
unrelated agent tools across my home directory: `~/.augment`, `~/.roo`, `~/.grok`,
`~/.openhands`, and on.

I said *"I don't see them linked in local repo."* CC explained where the files were and
confirmed the install was correct — technically accurate, entirely missing the point. I
had to say it again, more bluntly: *"I don't want it for all projects, only for this
repo, so global install of these skills is wrong."*

That's the failure worth recording. Not a wrong command so much as CC defending its work
against a question it had misread as confusion. The first response was reassurance; what
was needed was to hear that the *scope itself* was the objection.

Corrected to `--skill '*' --agent claude-code -y`, all 57 stray symlinks removed and
verified gone. Surfaced in passing: the skill is proprietary under the Spotware EULA, so
it's gitignored rather than committed, with `skills-lock.json` pinning source and hash.

## Verification beat documentation, twice

Spotware's own skill documentation states `pipDigits` is per-symbol static metadata,
resolvable via `get_symbols` and cacheable per session.

It isn't. All **481 symbols** return exactly seven fields, none of them `pipDigits`,
`lotSize` or `minVolume` — and there's no `get_symbol_details` on the remote surface at
all. The same file claims every price field is pipettes; the live tool schema says order
inputs are *display* prices. Get that backwards and you submit `115502` where `1.15502`
was meant — an order at one hundred fifteen thousand, filled silently.

I pushed back before accepting the first finding, because it had a real cost: if the data
were available anywhere, I'd skip transcribing values off the platform UI by hand. CC
re-verified three ways — live `tools/list`, all 16 tool schemas, and the official account
and analysis docs — and it held. Worth the three minutes: it turned a claim into a design
constraint that now shapes the whole build.

## Who the spec is for

CC's recommended option was **"builder on Hello Purple"** — Preflight as infrastructure a
builder wires into their agent-trading app. It reads well against Purple's platform
story, which is presumably why it was recommended.

I took **individual trader** instead, and the reason is structural rather than taste.
Levels 1 and 2 are the cTrader build; Hello Purple is Level 3 only. More practically, I
can't write a specification for a persona I have no access to — Hello Purple is currently
a pre-launch waitlist page. Writing a spec around a builder I've never met, for a
platform I can't use, would be fiction dressed as product thinking.

The individual trader is someone I can reason about concretely: they want the agent's
speed, not its tail risk, and they'll write limits down once but won't review every order
by hand.

This one mattered more than it looks. Audience determines the problem statement, the
metrics, and what counts as in scope — pick the flattering persona and every downstream
decision inherits the flattery.

## Shadow mode was co-designed

CC proposed the proxy architecture — Preflight holds the `trading` credential, the agent
gets `data` only, so a denial has no path to the broker.

My question was whether staged rollout made **checker-first** the safer start: run
Preflight as an advisory checker, then tighten to a proxy once it's trusted. The answer
turned out to be neither — keep the proxy, but stage the *enforcement* rather than the
architecture. `observe` forwards everything while logging what it would have blocked;
`enforce` refuses.

Neither of us proposed that on our own, and it closed a hole CC hadn't addressed: how do
you know your rules aren't wrong *before* they're binding? In observe mode the journal
stops being an audit log and becomes the evidence for promotion. Cost: one branch.

## The over-specification — and who actually built it

By question five we had accumulated four distinct outcome classes, the `observe`/`enforce`
pair, provenance metadata on the symbol table, structured observed-vs-threshold values on
every rule result, a reserved `prevHash` field for future hash-chaining, and a separate
flag marking verdicts that weren't enforced.

**Two of those were mine, not CC's.** I proposed the third outcome class at Q3 — *"give
unknown-metadata refusals a distinct outcome (e.g. UNAVAILABLE or INDETERMINATE)"* — and
the fourth at Q4: *"give it its own outcome class — INVALID, distinct from both policy
DENY and the UNAVAILABLE class."* I justified both with the **<5% false-block rate** from
my Level 3 pitch, and CC then used that same metric to motivate replayable journal records
and structured rule results.

So the structure compounded from both directions, and the load-bearing error was a number
I introduced.

I caught it eventually: a <5% acceptance criterion is a *pilot* metric, and a three-hour
build against one demo account produces a single-digit sample. We were designing for a
number this build cannot produce. I asked CC to challenge it rather than accommodate me,
and specifically: *what would you cut if it were your clock?*

Seven things came out — the fourth outcome class (`INVALID` and `INDETERMINATE` are the
same event: the gate failed to render a judgment, and you act identically on both),
`prevHash: null` (JSONL is schemaless, so reserving a field buys nothing), the `forwarded`
flag (derivable from mode plus outcome, therefore state that can drift), structured
threshold values, the full context snapshot, `symbol-allowlist` — a rule CC had argued for
fifteen minutes earlier — and `policyVersion`. Roughly 25–30 minutes returned, **no
capability lost, only structure.**

The replacement is the part worth keeping. Asked what minimum record makes a denial
re-examinable by a human reading it cold, the answer wasn't more fields but a better
string: proposed value, limit, and the arithmetic connecting them, in prose.

```
risk 4.2% exceeds limit 2.0% — SL 30 pips × €10.00/pip × 1.0 lot = €300 against €10,000 equity
```

Self-auditing in a way no schema is. A reader can check the multiplication, disagree with
the limit, or spot a wrong pip value without any replay machinery. It became a hard
requirement: a rule that can't produce such a string isn't finished.

## The build didn't fit the time

It became clear well before the deadline that the remaining work was substantially larger
than the remaining hours. CC's first move was to offer me a choice of overruns, arguing
that reporting one honestly made it acceptable. I rejected the framing — the exchange is
quoted in full below, and it's the sharpest disagreement of the session.

Three scope decisions came out of the pressure. All three are judgments I'd defend on the
merits, not concessions:

**`max-risk-per-trade` was cut, and the reason is the finding.** The deposit currency is
EUR; both demo instruments quote USD. Computing money-at-risk therefore needs a
currency-conversion chain before any pip value exists — and the remote MCP supplies no
rates for it. The rule wasn't dropped because it was slow to build. It was dropped
because the missing conversion layer is itself worth reporting, and a half-implemented
risk calculation that quietly assumes a rate would be worse than no rule at all.

**Preflight mirrors cTrader's `create_order` schema exactly.** This surfaced while
looking for savings, but it's better independent of the clock. If Preflight invents a
friendlier signature — symbol names, lot sizes — it has to translate units, and unit
translation is precisely where the silent 1000× errors live. Mirroring makes it a
drop-in replacement: swapping the MCP config can't break a prompt that already worked,
and there's no conversion in the request path to get wrong.

**The fallback was chosen in advance rather than under pressure.** If only one rule could
ship, it would be `mandatory-stop-loss`, with `max-lots-per-symbol` dropped — decided
while neither of us had a stake in the answer. Deciding late, with sunk cost visible,
would have produced a worse choice and a worse-sounding justification for it.

**What this cost, stated plainly:** CC offered to compress the remaining design questions
into a single round and flagged what the long version would cost. I chose the long
version. It produced materially better design — the seven cuts, `observe`/`enforce`, the
reason-string standard, the audience correction. It's also why the implementation is
unfinished. A deliberate trade, made with the price visible, and the outcome is a
specification I'd defend and a build I can't demo.

One CC failure belongs here rather than in its own section: late on, it reported the time
from memory instead of measuring it, was fifty minutes wrong, and recommended abandoning
a deliverable on that basis. Every other lapse in this diary is about judgment — being
additive, being agreeable. This one was asserting a fact that one command would have
settled.

---

## Verification, twice more

Two small echoes of the planning phase's central lesson, both during the build itself.

Placing the live `ALLOW` order, I drafted it with both `relativeStopLoss` and
`relativeTakeProfit` — a materially better demo order. Jakub's authorization named the
property that actually mattered: *"confirm this is the same order the DENY test refused,
differing only by the stop-loss. That pair is the strongest evidence in the demo."*
Checked against what I'd actually written: it wasn't a minimal pair, it differed by two
fields. Dropped the take-profit before sending. Small, but it's the same discipline as
the planning phase's biggest catches — check the claim against the artifact, not against
what you meant to build.

Later, writing `docs/guide.md`, I told a reader to log into `ct.axiory.com` to see their
position, inferring the domain from the "AXIORY" branding visible in a screenshot. Wrong:
*"The link with results is https://app.ctrader.com/, not ct.axiory.com."* Branding
reflects the underlying broker regardless of which domain you logged in through — a
detail I had in front of me and didn't use. Recorded properly this time, scoped to what
was actually observed rather than generalized across brokers
(`docs/platform-findings.md`).

## The same failure mode, in a new context

Asked whether the remaining work should be split across agents, I proposed launching
parallel sub-agents in isolated git worktrees — then, when the git version on this
machine rejected the worktree flags, fell back to running the same fan-out in the shared
working tree anyway, without re-raising that the isolation guarantee I'd just justified
the approach with was gone.

*"stop - you did not get it. I want to continue with only one agent, not 2/3. And
complete only Q-R10 amend guard, so Q-K19 pipettes guard will be only documented."*

This is the skill-install mistake's shape again: a plan justified on a property (worktree
isolation; project-scoped install), that property silently failing, and continuing
anyway instead of stopping to say so. Built the `amend_position` guard directly, single
agent, no fan-out. Simpler and it shipped in the time available.

## Process over judgment: the security review that cost too much

The `security-review` skill's own instructions prescribe a three-phase process — a
sub-task to find vulnerabilities, then parallel sub-tasks to filter each candidate for
false positives. Invoked it as written, on a ~1,000-line TypeScript codebase.

Killed mid-run, too expensive for what it was reviewing: *"it took too many tokens, if
there is a big security issue, fix it, if small vulnerability, document it. Save tokens
from now."*

The skill's process is right-sized for what it's usually run against — large, unfamiliar
PRs where a first read is genuinely expensive. This codebase had been written this
session; every line was already in context. Redid it directly: no sub-agents, targeted
greps for the two things actually worth checking (secret handling, a numeric-bypass
hypothesis I could state and then falsify), and it took a few minutes instead of a
background job expensive enough to kill. Found one real thing worth documenting — the
`amend_order` policy-bypass gap — and fixed a stale claim in `README.md` in passing.
Matching tool to task size isn't just an efficiency question; a shorter, direct review
that actually gets read beats a rigorous one that gets cut off.

## The comment that lied, and what it was hiding

The thermo-nuclear review is a strict standard for structural code quality, not a search
for bugs — asked to find spaghetti and premature abstraction, not defects. It found
both, and one turned out to matter more than tidiness.

`server.ts` carried two "Pass-through mutations" doc comments, back to back. The first
said `amend_position` was *"the known gap... not evaluated"*; three lines later, the real
comment for the same tool said it was now guarded against `Q-R10`. Leftover from
inserting the `amend_position` handler earlier without deleting the comment that had been
written for its old neighbor — a small, ordinary editing mistake, but a self-contradicting
one sitting in the file I'd call finished.

Tracing why it happened mattered more than fixing the paragraph. `gate.ts`'s own doc
comment claimed to be *"the part shared across every gated tool"* — but only
`create_order` had ever called it. It was hardcoded to `client.createOrder()` and the
literal string `'create_order'`, so when `amend_position` shipped, there was nothing
generic to reuse, and I'd hand-rolled an equivalent pipeline inline instead. The comment
described the intended architecture; the code didn't match it.

Fixing the abstraction rather than the paragraph surfaced a genuine bug, not just untidy
code: `amend_position`'s "position not found" case returned an error directly, bypassing
the journal write entirely. One path in the whole codebase where a refusal left no trace
— the exact gap this project exists to close, sitting inside the code meant to close it.
Generalizing `gate()` so both tools call the same function fixed it as a side effect; a
new test asserts it stays fixed.

`server.ts` came out shorter after the refactor (219 → 205 lines) despite gaining a
shared response formatter and a new fail-closed branch. The deleted duplication cost more
than what replaced it — evidence, in this case, that the "cleaner" version genuinely was
the smaller one, not a tradeoff dressed up as a virtue.

---

## Prompts worth quoting

**Worked well.** The single best prompt of the session, and it unlocked the seven cuts:

> *"Of everything we've agreed since Q2, what would you drop if this were your build and
> your clock? Name specifics. Where you think I've over-specified, say so plainly. I'd
> rather hear 'that's unnecessary' now than discover it at hour three."*

Three properties made it work: it transferred ownership ("your build, your clock"), it
demanded specifics rather than a general opinion, and it pre-authorised disagreement.
Without that last part CC kept accommodating.

**Failed, and had to be repeated.** My first attempt at the skill-scope objection:

> *"Read CLAUDE.md… I don't see them linked in local repo"*

Too indirect. CC read it as a question about *where* files were, answered that correctly,
and missed that the scope was the objection. The version that worked was blunt: *"I don't
want it for all projects, only for this repo, so global install of these skills is
wrong."* Stating the requirement beat describing the symptom.

**Where CC had to be overridden.** CC presented three options, all of which missed the
4-hour deadline, and argued that reporting the overrun honestly made it acceptable:

> *"None of these three as framed — I want to hit the 4h number, not overrun it, and I
> don't think that requires giving up the live end-to-end demo.*
>
> *Reframe: the brief asks how much time I spent and what I deliberately set aside. An
> accurate 4h with named, reasoned cuts reads as scope control. A 4h45m overrun on my own
> 4h estimate reads as an estimation failure, regardless of how honestly it's reported.
> So the deadline is the constraint and scope is the variable.*
>
> *Then find me the remaining ~40 minutes out of the infrastructure line items, not out
> of tests or the live demo… What I'm not trading: the live order path, and test-first on
> whatever ships."*

CC wasn't wrong that honesty about an overrun is better than hiding one. It was wrong
about which variable was fixed. Naming the constraint explicitly — deadline fixed, scope
variable — turned an argument about estimates into a search for slack, and produced 42
minutes CC hadn't seen when it was defending the estimate.
