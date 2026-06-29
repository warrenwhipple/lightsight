import test from "node:test";
import assert from "node:assert/strict";
import { createFrontierScenario } from "../dist/sim/scenario.js";

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
  const command = sim.issuePolicyChange("player", "vega", "Fortify");
  assert.ok(command);
  assert.equal(sim.getDebugState().stars.vega.policy, "Scout");
  assert.equal(sim.getView("player").stars.find((star) => star.id === "vega").knownPolicy, "Scout");

  sim.advanceTo(command.commandArrivesAt - 0.01);
  assert.equal(sim.getDebugState().stars.vega.policy, "Scout");

  sim.advanceTo(command.commandArrivesAt);
  assert.equal(sim.getDebugState().stars.vega.policy, "Fortify");
  assert.equal(sim.getView("player").stars.find((star) => star.id === "vega").knownPolicy, "Scout");
  assert.equal(sim.getDebugState().pendingPolicyCommands[0].status, "awaitingAck");

  const ackArrivesAt = sim.getDebugState().pendingPolicyCommands[0].ackArrivesAt;
  sim.advanceTo(ackArrivesAt);
  assert.equal(sim.getView("player").stars.find((star) => star.id === "vega").knownPolicy, "Fortify");
  assert.equal(sim.getDebugState().pendingPolicyCommands.length, 0);
});

test("policy edits do not cancel already launched missions", () => {
  const sim = createFrontierScenario();
  assert.ok(sim.getView("player").missions.some((mission) => mission.kind === "colonize" && mission.fromStarId === "sol"));
  sim.issuePolicyChange("player", "sol", "Fortify");
  assert.ok(sim.getView("player").missions.some((mission) => mission.kind === "colonize" && mission.fromStarId === "sol"));
});

test("scheduled event vocabulary stays at the first three event kinds", () => {
  const sim = createFrontierScenario();
  sim.issuePolicyChange("player", "vega", "Fortify");
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
