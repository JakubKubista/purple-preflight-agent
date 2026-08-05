# Regulatory and market context

This grounds the Level 3 pitch (already written, outside this repo). Pull it
in for SPEC.md's problem statement only if a citable "why this matters
beyond one demo" line is genuinely needed — the core Level 1/2 problem
(no deterministic pre-trade check exists) stands on its own without it.

## The regulatory hook

Purple Trading (the entity behind Purple LAB) operates under a CySEC
licence, which puts it inside MiFID II. RTS 6 within MiFID II already
requires investment firms doing algorithmic trading to run both pre-trade
and post-trade risk controls, continuous real-time market/credit risk
assessment, and complete electronic trading logs. In 2026, ESMA issued
supervisory guidance extending that expectation specifically to AI used
within algorithmic trading — firms are expected to self-assess AI's role in
the decision chain. This isn't hypothetical for Purple; it maps to an
obligation the regulated entity plausibly already has to think about.

## Market size, if a number is needed

Retail prop trading: roughly $850M market in 2026, up ~45% year over year,
with the top 5 firms controlling a majority of it. Broader prop trading
(institutional + retail) is a much larger, more fragmented market. cTrader
itself is used by 300+ brokers and prop firms with 11M+ traders on the
platform (Spotware's own public figures) — the realistic reachable base for
a Purple Engine capability, not the total market size.

## Why prop firms specifically care about rule enforcement

Prop firm economics depend on strict evaluation rules (max daily loss, max
drawdown, banned instruments) — industry reporting on evaluation pass rates
shows only a small fraction of funded-account attempts ever reach payout,
which is the whole point of the model. Today those rules are enforced
*after* a breach, by disqualifying the account. An agent can breach a limit
in seconds without any bad intent, faster than a review process reacts —
that's the specific way agentic trading makes an existing enforcement gap
worse rather than introducing a brand new problem.

## The incident reference used in the pitch

February 2026: an AI trading agent misread a single instruction and moved
roughly $442,000 in one transaction, with no cap on transaction size and no
deterministic check — the position was unwound within minutes. Not a
cTrader incident specifically, but the same class of failure this build is
about: no cap, no check, no chance to intervene before execution.
