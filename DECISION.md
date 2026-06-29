# Light Sight Prototype

Fresh start for a 2D star-field strategy prototype centered on finite-speed information and control.

<!-- decision-mode: schema=0.3; reviewed=2026-06-29 -->

**Criteria**
- HIGH - AI-assisted iteration friendly: headless, deterministic, testable
- HIGH - Light-speed delay is core mechanic, not presentation detail
- HIGH - DES simulation separate from visualization
- HIGH - Prototype quickly exposes whether delayed control feels interesting
- LOW - Detailed intra-system simulation
- LOW - Multiplayer before AI opponent proves loop

**Rehearsals**
- R1 - PROMOTED - frontier control slice; outcome: basic controls legible enough, landed into main repo as v0 baseline; covers: Home System Control, First Interactive Control, DES Runtime Model, First Event Kinds, Policy Evaluation Cadence, Knowledge Projection Data Model, Report / Message / Knowledge Shapes; try: http://127.0.0.1:4174/; thread: 019f12f8-96d0-79c2-acc4-9f6af4526d0a; worktree: /Users/warrenwhipple/.codex/worktrees/4a8d/lightsight; note: /private/tmp/decision-flow-jobs/2026-06-29-0640-rehearsal-frontier-control.md

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
- Status - DECIDED
- Encoding - ENCODED
- Choice - Headless TypeScript DES package plus browser visualizer
- Confidence - SURE
- Why - Fastest way to iterate on the prototype: one language for sim/tests/visualizer, browser feedback loop, deterministic headless DES. R1 promotion confirms this as the v0 prototype stack, while final game stack can still be revisited later.

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
- Encoding - ENCODED
- Choice - Frontier expansion duel with programmable remote bases
- Confidence - SURE
- Why - Combines antagonist pressure with delayed-control decisions; rehearsal made remote autonomy central, but enemy pressure still too indirect.

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
- Encoding - ENCODED
- Choice - Policy plus small parameter set
- Confidence - SURE
- Why - Captures standing-order autonomy without full scripting or delayed micromanagement; rehearsal showed remote base acting before home sees acknowledgement.

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
- Encoding - ENCODED
- Choice - Expand / Fortify / Scout
- Confidence - SURE
- Why - Smallest policy set worth trying; rehearsal proved vocabulary works, but policy semantics are still toy-level.

## Home System Control

Should the home system use the same policy model as remote bases, or direct editable orders?

**Criteria**
- HIGH - Home is fixed locus of control and should feel live
- HIGH - Avoids unnecessary complexity in first prototype
- HIGH - Preserves clarity between immediate local decisions and delayed remote autonomy
- HIGH - Still testable headlessly
- LOW - Perfect symmetry between all controlled systems

**Options**
- Same policy controls everywhere; home applies immediately, remote changes arrive after signal delay
  - PRO - One control vocabulary for player and AI
  - PRO - Home still feels responsive
  - PRO - Remote delay is isolated to command transmission, not a different UI model
  - CON - Home may feel less like a command center than an explicit order queue
- Home uses editable order queue, remote bases use policies
  - PRO - Home feels like command center with immediate control
  - PRO - Remote policy difference reinforces information-delay theme
  - PRO - Queue is easy to inspect, edit, and test at home
  - CON - Two control models in first prototype
- All systems use queues, with remote queues delayed by messages
  - PRO - Single concrete command model
  - CON - Likely delayed micromanagement; weakens remote autonomy idea

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - Same policy controls everywhere; home applies immediately, remote changes arrive after signal delay
- Confidence - TENTATIVE
- Why - User wants one policy-control model for home and distant bases; home policy changes initiate immediately, remote policy changes demonstrate command delay.

## First Interactive Control

What minimum player action makes delayed control feel real?

**Criteria**
- HIGH - Player issues a command and later sees delayed consequence
- HIGH - Avoids looping-video feel
- HIGH - Makes why/when events happen inspectable
- HIGH - Small enough for next rehearsal iteration
- LOW - Full production UI

**Options**
- Edit policy on owned system: home immediate, remote delayed
  - PRO - Same interaction tests both live control and delayed remote control
  - PRO - Directly matches unified control model
  - PRO - Clear contrast: home behavior changes now, remote behavior changes after arrival
  - CON - Needs UI to show pending remote policy change
- Send command to known remote base: change policy
  - PRO - Directly tests delayed remote control
  - PRO - Reuses decided policy model
  - PRO - Clear before/after: order sent, arrives later, base behavior changes
  - CON - Requires a remote base already exists or is quickly established
