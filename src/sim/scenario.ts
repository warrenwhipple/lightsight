import { EventQueue } from "./eventQueue.js";
import type {
  CurrentAction,
  EventKind,
  KnowledgeCache,
  LogEntry,
  MissionKind,
  MissionTrace,
  ObserverId,
  Owner,
  PendingPolicyCommand,
  Policy,
  ReportPayload,
  ScheduledEvent,
  SignalEnvelope,
  SimView,
  StarId,
  StarKnowledge,
  StarSnapshot,
  StarTruth
} from "./types.js";

const SIGNAL_SPEED = 88;
const SHIP_SPEED = 56;
const HOME_STAR_ID: StarId = "sol";
const PLAYER: ObserverId = "player";
const POLICY_DURATIONS: Record<Policy, number> = {
  Expand: 5,
  Fortify: 3,
  Scout: 4
};

interface SimState {
  now: number;
  stars: Record<StarId, StarTruth>;
  queue: EventQueue;
  signals: SignalEnvelope[];
  missions: MissionTrace[];
  pendingPolicyCommands: PendingPolicyCommand[];
  knowledge: Record<ObserverId, KnowledgeCache>;
  log: LogEntry[];
  nextIds: {
    event: number;
    signal: number;
    mission: number;
    command: number;
    log: number;
  };
}

export class LightSightSim {
  private state: SimState;

  constructor(state: SimState) {
    this.state = state;
  }

  get now(): number {
    return this.state.now;
  }

  get nextEventTime(): number | undefined {
    return this.state.queue.peekNext()?.time;
  }

  issuePolicyChange(observerId: ObserverId, starId: StarId, policy: Policy): PendingPolicyCommand | undefined {
    const knowledge = this.state.knowledge[observerId];
    const knownStar = knowledge.stars[starId];
    if (!knownStar || knownStar.state !== "owned") {
      throw new Error(`Cannot issue policy to uncontrolled star ${starId}`);
    }

    if (starId === knowledge.homeStarId) {
      const star = this.requireStar(starId);
      star.policy = policy;
      this.deliverReport(observerId, this.buildReport(starId, "local policy edit"), this.state.now);
      this.addLog(`Sol policy set to ${policy}; current action continues until its ready event.`, "control");
      return undefined;
    }

    const commandId = this.nextId("command");
    const delay = this.signalDelay(knowledge.homeStarId, starId);
    const command: PendingPolicyCommand = {
      id: commandId,
      starId,
      policy,
      issuedAt: this.state.now,
      commandArrivesAt: this.state.now + delay,
      status: "outbound"
    };
    this.state.pendingPolicyCommands.push(command);
    this.scheduleSignal(knowledge.homeStarId, starId, {
      kind: "setPolicy",
      commandId,
      starId,
      policy,
      issuedAt: this.state.now
    });
    this.addLog(`${knownStar.name} policy command sent: ${policy}; signal delay ${formatYears(delay)}.`, "control");
    return command;
  }

  advanceTo(targetTime: number): void {
    if (targetTime < this.state.now) {
      throw new Error("Simulation time cannot move backward");
    }

    while (true) {
      const next = this.state.queue.peekNext();
      if (!next || next.time > targetTime) {
        break;
      }
      this.runNextEvent();
    }
    this.state.now = targetTime;
  }

  runNextEvent(): ScheduledEvent | undefined {
    const event = this.state.queue.popNext();
    if (!event) {
      return undefined;
    }
    this.state.now = event.time;
    this.handleEvent(event);
    return event;
  }

  getView(observerId: ObserverId): SimView {
    const knowledge = this.state.knowledge[observerId];
    return {
      now: this.state.now,
      homeStarId: knowledge.homeStarId,
      stars: Object.values(knowledge.stars).map((star) => ({ ...star })),
      signals: this.state.signals.map((signal) => structuredClone(signal)),
      missions: this.state.missions.map((mission) => ({ ...mission })),
      pendingPolicyCommands: this.state.pendingPolicyCommands.map((command) => ({ ...command })),
      eventLog: this.state.log.slice(-80).map((entry) => ({ ...entry })),
      queuePreview: this.state.queue.snapshot(10).map((event) => ({ ...event }))
    };
  }

  getDebugState(): Readonly<SimState> {
    return this.state;
  }

  collectQueuedEventKinds(): EventKind[] {
    return [...new Set(this.state.queue.snapshot(200).map((event) => event.kind))];
  }

  private handleEvent(event: ScheduledEvent): void {
    if (event.kind === "signalArrives") {
      this.handleSignalArrives(event.signalId);
      return;
    }
    if (event.kind === "policyEvaluates") {
      this.handlePolicyEvaluates(event.starId);
      return;
    }
    this.handleMissionArrives(event.missionId);
  }

