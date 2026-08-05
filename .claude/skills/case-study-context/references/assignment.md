# The job and the assignment

## The role — AI Product Engineer, Purple LAB (Brno)

Purple LAB is the development studio inside Purple Technology, a fintech firm
with a global broker-facing business. Purple LAB builds and runs applications
for brokers. The role owns **Hello Purple** — a public platform where
builders and AI-assisted developers create fintech apps — and **Purple
Engine**, the layer under it: SDKs, CLI, MCP servers, and auth surfaces that
power Hello Purple. This is not an execute-a-backlog role; Hello Purple is
still finding its shape, and the hire is expected to help find it.

Core responsibilities as posted: own the product vision and 6–12 month
roadmap for Hello Purple; own positioning and messaging; sit with external
builders during onboarding to find friction points and prioritize fixes;
translate builder feedback into concrete backlog items; build lightweight
prototypes to validate ideas before engineering time is spent; define and
track product metrics (time-to-first-app, builder activation, retention);
own Purple Engine as a product — what the engine needs to support, in what
order, translated from Hello Purple's external needs into SDK/CLI/MCP
requirements; participate in technical design reviews without owning the
architecture; keep the product story consistent across Hello Purple and
Purple Engine as they evolve.

What they're looking for: product thinking with a clear user lens; technical
literacy — can read code, understands API/SDK/auth flows, doesn't need to own
architecture but needs to understand it; real familiarity with MCP, agent
tooling, and current AI-coding practice (Claude Code, Cursor, agentic IDEs)
as working tools, not buzzwords; comfort making decisions with incomplete
information in a product that hasn't stabilized yet; fluency in Czech and
English for product communication. Nice-to-haves: experience as a user or
product person on a builder platform (Vercel, Supabase, Stripe, Clerk-type
products); no-code/low-code tooling experience (n8n, Make); fintech domain
exposure (trading, payments, identity).

## The case study brief, as given

The case study evaluates product thinking, technical literacy,
communication, and how the candidate collaborates with AI — explicitly not
about producing a finished product. Purple's own framing: an unfinished
build with sharp, honest commentary on where it broke beats a polished build
with no reflection. They want to know afterward how much time was spent,
what was easy vs. hard, how the work would improve with more time, and what
was surprising about working with AI.

Setup: a demo cTrader account is provided. Once cTrader ID / login is active,
the candidate connects it to the **official cTrader MCP server**, which
links cTrader to AI coding agents (Claude Code, Cursor, etc.).

**Level 1 — Technical specification.** Get familiar with the cTrader MCP,
pick a small product idea that uses it, and write a short spec covering: the
problem and who it's for; scope, including what's deliberately left out
given the time available; how it uses the cTrader MCP — which tools/
resources get called, and what the AI agent handles vs. what the app itself
handles; 1–2 success metrics. Purple's own note: a tight one-pager beats a
sprawling design doc, and if the build ends up drifting from the spec, say
why — that's useful information too.

**Level 2 — Build it.** Build the thing specified in Level 1, end-to-end,
on top of the cTrader MCP. Doesn't have to be finished — Purple explicitly
says they'd rather see an unfinished app with honest commentary on where it
got stuck than a polished one with no reflection. The build itself is
framed as "audit evidence" of where the platform helped, where it fought
back, and where AI tooling fit in.

**Level 3 (optional) — Propose something Hello Purple could build.** Based
on what was seen and built, propose something Hello Purple could ship on top
of AI-agent trading that doesn't exist today: what gap led to the idea, who
it's for, and roughly how it fits alongside what Hello Purple already
offers. A one-pager is enough — sharpness of the idea and the reasoning
matters more than spec depth. *(This part is being produced outside this
repo — see CLAUDE.md.)*

**AI collaboration diary.** Document the actual journey, struggles
included: a prompt that worked well and why, one that failed and how it was
recovered from, a moment where the AI had to be corrected or overridden.
Actual prompts included where relevant, not paraphrased after the fact.

**Vision for AI-agent trading at Hello Purple.** Where would AI-agent
trading go as a product at Hello Purple — who it should serve, what would
make builders and traders choose it, what to bet on over the next 6–12
months. Strategic, not technical.

**What to submit:** the Level 1 spec (any format, can be in the repo); the
app with committed docs, finished or not, GitHub link; the Level 3 pitch
(one-pager); the AI collaboration diary; the vision; a rough time budget
(optional but appreciated).

Purple's own recommendations, worth taking literally: make notes along the
way; don't hide struggles — they learn more from difficulty than from a
polished result; ask the AI for help liberally; be honest in reflection,
there's no "right" amount of AI usage; commit brainstorm/plan/design docs to
the repo, including the Level 1 spec, before or while building — they want
to see the thinking, not just the output.