- Choose next home launch target
  - PRO - Immediate agency from the home system
  - PRO - Simple click/select interaction
  - CON - Delay may feel like ship travel, not information/control delay
- Request scout report from a remote/base/frontier
  - PRO - Makes stale knowledge explicit
  - PRO - Report arrival can be clearly delayed
  - CON - Weaker sense of strategic control unless paired with a later command

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - Edit policy on owned system: home immediate, remote delayed
- Confidence - TENTATIVE
- Why - First meaningful action should be policy control; applying the same action locally and remotely makes command delay legible without introducing a second control model.

## Time And Causality Model

How strict should the first DES be about causality and observability?

**Criteria**
- HIGH - No faster-than-light messages or observations
- HIGH - Home system is fixed locus of control
- HIGH - Remote actions can execute before home observes acknowledgement
- HIGH - Observations distinguish source-time from home-received-time
- HIGH - Avoid conflating ship travel speed with signal speed
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
- Encoding - ENCODED
- Choice - Strict event simulation with explicit signal travel events
- Confidence - TENTATIVE
- Why - The mechanic depends on causality being correct and inspectable; rehearsal produced explicit command, acknowledgement, scout, and colony report events.

## DES Runtime Model

How do event queue, messages, reports, and state relate?

**Criteria**
- HIGH - Future-event queue is the simulation driver
- HIGH - Event handlers mutate canonical truth or observer knowledge
- HIGH - Signal/message data can ride inside scheduled arrival events
- HIGH - Knowledge cache is state, not a queued event
- HIGH - Supports fast-forward by running events until target time
- LOW - Rewind in first prototype

**Options**
- Priority queue of scheduled events; signals/reports are event payload data
  - PRO - Simple DES mental model
  - PRO - Clear line between runtime scheduling and domain data
  - PRO - Easy to test: run until time/event, inspect truth and knowledge
  - CON - Rewind requires snapshots or replay, not just moving now backward
- Persistent pending-signal table plus separate arrival events
  - PRO - Easier to inspect in UI
  - CON - More bookkeeping unless pending signals need gameplay visibility
- Derive all future events from rules each tick
  - PRO - Less explicit queue surface
  - CON - Becomes tick simulation, weakens causality/log clarity

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - Priority queue of scheduled events; signals/reports are event payload data
- Confidence - SURE
- Why - User frames DES as a queue moving now forward. Envelopes/reports are not the queue itself; they are payloads carried by scheduled events such as signal arrival. Knowledge cache is materialized state updated when arrival events fire. Fast-forward runs queue to target time; rewind deferred.

## First Event Kinds

What scheduled event kinds should v0 need?

**Criteria**
- HIGH - Minimal vocabulary, broad payloads
- HIGH - Supports policy editing: home immediate, remote delayed
- HIGH - Supports autonomous policy behavior
- HIGH - Supports observed-only map through delayed reports
- HIGH - Easy event log assertions
- LOW - Model every domain verb as its own event kind

**Options**
- signalArrives / policyEvaluates / missionArrives
  - PRO - Small set covers command delay, reports, autonomous action, and travel
  - PRO - Payloads distinguish setPolicy, report, ack, scout, colonize
  - PRO - Avoids confusing user input with queued simulation events
  - CON - policyEvaluates cadence needs a simple rule
- Many specific event kinds: commandArrives, reportArrives, scoutArrives, colonyArrives, policyChanges
  - PRO - Logs read very explicitly
  - CON - More boilerplate and weaker envelope/payload separation
- Single generic event with handler callback
  - PRO - Small engine core
  - CON - Harder to inspect, serialize, and test as a game log

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - signalArrives / policyEvaluates / missionArrives
- Confidence - SURE
- Why - Keep the queue semantics simple: user input may apply now or schedule signalArrives; signal payloads carry commands/reports/acks; policyEvaluates runs a system's current policy; missionArrives mutates truth when physical travel completes.

## Policy Evaluation Cadence

When should policyEvaluates events occur?

**Criteria**
- HIGH - Avoid full global tick loop
- HIGH - A policy change affects future autonomous choices, not past queued missions
- HIGH - Easy to show why a base acted
- HIGH - Deterministic and simple to test
- HIGH - Action duration/cooldown can define next decision point
- HIGH - Policy command semantics: "next policy is X"
- LOW - Perfect economic timing realism
- LOW - Cancel current build/action in v0

**Options**
- Each controlled system self-schedules next policyEvaluates when current action/build/cooldown completes
  - PRO - Truly sparse DES: no fixed sweep or artificial cadence
  - PRO - A base acts when ready, then schedules its next readiness timeout
  - PRO - Remote policy changes naturally affect next not-yet-started action
  - CON - Need each action to define duration/cooldown
