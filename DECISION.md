# Light Sight Prototype

Fresh start for a 2D star-field strategy prototype centered on finite-speed information and control.

<!-- decision-mode: schema=0.2; reviewed=2026-06-25 -->

**Criteria**
- HIGH - AI-assisted iteration friendly: headless, deterministic, testable
- HIGH - Light-speed delay is core mechanic, not presentation detail
- HIGH - DES simulation separate from visualization
- HIGH - Prototype quickly exposes whether delayed control feels interesting
- LOW - Detailed intra-system simulation
- LOW - Multiplayer before AI opponent proves loop

## Prototype Architecture

Choose stack and boundaries for first build.

**Criteria**
- HIGH - Headless simulation can run in CLI and tests
- HIGH - Visualizer reads simulation state/events without owning rules
- HIGH - Simple enough for AI coding assistant to extend safely
- HIGH - Deterministic replay and seeded scenarios

**Options**
- Headless TypeScript DES package plus browser visualizer
  - PRO - Same language for sim, tests, and visualizer
  - PRO - Easy canvas/SVG/WebGL visualization
  - CON - Need discipline to keep UI out of rules
- Headless Python DES plus separate web visualizer
  - PRO - Simple simulation scripting and tests
  - CON - More integration friction for live visualizer
- Existing game engine first
  - PRO - Faster visual affordances
  - CON - More likely to blur simulation and presentation

**Decision**
- Status - LEANING
- Encoding - NOT_ENCODED
- Choice - Headless TypeScript DES package plus browser visualizer
- Confidence - TENTATIVE
- Why - Best fit for simultaneous CLI/test iteration and visual feedback while keeping one language.

## First Playable Loop

What should the earliest prototype prove?

**Criteria**
- HIGH - Makes information/control delay legible
- HIGH - Needs antagonist pressure, likely AI first
- HIGH - Minimal rules, many visible consequences
- HIGH - Player decisions should be about stale observations and delayed orders
- LOW - Rich economy, diplomacy, or star-system internals

**Options**
- Frontier expansion duel with programmable remote bases
  - PRO - Combines game pressure with delayed-control decisions
  - PRO - Remote standing orders make latency strategically relevant
  - CON - Slightly more design surface than a pure signal sandbox
- Expansion race against distant AI homeworld
  - PRO - Natural use for delayed scouting, commands, and feedback
  - PRO - Simple win condition: control/reach/production advantage
  - CON - Risk of becoming generic 4X if delay is not central
- Remote bases with programmable standing orders
  - PRO - Forces player to reason around delayed updates
  - PRO - Highlights command latency and stale observations
  - CON - Needs careful UI/state explanation
- Pure signal-and-sensor sandbox
  - PRO - Fastest way to test relativity-like visibility
  - CON - May not feel like a game yet

**Decision**
- Status - DECIDED
- Encoding - NOT_ENCODED
- Choice - Frontier expansion duel with programmable remote bases
- Confidence - SURE
- Why - Combines antagonist pressure with delayed-control decisions; remote autonomy makes light-speed latency central.

## Remote Base Programming

How does the player control remote bases despite command delay?

**Criteria**
- HIGH - Makes delayed orders and stale state strategically legible
- HIGH - Simple enough for first prototype and AI-assisted tests
- HIGH - Lets bases act before home can observe current conditions
- HIGH - Supports later expansion without redesigning the core loop
- HIGH - Avoids turning long-distance play into delayed micromanagement
- HIGH - Easy to inspect from event logs: current policy, trigger, action
- LOW - Preserve path to richer remote programmability later
- LOW - Fully expressive scripting in first prototype

**Options**
- Policy plus small parameter set
  - PRO - Best fit for autonomous bases under stale information
  - PRO - Expressive enough for expansion/defense/scouting tradeoffs
  - PRO - Can compile to explicit DES events for tests and logs
  - CON - Needs careful choice of first policies and parameters
- Limited policy modes
  - PRO - Easiest to implement, test, and visualize
  - PRO - Clear player mental model
  - CON - May feel too coarse if the interesting choice is tactical
- Explicit order queue
  - PRO - Concrete delayed-command model
  - PRO - Easy to inspect in logs and tests
  - CON - Can become micromanagement with long latency
- Lightweight rule scripting
  - PRO - Strong autonomy fantasy
  - CON - Too much surface area for first prototype
- Programmable remote systems with custom decision language
  - PRO - Ambitious version of remote autonomy fantasy
  - CON - Bonkers for early prototype; likely huge UI, safety, testing, and language-design scope
  - CON - Deferred option, not v0 competitor

