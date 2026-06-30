import test from "node:test";
import assert from "node:assert/strict";
import { createFrontierScenario, isMissionVisibleTo } from "../dist/sim/scenario.js";

test("home policy applies immediately without scheduling a command signal", () => {
  const sim = createFrontierScenario();
  sim.issuePolicyChange("player", "sol", "Scout");
  const state = sim.getDebugState();
  assert.equal(state.stars.sol.policy, "Scout");
  assert.equal(state.pendingPolicyCommands.length, 0);
  assert.equal(sim.getView("player").stars.find((star) => star.id === "sol").knownPolicy, "Scout");
});

test("remote policy is delayed at the target and acknowledged back to home knowledge", () => {
  const sim = createFrontierScenario();
  const command = sim.issuePolicyChange("player", "vega", "Attack");
  assert.ok(command);
  assert.equal(sim.getDebugState().stars.vega.policy, "Scout");
  assert.equal(sim.getView("player").stars.find((star) => star.id === "vega").knownPolicy, "Scout");

  sim.advanceTo(command.commandArrivesAt - 0.01);
  assert.equal(sim.getDebugState().stars.vega.policy, "Scout");

  sim.advanceTo(command.commandArrivesAt);
  assert.equal(sim.getDebugState().stars.vega.policy, "Attack");
  assert.equal(sim.getView("player").stars.find((star) => star.id === "vega").knownPolicy, "Scout");
  assert.equal(sim.getDebugState().pendingPolicyCommands[0].status, "awaitingAck");

  const ackArrivesAt = sim.getDebugState().pendingPolicyCommands[0].ackArrivesAt;
  sim.advanceTo(ackArrivesAt);
  assert.equal(sim.getView("player").stars.find((star) => star.id === "vega").knownPolicy, "Attack");
  assert.equal(sim.getDebugState().pendingPolicyCommands.length, 0);
});

test("policy edits do not cancel already launched missions", () => {
  const sim = createFrontierScenario();
  assert.ok(sim.getView("player").missions.some((mission) => mission.kind === "colonize" && mission.fromStarId === "sol"));
  sim.issuePolicyChange("player", "sol", "Attack");
  assert.ok(sim.getView("player").missions.some((mission) => mission.kind === "colonize" && mission.fromStarId === "sol"));
});

test("scheduled event vocabulary stays at the first three event kinds", () => {
  const sim = createFrontierScenario();
  sim.issuePolicyChange("player", "vega", "Attack");
  const allowed = new Set(["signalArrives", "policyEvaluates", "missionArrives"]);
  for (const event of sim.getView("player").queuePreview) {
    assert.ok(allowed.has(event.kind), `unexpected event kind ${event.kind}`);
  }
});

test("knowledge timestamps live on projection snapshots, not truth entities", () => {
  const sim = createFrontierScenario();
  const state = sim.getDebugState();
  assert.equal(Object.hasOwn(state.stars.vega, "observedAt"), false);
  assert.equal(Object.hasOwn(state.stars.vega, "receivedAt"), false);
  const knownVega = sim.getView("player").stars.find((star) => star.id === "vega");
  assert.equal(typeof knownVega.observedAt, "number");
  assert.equal(typeof knownVega.receivedAt, "number");
});

test("missile destroys an enemy base at zero fortification without capturing it", () => {
  const sim = createFrontierScenario();
  const state = sim.getDebugState();
  state.stars.lyra.fortification = 1;
  state.stars.lyra.inertFortifyInterval = undefined;
  state.stars.lyra.inertFortifyCap = undefined;
  Object.assign(state.knowledge.player.stars.lyra, {
    state: "scouted",
    knownOwner: "rival",
    knownFortification: 1,
    observedAt: 0,
    receivedAt: 0,
    source: "test scout report"
  });

  sim.issuePolicyChange("player", "sol", "Attack");
  sim.advanceTo(30);

  assert.equal(state.stars.lyra.owner, undefined);
  assert.equal(state.stars.lyra.policy, undefined);
  assert.equal(state.stars.lyra.fortification, 0);
  const knownLyra = sim.getView("player").stars.find((star) => star.id === "lyra");
  assert.equal(knownLyra.state, "scouted");
  assert.equal(knownLyra.knownOwner, undefined);
});