- Each controlled system self-schedules next policyEvaluates at fixed interval
  - PRO - Sparse DES: only active systems add events
  - PRO - Clear cadence for logs and UI
  - PRO - Policy changes naturally affect next evaluation
  - CON - Fixed interval may feel artificial
- Evaluate immediately on every policy change, then reschedule
  - PRO - Feels responsive
  - CON - Remote policy arrival could cause bursty action and muddle delay
- Global yearly/monthly policy sweep event
  - PRO - Simple to reason about
  - CON - Looks like a tick loop and schedules inactive systems
- Evaluate only when resources/mission slots become available
  - PRO - More elegant long-term DES
  - CON - More hidden state dependencies for v0

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - Each controlled system self-schedules next policyEvaluates when current action/build/cooldown completes
- Confidence - SURE
- Why - Sparse DES version: a starbase acts when its policy timeout fires, schedules the resulting action or mission, then schedules its next policy timeout from that action's duration/cooldown. Delayed policy commands mean "next policy is X"; they update future choices, not already-started actions. Cancel/current-build interrupt deferred.

## Knowledge Projection Data Model

Where do observed/source time and received time live?

**Criteria**
- HIGH - Single global clock is OK: static systems, delayed signals, not full relativity
- HIGH - Canonical universe state remains God's-eye truth
- HIGH - Observer knowledge must not leak truth
- HIGH - Player and AI can query knowledge without recomputing whole history
- LOW - Persist every derived view if replay can reconstruct it

**Options**
- Truth plus materialized knowledge projection
  - PRO - Universe entities stay canonical and timestamp-light
  - PRO - observedAt/receivedAt live on reports, messages, and last-known snapshots
  - PRO - UI and AI read observer knowledge, debug can read truth
  - CON - Need clear boundaries so projection never becomes hidden truth
- Truth only; derive knowledge ad hoc from event log
  - PRO - Minimal stored state
  - CON - Harder for UI, AI, and tests to query current player knowledge
- Store observedAt/receivedAt directly on universe entities
  - PRO - Simple at first glance
  - CON - Pollutes God's-eye truth with observer-specific metadata

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - Truth plus materialized knowledge projection
- Confidence - SURE
- Why - User frames sim as delayed-time, not relativistic: keep authoritative God's-eye state, with observed/received timing on information artifacts and observer knowledge snapshots rather than canonical world entities. Materialized projection is rebuildable, but practical for UI, AI, and tests.

## Report / Message / Knowledge Shapes

What shape should delayed-information data use?

**Criteria**
- HIGH - Truth entities do not carry observer-specific fields
- HIGH - One signal/message envelope handles commands, reports, acks
- HIGH - Reports snapshot only what was observed at source time
- HIGH - Knowledge projection keeps latest known snapshot per observer/subject
- HIGH - Shapes are easy to assert in tests and event logs
- LOW - Final TypeScript field names now

**Options**
- Signal envelope + report payload + knowledge cache
  - PRO - Separates transmission, observation, and current known view
  - PRO - Same signal model handles policy commands and reports
  - PRO - UI/AI query cache, debug/tools can inspect truth and logs
  - CON - Three small concepts instead of one flat state object
- Event log only; derive knowledge on demand
  - PRO - Very pure replay model
  - CON - More awkward for live UI, AI, and tests
- Per-entity observer metadata
  - PRO - Looks simple early
  - CON - Mixes truth with who knows what

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - Signal envelope + report payload + knowledge cache
- Confidence - SURE
- Why - Fits decided truth/projection split: canonical state emits delayed signals; report payloads carry observedAt; observer knowledge cache records receivedAt and latest known snapshot.

## Home Knowledge Display

How should home show stale observations without leaking omniscient state?

**Criteria**
- HIGH - Default view preserves uncertainty
- HIGH - Data/logs keep observed/source time and home/received time
- HIGH - Player UI shows freshness/lag, not raw timestamps by default
- HIGH - Debug playback may expose omniscient truth separately
- HIGH - Delay must be felt through player action, not just event animation
- HIGH - Simplest first version: map as observed, no forecasts
- HIGH - Static distant stars are initially visible via ancient light; bases/colonies/ownership are not

**Options**
- Observed map with ancient starlight star catalog
  - PRO - Distant stars can be visible from start without leaking current installations
  - PRO - Matches intuition: stars have been shining since before civilization
  - CON - Need clear visual distinction between known star and known activity
- Observed map only: last-known state with freshness derived from observedAt/receivedAt
  - PRO - Makes stale reports explicit
  - PRO - Simple and hard to confuse with omniscience
  - CON - May underserve planning