  private handleSignalArrives(signalId: string): void {
    const signalIndex = this.state.signals.findIndex((signal) => signal.id === signalId);
    if (signalIndex < 0) {
      return;
    }

    const [signal] = this.state.signals.splice(signalIndex, 1);
    if (!signal) {
      return;
    }

    const payload = signal.payload;
    if (payload.kind === "setPolicy") {
      const star = this.requireStar(payload.starId);
      star.policy = payload.policy;
      const pending = this.state.pendingPolicyCommands.find((command) => command.id === payload.commandId);
      const ackDelay = this.signalDelay(payload.starId, HOME_STAR_ID);
      if (pending) {
        pending.status = "awaitingAck";
        pending.ackArrivesAt = this.state.now + ackDelay;
      }
      this.scheduleSignal(payload.starId, HOME_STAR_ID, {
        kind: "ack",
        commandId: payload.commandId,
        starId: payload.starId,
        policy: payload.policy,
        effectiveAt: this.state.now
      });
      return;
    }

    if (payload.kind === "ack") {
      this.deliverPolicyAck(PLAYER, payload.commandId, payload.starId, payload.policy, payload.effectiveAt);
      return;
    }

    this.deliverReport(PLAYER, payload.report, this.state.now);
    const subject = this.state.knowledge[PLAYER].stars[payload.report.subjectId];
    this.addLog(`${subject.name} report received; observed ${formatYears(this.state.now - payload.report.observedAt)} ago.`, "info");
  }

  private handlePolicyEvaluates(starId: StarId): void {
    const star = this.requireStar(starId);
    if (!star.owner || !star.policy) {
      return;
    }

    if (star.currentAction && star.currentAction.completesAt <= this.state.now + 0.0001) {
      this.completeCurrentAction(star);
    }

    if (star.currentAction) {
      return;
    }

    const policy = star.policy;
    const duration = POLICY_DURATIONS[policy];
    if (policy === "Fortify") {
      star.currentAction = {
        kind: "fortify",
        policyAtStart: policy,
        startedAt: this.state.now,
        completesAt: this.state.now + duration,
        label: "building fortifications"
      };
      this.schedulePolicyEvaluation(star.id, star.currentAction.completesAt, "ready");
      this.addVisibleLocalLog(star, `${star.name} starts fortifying; next policy check at t=${formatTime(star.currentAction.completesAt)}.`);
      return;
    }

    const missionKind: MissionKind = policy === "Scout" ? "scout" : "colonize";
    const targetId = missionKind === "scout" ? this.chooseScoutTarget(star) : this.chooseColonizeTarget(star);
    if (!targetId) {
      star.currentAction = this.makeCooldown(policy, this.state.now + 2, "no viable target");
      this.schedulePolicyEvaluation(star.id, star.currentAction.completesAt, "ready");
      return;
    }

    this.scheduleMission(star.id, targetId, missionKind, star.owner);
    star.currentAction = this.makeCooldown(policy, this.state.now + duration, `${missionKind} launch cooldown`);
    this.schedulePolicyEvaluation(star.id, star.currentAction.completesAt, "ready");
  }

  private handleMissionArrives(missionId: string): void {
    const missionIndex = this.state.missions.findIndex((mission) => mission.id === missionId);
    if (missionIndex < 0) {
      return;
    }

    const [mission] = this.state.missions.splice(missionIndex, 1);
    if (!mission) {
      return;
    }

    if (mission.kind === "scout") {
      this.sendReportToHome(mission.toStarId, "scout mission");
      this.addVisibleLocalLog(this.requireStar(mission.fromStarId), `${this.requireStar(mission.toStarId).name} scout arrives; report is now in flight.`);
      return;
    }

    const target = this.requireStar(mission.toStarId);
    if (!target.owner) {
      target.owner = mission.owner;
      target.policy = "Scout";
      target.fortification = 0;
      this.schedulePolicyEvaluation(target.id, this.state.now + 1, "newColony");
      this.addVisibleLocalLog(this.requireStar(mission.fromStarId), `${target.name} colony founded; first report is in flight.`);
    }
    this.sendReportToHome(target.id, "colony mission");
  }

  private completeCurrentAction(star: StarTruth): void {
    const action = star.currentAction;
    star.currentAction = undefined;
    if (!action || action.kind !== "fortify") {
      return;
    }
    star.fortification += 1;
    this.sendReportToHome(star.id, "fortification report");
    this.addVisibleLocalLog(star, `${star.name} fortification complete under ${action.policyAtStart}.`, "mission");
  }

