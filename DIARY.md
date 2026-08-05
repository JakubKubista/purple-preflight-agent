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

## Confronting the arithmetic instead of hoping

CC itemised the remaining build honestly: **3h07m of work against ~1h55m available.** Not
a gap any cut ladder closes.

CC's first move was to offer me overruns to choose between — finish at 21:20, 21:35, or
22:00 — arguing an accurate 4h45m was more honest than a padded 4h. I rejected the
framing, and that exchange is quoted in full below.

Asked where the fat actually was, CC's answer was genuinely honest rather than defensive:
the journal was 10m budgeted for 4m of code (`appendFileSync`, one line); normalization
dropped 15m→8m once we decided Preflight should **mirror cTrader's `create_order` schema
exactly**, removing unit translation entirely — better independent of the clock, since it
makes Preflight a drop-in replacement; the MCP server 25m→19m because four of five
proxied tools are identical pass-throughs; the cTrader client 20m→12m because CC had
already proven the wire protocol by hand with `curl`.

**~42 minutes found**, landing at ~119m against ~105m — fifteen minutes over instead of
seventy. Rather than predict, we set a named trigger: checkpoint at 20:15, and if the
client and server aren't green by then, `max-lots-per-symbol` drops and
`mandatory-stop-loss` ships alone. Decided while neither of us had a stake in being
optimistic.

**What this cost, stated plainly:** at 18:10 CC offered to batch the remaining seven
grilling questions — roughly 5 minutes instead of 20 — and flagged the price. I chose the
full grilling. It produced materially better design: the seven cuts, `observe`/`enforce`,
the reason-string standard, the audience correction. It's also part of why the
implementation is unfinished. A deliberate trade, made with the cost visible, and the
outcome was a specification I'd defend and a build I can't demo.

## CC got the time wrong by fifty minutes

Late in the session CC reported "20:05, forty-five minutes left" and recommended
abandoning the live end-to-end path on that basis. The actual time was **19:16** — CC had
estimated elapsed time forward from a measurement taken 45 minutes earlier instead of
running `date`.

The consequence wasn't cosmetic. It manufactured a false dilemma — tested core *or* live
proxy, pick one — and pushed toward dropping a deliverable that `SPEC.md` explicitly
claims. Roughly 90 minutes existed, not 45.

Worth recording because it's a different failure to the others here. The rest are about
judgement — being additive, being agreeable. This one was just being wrong about a fact
that one command would have settled, and it nearly cost a deliverable on the strength of
confident arithmetic over a wrong input.

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