- Last-known plus predicted current state
  - PRO - Helps plan remote orders
  - CON - Can imply false certainty

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - Observed map with ancient starlight star catalog
- Confidence - TENTATIVE
- Why - Simplest version resolves the omniscience leak without hiding the sky: static star positions are known from ancient light at game start, while mutable facts are exactly what home has observed, not projected truth. Underlying observations carry source/received times; player-facing UI should show stale/fresh status without raw timestamp clutter. Remaining details: no-report activity state, freshness affordance, and dev-only truth/debug view.

## Star Knowledge Visual States

How should the map distinguish known stars, scouted systems, and owned systems?

**Criteria**
- HIGH - Player can tell catalog-only star from scouted star from owned/expanded star
- HIGH - Catalog-only stars visible but not treated as known installations
- HIGH - Selection state obvious on map and details list
- HIGH - Narrow stacked layout keeps map size stable when details height changes
- LOW - Final icon language in v0

**Options**
- Three explicit states: catalog-only / scouted / owned
  - PRO - Matches user mental model
  - PRO - Explains why some gray stars need scouting while owned stars can receive policies
  - CON - Need visual vocabulary beyond color alone
- Ownership color only
  - PRO - Simple
  - CON - Confuses unscouted star with scouted non-owned star
- Hide unscouted stars
  - PRO - Less visual ambiguity
  - CON - Contradicts ancient starlight star catalog decision

**Decision**
- Status - LEANING
- Encoding - ENCODED
- Choice - Three explicit states: catalog-only / scouted / owned
- Confidence - TENTATIVE
- Why - User expects three overall states: star known but unscouted, star scouted/observed, star expanded/owned. Current gray stars do not communicate that distinction.

## In-Flight Map Objects

What should be visible while time runs?

**Criteria**
- HIGH - Map shows why log events are happening
- HIGH - Policy communication visually differs from scouts and colony/expansion missions
- HIGH - Preserve DES truth: in-flight markers can be scheduled objects/messages, not ticks
- HIGH - Helps delayed control feel spatial, not just textual
- LOW - Physically perfect trajectories

**Options**
- Show three in-flight traces: policy signal / scout mission / colony mission
  - PRO - Makes command delay, scouting, and expansion visible in different ways
  - PRO - Connects pending/log text to map motion
  - CON - Need simple encoding for signals versus ships
- Show pending messages only in panel/log
  - PRO - Easy
  - CON - Map feels static while important events happen
- Animate only mission ships, not signals
  - PRO - Simpler visual load
  - CON - Weakens policy communication as core mechanic

**Decision**
- Status - LEANING
- Encoding - ENCODED
- Choice - Show three in-flight traces: policy signal / scout mission / colony mission
- Confidence - TENTATIVE
- Why - Current rehearsal log makes sense, but map does not show policy communications, scout ships, or expansion ships; visible traces should make delayed information/control legible.

## Playback Time Controls

How should the player advance simulation time?

**Criteria**
- HIGH - Player can pause and let time run steadily
- HIGH - Engine remains sparse DES, not a global tick sim
- HIGH - UI can advance to visual frames by draining all events before the next display time
- HIGH - Manual next-event control remains useful
- HIGH - Auto-pause on important/surprising events that invite decisions
- LOW - Rewind in first prototype

**Options**
- Play/pause steady rate + next event + auto-pause important events
  - PRO - Feels like time is running, not just stepping through a log
  - PRO - Preserves DES: run events until next visual/display time
  - PRO - Auto-pause can surface new colony, enemy discovery, command arrival, attack
  - CON - Need define which events are pause-worthy
- Manual next / +5 / +20 only
  - PRO - Easy to implement and debug
  - CON - Feels odd and tool-like for play
- Continuous tick simulation
  - PRO - Familiar game loop
  - CON - Undermines sparse DES and event-log clarity

**Decision**
- Status - LEANING
- Encoding - REHEARSED
- Choice - Play/pause steady rate + next event + auto-pause important events
- Confidence - TENTATIVE
- Why - User wants DES internally but a smoother player-facing clock: pause/play and next are good, fixed +5/+20 stepping feels odd. Renderer can request steady time slices while the engine drains queued events before each display time and pauses on decision-worthy surprises.

## Pressure And Win Condition

What first pressure makes delayed control matter?

**Criteria**
- HIGH - Enemy activity legible through delayed reports, not omniscient map
- HIGH - Win/loss simple enough to avoid full 4X economy
- HIGH - Forces hard remote policy choices