  private scheduleSignal(fromStarId: StarId, toStarId: StarId, payload: SignalEnvelope["payload"]): SignalEnvelope {
    const sentAt = this.state.now;
    const signal: SignalEnvelope = {
      id: this.nextId("signal"),
      fromStarId,
      toStarId,
      sentAt,
      arrivesAt: sentAt + this.signalDelay(fromStarId, toStarId),
      payload
    };
    this.state.signals.push(signal);
    this.state.queue.enqueue({
      id: this.nextId("event"),
      kind: "signalArrives",
      time: signal.arrivesAt,
      signalId: signal.id
    });
    return signal;
  }

  private scheduleMission(fromStarId: StarId, toStarId: StarId, kind: MissionKind, owner: Owner): MissionTrace {
    const launchedAt = this.state.now;
    const mission: MissionTrace = {
      id: this.nextId("mission"),
      kind,
      owner,
      fromStarId,
      toStarId,
      launchedAt,
      arrivesAt: launchedAt + this.travelDelay(fromStarId, toStarId)
    };
    this.state.missions.push(mission);
    this.state.queue.enqueue({
      id: this.nextId("event"),
      kind: "missionArrives",
      time: mission.arrivesAt,
      missionId: mission.id
    });
    this.addVisibleLocalLog(this.requireStar(fromStarId), `${this.requireStar(fromStarId).name} launches ${kind} mission to ${this.requireStar(toStarId).name}.`, "mission");
    return mission;
  }

  private schedulePolicyEvaluation(starId: StarId, time: number, reason: "initial" | "ready" | "newColony"): void {
    this.state.queue.enqueue({
      id: this.nextId("event"),
      kind: "policyEvaluates",
      time,
      starId,
      reason
    });
  }

  private sendReportToHome(starId: StarId, source: string): void {
    const report = this.buildReport(starId, source);
    if (starId === HOME_STAR_ID) {
      this.deliverReport(PLAYER, report, this.state.now);
      return;
    }
    this.scheduleSignal(starId, HOME_STAR_ID, {
      kind: "report",
      report
    });
  }

  private deliverPolicyAck(observerId: ObserverId, commandId: string, starId: StarId, policy: Policy, effectiveAt: number): void {
    const pendingIndex = this.state.pendingPolicyCommands.findIndex((command) => command.id === commandId);
    if (pendingIndex >= 0) {
      this.state.pendingPolicyCommands.splice(pendingIndex, 1);
    }

    const knowledgeStar = this.state.knowledge[observerId].stars[starId];
    knowledgeStar.knownPolicy = policy;
    knowledgeStar.observedAt = effectiveAt;
    knowledgeStar.receivedAt = this.state.now;
    knowledgeStar.source = "policy acknowledgement";
    this.addLog(`${knowledgeStar.name} acknowledged ${policy}; effective at t=${formatTime(effectiveAt)}.`, "control");
  }

  private deliverReport(observerId: ObserverId, report: ReportPayload, receivedAt: number): void {
    const cache = this.state.knowledge[observerId];
    const star = cache.stars[report.subjectId];
    const snapshot = report.snapshot;
    star.state = snapshot.owner === observerId ? "owned" : "scouted";
    star.knownOwner = snapshot.owner;
    star.knownPolicy = snapshot.owner === observerId ? snapshot.policy : undefined;
    star.knownFortification = snapshot.fortification;
    star.observedAt = report.observedAt;
    star.receivedAt = receivedAt;
    star.source = report.source;
  }

  private buildReport(starId: StarId, source: string): ReportPayload {
    const star = this.requireStar(starId);
    const snapshot: StarSnapshot = {
      id: star.id,
      name: star.name,
      x: star.x,
      y: star.y,
      owner: star.owner,
      policy: star.policy,
      fortification: star.fortification
    };
    return {
      subjectId: star.id,
      source,
      observedAt: this.state.now,
      snapshot
    };
  }

  private chooseScoutTarget(star: StarTruth): StarId | undefined {
    const cache = this.state.knowledge[PLAYER];
    const candidates = Object.values(cache.stars).filter((known) => {
      return known.id !== star.id && known.state === "catalog-only" && !this.hasMissionTo(known.id, "scout", star.owner);
    });
    return nearestStarId(star, candidates);
  }

  private chooseColonizeTarget(star: StarTruth): StarId | undefined {
    const candidates = Object.values(this.state.stars).filter((candidate) => {
      return candidate.id !== star.id && !candidate.owner && !this.hasMissionTo(candidate.id, "colonize", star.owner);
    });
    return nearestStarId(star, candidates);
  }

  private hasMissionTo(starId: StarId, kind: MissionKind, owner?: Owner): boolean {
    return this.state.missions.some((mission) => mission.toStarId === starId && mission.kind === kind && (!owner || mission.owner === owner));
  }