**Decision**
- Status - DECIDED
- Encoding - NOT_ENCODED
- Choice - Policy plus small parameter set
- Confidence - SURE
- Why - Captures standing-order autonomy without full scripting or delayed micromanagement; preserve programmable systems as later possibility.

## First Remote Policies

Which policy set should a base support first?

**Criteria**
- HIGH - Each policy creates different behavior before home observes results
- HIGH - Small vocabulary for CLI, tests, and visualizer
- HIGH - Antagonist AI can use same policy model
- LOW - Complete strategic coverage

**Options**
- Expand / Fortify / Scout
  - PRO - Minimal triangle: growth, safety, information
  - PRO - Easy for AI opponent to use
  - CON - No explicit economy tuning
- Expand / Defend / Raid / Scout
  - PRO - Adds direct conflict behavior
  - CON - More combat assumptions earlier
- Weighted priorities: expansion, defense, scouting, production
  - PRO - Smooth parameterized behavior
  - CON - Harder to read at first glance

**Decision**
- Status - DECIDED
- Encoding - NOT_ENCODED
- Choice - Expand / Fortify / Scout
- Confidence - SURE
- Why - Smallest policy set worth trying; enough to test growth, safety, and information under delayed observation.

## Home System Control

Should the home system use the same policy model as remote bases, or direct editable orders?

**Criteria**
- HIGH - Home is fixed locus of control and should feel live
- HIGH - Avoids unnecessary complexity in first prototype
- HIGH - Preserves clarity between immediate local decisions and delayed remote autonomy
- HIGH - Still testable headlessly
- LOW - Perfect symmetry between all controlled systems

**Options**
- Home uses editable order queue, remote bases use policies
  - PRO - Home feels like command center with immediate control
  - PRO - Remote policy difference reinforces information-delay theme
  - PRO - Queue is easy to inspect, edit, and test at home
  - CON - Two control models in first prototype
- All controlled systems use policies
  - PRO - Beautifully simple and symmetric model
  - PRO - Fewer UI/control concepts
  - CON - Home may feel oddly indirect despite no local delay
- All systems use queues, with remote queues delayed by messages
  - PRO - Single concrete command model
  - CON - Likely delayed micromanagement; weakens remote autonomy idea

**Decision**
- Status - LEANING
- Encoding - NOT_ENCODED
- Choice - Home uses editable order queue, remote bases use policies
- Confidence - TENTATIVE
- Why - The home system can make live decisions with current local information; remote bases need autonomy because home observes them late.

## Time And Causality Model

How strict should the first DES be about causality and observability?

**Criteria**
- HIGH - No faster-than-light messages or observations
- HIGH - Home system is fixed locus of control
- HIGH - Remote actions can execute before home observes acknowledgement
- HIGH - Testable with simple scenarios: 10 ly command, 10 y ack

**Options**
- Strict event simulation with explicit signal travel events
  - PRO - Directly models core mechanic
  - PRO - Easy to test causality
  - CON - Requires careful event/state API design
- Approximate delay layers over tick simulation
  - PRO - Potentially simpler visually
  - CON - Risks hiding the core mechanic in implementation shortcuts

**Decision**
- Status - LEANING
- Encoding - NOT_ENCODED
- Choice - Strict event simulation with explicit signal travel events
- Confidence - TENTATIVE
- Why - The mechanic depends on causality being correct and inspectable.

## Immediate Prototype Scope

What should exist before broader game design?

**Criteria**
- HIGH - Tests feel of stale observation and delayed control, not just code plumbing
- HIGH - Headless CLI/test result plus minimal visual playback
- HIGH - Uses decided loop: frontier duel, remote base policies, Expand/Fortify/Scout
- HIGH - Small enough to throw away
- HIGH - Does not require resolving all UI or economy design first

**Options**
- DES core, CLI scenarios, tests, minimal visualizer
  - PRO - Validates architecture and core mechanic together
  - CON - Visual polish deferred
- Visual toy first, then extract simulation
  - PRO - Faster subjective feel
  - CON - Repeats likely false-start pattern

**Jobs**
- TODO - Rehearsal - Snapshot DECISION.md and build disposable vertical slice of decided frontier: frontier duel, policy-based remote base, Expand/Fortify/Scout, deterministic DES, CLI event log, minimal visual playback; assume home queue and strict signal-event model for rehearsal only; report materialized decisions, assumptions, contradictions, and whether delayed-control moments feel meaningful.

**Decision**
- Status - LEANING
- Encoding - NOT_ENCODED
- Choice - DES core, CLI scenarios, tests, minimal visualizer
- Confidence - TENTATIVE
- Why - User wants fresh start optimized for AI-assisted coding and avoiding previous false starts.