**Decision**
- Status - OPEN
- Encoding - NOT_ENCODED
- Choice - unresolved
- Confidence - TENTATIVE
- Why - R1 basic controls are legible enough to move on; next learning needs stakes/pressure to test whether delayed control is interesting rather than merely understandable.

## Immediate Prototype Scope

What should exist before broader game design?

**Criteria**
- HIGH - Tests feel of stale observation and delayed control, not just code plumbing
- HIGH - Headless CLI/test result plus minimal visual playback
- HIGH - Uses decided loop: frontier duel, remote base policies, Expand/Fortify/Scout
- HIGH - Land promoted control baseline before stakes work to reduce rehearsal overhead
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
- REVIEWED - Implementation - Landed promoted R1 control slice into main repo as v0 prototype baseline; npm test passed; local server verified at http://127.0.0.1:4174/.
- REVIEWED - Rehearsal Outcome - R1 promoted as reference for control model; gameplay feedback: basic controls are understandable, next iteration should test stakes/pressure; tech stack remains prototype-leaning, not final lock-in; try: http://127.0.0.1:4173/?v=r1-viewport-layout; thread: 019f12f8-96d0-79c2-acc4-9f6af4526d0a; worktree: /Users/warrenwhipple/.codex/worktrees/4a8d/lightsight; note: /private/tmp/decision-flow-jobs/2026-06-29-0640-rehearsal-frontier-control.md
- READY - Rehearsal Iteration - R1 layout lock: app fits desktop viewport without whole-page scrolling; map/panels visible together; internal list/log scroll only; tests + browser smoke passed; try: http://127.0.0.1:4173/?v=r1-viewport-layout; thread: 019f12f8-96d0-79c2-acc4-9f6af4526d0a; worktree: /Users/warrenwhipple/.codex/worktrees/4a8d/lightsight; note: /private/tmp/decision-flow-jobs/2026-06-29-0640-rehearsal-frontier-control.md
- READY - Rehearsal Iteration - R1 star list selection/copy: fixed list selection during playback; renamed visible "Knowledge" panel to "Known stars"; tests + browser smoke passed; try: http://127.0.0.1:4173/?v=r1-list-selection-fix; thread: 019f12f8-96d0-79c2-acc4-9f6af4526d0a; worktree: /Users/warrenwhipple/.codex/worktrees/4a8d/lightsight; note: /private/tmp/decision-flow-jobs/2026-06-29-0640-rehearsal-frontier-control.md
- READY - Rehearsal Iteration - R1 map selection: fixed direct star-field selection while paused or playing; tests + browser smoke passed; try: http://127.0.0.1:4173/?v=r1-selection-fix-2; thread: 019f12f8-96d0-79c2-acc4-9f6af4526d0a; worktree: /Users/warrenwhipple/.codex/worktrees/4a8d/lightsight; note: /private/tmp/decision-flow-jobs/2026-06-29-0640-rehearsal-frontier-control.md
- REVIEWED - Rehearsal Iteration - Discarded after review; keep decisions only. Feedback: narrow stacked layout makes map size jump with details height, selected star should be obvious on map, gray stars do not distinguish catalog-only vs scouted, and map needs visible policy signals/scout missions/colony missions; report: /private/tmp/decision-flow-jobs/2026-06-26-0734-rehearsal-time-controls.md; thread: 019f0076-a574-7dc2-bbc3-b3a70a83ff49; worktree: /Users/warrenwhipple/.codex/worktrees/ca75/lightsight
- REVIEWED - Rehearsal - Discarded after review; keep decisions only. Sparse policy controls + observed-only map feedback: distant stars should start visible as stars, timing controls need play/pause steady run, next-event, and auto-pause on important surprises; tests + browser sanity passed; report: /private/tmp/decision-flow-jobs/2026-06-25-1625-rehearsal-sparse-policy.md; thread: 019f0076-a574-7dc2-bbc3-b3a70a83ff49; worktree: /Users/warrenwhipple/.codex/worktrees/ca75/lightsight
- REVIEWED - Rehearsal - Discarded after review; tests + browser playback passed, but feedback: animated looping-video feel, no user control, delay not felt, stretched vertical layout; report: /private/tmp/decision-flow-jobs/2026-06-25-1251-rehearsal-frontier-duel.md; worktree: /Users/warrenwhipple/.codex/worktrees/b83b/lightsight.

**Decision**
- Status - DECIDED
- Encoding - ENCODED
- Choice - DES core, CLI scenarios, tests, minimal visualizer
- Confidence - TENTATIVE
- Why - User wants fresh start optimized for AI-assisted coding and avoiding previous false starts; promoted R1 is now landed as the source-controlled v0 prototype baseline for faster stakes iteration.