test("inert bases fortify on their own cadence and stop at their cap", () => {
  const sim = createFrontierScenario();
  const state = sim.getDebugState();

  sim.advanceTo(8);
  assert.equal(state.stars.lyra.fortification, 1);
  assert.equal(state.stars.umbra.fortification, 8);

  sim.advanceTo(40);
  assert.equal(state.stars.lyra.fortification, 3);
  assert.equal(state.stars.mira.fortification, 3);
  assert.equal(state.stars.umbra.fortification, 8);
});

test("hidden rival missions are filtered until both endpoints are observed", () => {
  const sim = createFrontierScenario();
  const state = sim.getDebugState();
  const mission = {
    id: "rival-hidden",
    kind: "missile",
    owner: "rival",
    fromStarId: "umbra",
    toStarId: "sol",
    launchedAt: 0,
    arrivesAt: 1
  };

  assert.equal(isMissionVisibleTo(state.knowledge.player, mission), false);
  Object.assign(state.knowledge.player.stars.umbra, {
    state: "scouted",
    knownOwner: "rival",
    knownFortification: 5,
    observedAt: 0,
    receivedAt: 0
  });
  assert.equal(isMissionVisibleTo(state.knowledge.player, mission), true);
});

test("own scout telemetry does not reach or disappear at truth arrival before its delayed report", () => {
  const sim = createFrontierScenario();
  const state = sim.getDebugState();
  const scout = sim.getView("player").missions.find((mission) => mission.kind === "scout" && mission.fromStarId === "vega");
  assert.ok(scout);

  sim.advanceTo(scout.arrivesAt + 0.01);

  assert.equal(state.missions.some((mission) => mission.id === scout.id), false);
  const view = sim.getView("player");
  const observedScout = view.missions.find((mission) => mission.id === scout.id);
  assert.ok(observedScout, "scout telemetry should remain visible after truth arrival until the report is received");
  assert.ok(observedScout.observedAt < scout.arrivesAt);
  assert.ok(distance(observedScout, state.stars[scout.toStarId]) > 1);
  assert.equal(view.stars.find((star) => star.id === scout.toStarId).knownOwner, undefined);
  assert.equal(view.eventLog.some((entry) => entry.text.includes("scout is destroyed")), false);
});

test("scout arrival outcome and target facts become visible with the received report", () => {
  const sim = createFrontierScenario();
  const scout = sim.getView("player").missions.find((mission) => mission.kind === "scout" && mission.fromStarId === "vega");
  assert.ok(scout);
  sim.advanceTo(scout.arrivesAt + 0.01);
  const report = sim
    .getDebugState()
    .signals.find((signal) => signal.payload.kind === "report" && signal.payload.report.source === "scout mission");
  assert.ok(report);

  sim.advanceTo(report.arrivesAt);

  const view = sim.getView("player");
  const knownTarget = view.stars.find((star) => star.id === scout.toStarId);
  assert.equal(view.missions.some((mission) => mission.id === scout.id), false);
  assert.equal(knownTarget.knownOwner, "rival");
  assert.equal(knownTarget.knownFortification, 1);
  assert.equal(knownTarget.source, "scout mission");
  assert.ok(view.eventLog.some((entry) => entry.text.includes("scout is destroyed after relaying a snapshot")));
});

test("next player-visible event skips inert fortification with no log or knowledge change", () => {
  const sim = createFrontierScenario();
  const state = sim.getDebugState();
  const beforeView = sim.getView("player");
  const beforeLogCount = beforeView.eventLog.length;

  const result = sim.advanceToNextPlayerVisibleEvent("player", 2.6);

  assert.equal(result.found, false);
  assert.equal(sim.now, 2.6);
  assert.equal(state.stars.umbra.fortification, 6);
  const afterView = sim.getView("player");
  assert.deepEqual(afterView.stars, beforeView.stars);
  assert.equal(afterView.eventLog.length, beforeLogCount);
});

test("next player-visible event stops when a clear loggable event occurs", () => {
  const sim = createFrontierScenario();
  const beforeLogCount = sim.getView("player").eventLog.length;

  const result = sim.advanceToNextPlayerVisibleEvent("player", 12);

  assert.equal(result.found, true);
  assert.equal(result.event.kind, "signalArrives");
  assert.ok(sim.now > 2.6 && sim.now < 12);
  const logs = sim.getView("player").eventLog;
  assert.ok(logs.length >= beforeLogCount + 2);
  assert.ok(logs.some((entry) => /scout is destroyed|report received/.test(entry.text)));
});

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