  private addVisibleLocalLog(star: StarTruth, text: string, tone: LogEntry["tone"] = "mission"): void {
    if (star.owner === "player" && star.id === HOME_STAR_ID) {
      this.addLog(text, tone);
    }
  }

  private addLog(text: string, tone: LogEntry["tone"]): void {
    this.state.log.push({
      id: this.nextId("log"),
      time: this.state.now,
      text,
      tone
    });
  }

  private makeCooldown(policy: Policy, completesAt: number, label: string): CurrentAction {
    return {
      kind: "cooldown",
      policyAtStart: policy,
      startedAt: this.state.now,
      completesAt,
      label
    };
  }

  private signalDelay(fromStarId: StarId, toStarId: StarId): number {
    return distance(this.requireStar(fromStarId), this.requireStar(toStarId)) / SIGNAL_SPEED;
  }

  private travelDelay(fromStarId: StarId, toStarId: StarId): number {
    return distance(this.requireStar(fromStarId), this.requireStar(toStarId)) / SHIP_SPEED;
  }

  private requireStar(starId: StarId): StarTruth {
    const star = this.state.stars[starId];
    if (!star) {
      throw new Error(`Unknown star ${starId}`);
    }
    return star;
  }

  private nextId(kind: keyof SimState["nextIds"]): string {
    const id = this.state.nextIds[kind];
    this.state.nextIds[kind] += 1;
    return `${kind}-${id}`;
  }
}

export function createFrontierScenario(): LightSightSim {
  const stars: Record<StarId, StarTruth> = {
    sol: { id: "sol", name: "Sol", x: 128, y: 284, owner: "player", policy: "Expand", fortification: 1 },
    vega: { id: "vega", name: "Vega", x: 390, y: 150, owner: "player", policy: "Scout", fortification: 0 },
    aster: { id: "aster", name: "Aster", x: 310, y: 424, fortification: 0 },
    lyra: { id: "lyra", name: "Lyra", x: 612, y: 228, fortification: 0 },
    mira: { id: "mira", name: "Mira", x: 688, y: 418, fortification: 0 },
    umbra: { id: "umbra", name: "Umbra", x: 778, y: 132, owner: "rival", policy: "Expand", fortification: 2 }
  };

  const knowledge: KnowledgeCache = {
    observerId: PLAYER,
    homeStarId: HOME_STAR_ID,
    stars: Object.fromEntries(
      Object.values(stars).map((star) => [
        star.id,
        {
          id: star.id,
          name: star.name,
          x: star.x,
          y: star.y,
          state: "catalog-only"
        } satisfies StarKnowledge
      ])
    ) as Record<StarId, StarKnowledge>
  };

  const state: SimState = {
    now: 0,
    stars,
    queue: new EventQueue(),
    signals: [],
    missions: [],
    pendingPolicyCommands: [],
    knowledge: { player: knowledge },
    log: [],
    nextIds: {
      event: 1,
      signal: 1,
      mission: 1,
      command: 1,
      log: 1
    }
  };

  const sim = new LightSightSim(state);
  knowledge.stars.sol = {
    ...knowledge.stars.sol,
    state: "owned",
    knownOwner: "player",
    knownPolicy: "Expand",
    knownFortification: 1,
    observedAt: 0,
    receivedAt: 0,
    source: "home sensors"
  };
  knowledge.stars.vega = {
    ...knowledge.stars.vega,
    state: "owned",
    knownOwner: "player",
    knownPolicy: "Scout",
    knownFortification: 0,
    observedAt: 0,
    receivedAt: 0,
    source: "old colony report"
  };
  knowledge.stars.aster = {
    ...knowledge.stars.aster,
    state: "scouted",
    knownFortification: 0,
    observedAt: -4,
    receivedAt: 0,
    source: "old scout report"
  };
  state.log.push({
    id: "log-0",
    time: 0,
    text: "Home cache loaded: catalog sky plus stale Vega and Aster reports.",
    tone: "info"
  });
  state.queue.enqueue({ id: "event-0a", kind: "policyEvaluates", time: 0, starId: "sol", reason: "initial" });
  state.queue.enqueue({ id: "event-0b", kind: "policyEvaluates", time: 0, starId: "vega", reason: "initial" });
  sim.advanceTo(0);
  return sim;
}

function nearestStarId(origin: StarTruth, candidates: Array<{ id: StarId; x: number; y: number }>): StarId | undefined {
  let nearest: { id: StarId; score: number } | undefined;
  for (const candidate of candidates) {
    const score = distance(origin, candidate);
    if (!nearest || score < nearest.score) {
      nearest = { id: candidate.id, score };
    }
  }
  return nearest?.id;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function formatYears(years: number): string {
  return `${years.toFixed(1)}y`;
}

function formatTime(time: number): string {
  return time.toFixed(1);
}
