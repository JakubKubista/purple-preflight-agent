# Interview notes — condensed

Two rounds completed before this case study. Condensed from the candidate's
own records, not a transcript. Salary and other personal negotiation details
are deliberately omitted.

## Who's assessing this

**Martin Urban — Head of Engineering.** Ten years at Purple, promoted the
whole way up: Senior JavaScript Full-Stack (2016) → Tech-Team Lead (2018) →
CTO for Web Technologies (2021) → Head of Engineering (2023). His own bio
line: the tech guy who never leaves a task before it's 100% perfect. Deep
serverless/AWS (Lambda, Step Functions, DynamoDB, AppSync, EventBridge,
Cognito), TypeScript/Node, React/Svelte, GraphQL, React Native, and **TDD**.

Two practical implications for this build. First, TypeScript/Node is his
native language, so the code will actually be read, not skimmed — and it's
also the candidate's own historical stack, which is why that's the natural
choice here. Second, he's a self-declared perfectionist who works TDD:
tests over the deterministic core aren't decoration for this audience,
they're the thing he'll look at first. A small, tested, honestly-scoped
build beats a broad one.

Also in round 2: a Tech Lead and HR.

## What Purple said about where they are

Three client use cases already delivered through the SDK. Go-to-market
instinct so far is smaller clients before enterprise. No dedicated product
head for Hello Purple yet — which matches the JD framing that this role is
meant to give the product an owner. Purple's own stated view is that
regulatory compliance and certification is a meaningful part of their moat.
They're also exploring blockchain as a new area. Company culture is built on
freedom and trust, including an annual week-long company-wide offsite where
people genuinely work.

There's a real, unresolved tension between Hello Purple as an *external*
builder-facing product and Purple's own *internal* engineering and product
priorities. The two don't automatically pull the same direction.

## The standing thesis this build extends

Raised in round 1, directly: does a builder platform even earn its place
when Claude plus API/MCP access already does most of this? The sharpened
answer — and the spine of this whole case study — is that Hello Purple isn't
defensible *as a no-code builder*, because builders are being commoditized
by AI monthly. What's defensible is the **licensed financial infrastructure
underneath**: Purple Trading holds a licence a builder can't obtain on its
own. The builder is packaging and distribution for those rails. The category
analogy is Stripe for payments, Clerk for auth, Solaris for banking —
Hello Purple as brokerage-as-a-service.

The product consequence, and it's the one that matters here: if the value is
in the rails rather than the UI, the priority isn't a prettier builder, it's
shortening the path from "I want to try this" to "I have a first transaction
running through licensed infrastructure."

Preflight is a direct extension of that thesis. It isn't a trading tool —
it's a rails-and-governance layer, the part a bare agent-plus-MCP setup
genuinely doesn't have.

## Martin's own framing of where MCP breaks — worth building against

Raised in preparation for round 2, and directly relevant to what this build
is *for*:

- Too many exposed tools bloat context and the model picks badly
- Poorly written tool descriptions cause nonsense calls
- **Permission granularity is missing — it's all-or-nothing access**
- Stateful operations compose poorly

The third one is essentially the Preflight thesis stated as a platform
complaint. Worth making that connection explicit in SPEC.md or README.

Related, from the same prep: in tool-calling the model never executes
anything itself — it returns a structured request, and the application
decides whether to carry it out. In fintech that boundary is where
governance lives. **The model proposes; the layer decides.**

## What makes an SDK good, per the same prep

Useful as a quality bar for whatever surface this build exposes:
time-to-first-success (how fast from install to first working call);
sensible defaults that can still be overridden; **errors that say what to do,
not just what broke**; auth wrapped so it can't be used unsafely; versioning
that doesn't break existing integrations.

## Known gaps, stated openly rather than bluffed

- **AWS.** Cloud background is GCP at an operational level, not AWS. Martin
  is a serverless evangelist and would spot bluffing immediately.
- **Fintech regulatory depth.** Familiar with the shape — broker licence
  under MiFID II, KYC/AML obligations, PSD2 for payments, e-money licence
  for wallets — and with the key product consequence, that Purple's licence
  is what lets a builder operate without holding one, which in turn defines
  the boundaries of what a builder may do on the platform. The detail is a
  compliance conversation, not a solo one.
- **Currently in a product/delivery role**, not coding daily for ~6 years.
  Hands-on foundation is JavaScript/TypeScript/React/Node.

## The risk this build is partly an answer to

From round 1 notes, an explicit warning: they want the builder led *as an
AI Product Engineer, not as a manager*. The instinct to organize and
delegate is the wrong one here — they want someone who sits with builders,
prototypes in no-code, and writes the concrete backlog item themselves.
This case study is the evidence for that, which is another reason the build
should be genuinely hands-on and honestly scoped rather than broad and
managed.

## Concrete stories available for the follow-up conversation

Not needed for the build itself, but useful if README or DIARY framing
wants to connect to them:

- **Kanbu.ai**: moving from a static RAG architecture to AI tool-calling
  during a segment pivot — an architectural decision with a product reason
  behind it.
- **Build vs. buy at a hackathon**: payments turned out too complex to
  build, switching to buy saved tens of person-days and brought the project
  back into budget.
- **Scenario-based elicitation**: walking a user through concrete scenarios
  instead of collecting abstract requirements, anchored on the question
  "if the output is technically correct and still wrong for you, what makes
  it wrong?" — a method, not an opinion.
- **SDK ownership at Norigin Media**: building SDKs for smart-TV and
  streaming platforms — external developers integrating your layer, which
  is the same category of problem as Purple Engine.
