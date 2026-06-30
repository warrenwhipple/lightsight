import { EventQueue } from "./eventQueue.js";
import type {
  CurrentAction,
  EventKind,
  KnowledgeCache,
  LogEntry,
  MissionKind,
  MissionTelemetry,
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
const SCOUT_SPEED = SIGNAL_SPEED * 0.5;
const MISSILE_SPEED = SIGNAL_SPEED * 0.5;
const EXPANSION_SPEED = SIGNAL_SPEED * 0.25;
const HOME_STAR_ID: StarId = "sol";
const PLAYER: ObserverId = "player";
const POLICY_DURATIONS: Record<Policy, number> = {
  Scout: 4,
  Attack: 3,
  Expand: 5
};

interface SimState {
  now: number;
  stars: Record<StarId, StarTruth>;
  queue: EventQueue;
  signals: SignalEnvelope[];
  missions: MissionTrace[];
  completedMissions: CompletedMissionTrace[];
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

interface CompletedMissionTrace {
  mission: MissionTrace;
  reportArrivesAt: number;
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

  advanceToNextPlayerVisibleEvent(
    observerId: ObserverId,
    maxTime = Number.POSITIVE_INFINITY
  ): { found: boolean; event?: ScheduledEvent } {
    if (maxTime < this.state.now) {
      throw new Error("Simulation time cannot move backward");
    }

    while (true) {
      const next = this.state.queue.peekNext();
      if (!next) {
        if (Number.isFinite(maxTime)) {
          this.state.now = maxTime;
        }
        return { found: false };
      }
      if (next.time > maxTime) {
        this.state.now = maxTime;
        return { found: false };
      }

      const before = this.playerVisibleFingerprint(observerId);
      const event = this.runNextEvent();
      if (!event) {
        return { found: false };
      }
      if (this.playerVisibleFingerprint(observerId) !== before) {
        return { found: true, event };
      }
    }
  }

  getView(observerId: ObserverId): SimView {
    const knowledge = this.state.knowledge[observerId];
    return {
      now: this.state.now,
      homeStarId: knowledge.homeStarId,
      stars: Object.values(knowledge.stars).map((star) => ({ ...star })),
      signals: this.state.signals.map((signal) => structuredClone(signal)),
      missions: this.buildMissionTelemetry(knowledge),
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

  private playerVisibleFingerprint(observerId: ObserverId): string {
    const view = this.getView(observerId);
    return JSON.stringify({
      stars: view.stars,
      pendingPolicyCommands: view.pendingPolicyCommands,
      eventLog: view.eventLog
    });
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
    if (payload.report.logText) {
      this.addLog(payload.report.logText, payload.report.logTone ?? "mission");
    }
    this.addLog(`${subject.name} report received; observed ${formatYears(this.state.now - payload.report.observedAt)} ago.`, "info");
  }

  private handlePolicyEvaluates(starId: StarId): void {
    const star = this.requireStar(starId);
    if (star.owner === "rival" && star.inertFortifyInterval && star.inertFortifyCap !== undefined) {
      if (star.fortification < star.inertFortifyCap) {
        star.fortification += 1;
      }
      this.schedulePolicyEvaluation(star.id, this.state.now + star.inertFortifyInterval, "ready");
      return;
    }

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
    const missionKind: MissionKind = policy === "Scout" ? "scout" : policy === "Attack" ? "missile" : "colonize";
    const targetId =
      missionKind === "scout"
        ? this.chooseScoutTarget(star)
        : missionKind === "missile"
          ? this.chooseMissileTarget(star)
          : this.chooseColonizeTarget(star);
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
      const target = this.requireStar(mission.toStarId);
      if (!target.owner) {
        target.orbitingScouts = addUniqueOwner(target.orbitingScouts, mission.owner);
      }
      const outcome = target.owner && target.owner !== mission.owner ? "is destroyed after relaying a snapshot" : "enters orbit and relays a report";
      const reportArrivesAt = this.sendReportToHome(mission.toStarId, "scout mission", `${target.name} scout ${outcome}.`);
      this.rememberCompletedMission(mission, reportArrivesAt);
      return;
    }

    if (mission.kind === "missile") {
      const target = this.requireStar(mission.toStarId);
      target.orbitingScouts = (target.orbitingScouts ?? []).filter((owner) => owner === mission.owner);
      if (target.owner && target.owner !== mission.owner && target.fortification > 0) {
        target.fortification -= 1;
        if (target.fortification <= 0) {
          target.owner = undefined;
          target.policy = undefined;
          target.currentAction = undefined;
          target.fortification = 0;
        }
      }
      if (mission.owner === "player") {
        const reportArrivesAt = this.sendReportToHome(target.id, "missile strike", `${target.name} missile impact resolved.`, "warning");
        this.rememberCompletedMission(mission, reportArrivesAt);
      }
      return;
    }

    const target = this.requireStar(mission.toStarId);
    let logText: string;
    let logTone: LogEntry["tone"] = "mission";
    if (!target.owner) {
      target.owner = mission.owner;
      target.policy = "Scout";
      target.fortification = 0;
      target.orbitingScouts = (target.orbitingScouts ?? []).filter((owner) => owner !== mission.owner);
      this.schedulePolicyEvaluation(target.id, this.state.now + 1, "newColony");
      logText = `${target.name} colony founded.`;
    } else {
      logText = `${target.name} expansion blocked by an existing starbase.`;
      logTone = "warning";
    }
    const reportArrivesAt = this.sendReportToHome(target.id, "colony mission", logText, logTone);
    this.rememberCompletedMission(mission, reportArrivesAt);
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
      arrivesAt: launchedAt + this.travelDelay(fromStarId, toStarId, kind)
    };
    this.state.missions.push(mission);
    this.state.queue.enqueue({
      id: this.nextId("event"),
      kind: "missionArrives",
      time: mission.arrivesAt,
      missionId: mission.id
    });
    this.addVisibleLocalLog(this.requireStar(fromStarId), `${this.requireStar(fromStarId).name} launches ${missionLabel(kind)} to ${this.requireStar(toStarId).name}.`, "mission");
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

  private sendReportToHome(starId: StarId, source: string, logText?: string, logTone?: LogEntry["tone"]): number {
    const report = this.buildReport(starId, source);
    report.logText = logText;
    report.logTone = logTone;
    if (starId === HOME_STAR_ID) {
      this.deliverReport(PLAYER, report, this.state.now);
      if (logText) {
        this.addLog(logText, logTone ?? "mission");
      }
      return this.state.now;
    }
    const signal = this.scheduleSignal(starId, HOME_STAR_ID, {
      kind: "report",
      report
    });
    return signal.arrivesAt;
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
    star.knownScoutOwners = snapshot.scoutOwners ? [...snapshot.scoutOwners] : undefined;
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
      fortification: star.fortification,
      scoutOwners: star.orbitingScouts ? [...star.orbitingScouts] : undefined
    };
    return {
      subjectId: star.id,
      source,
      observedAt: this.state.now,
      snapshot
    };
  }

  private rememberCompletedMission(mission: MissionTrace, reportArrivesAt: number): void {
    if (mission.owner !== "player" || reportArrivesAt <= this.state.now) {
      return;
    }
    this.state.completedMissions.push({
      mission: { ...mission },
      reportArrivesAt
    });
  }

  private buildMissionTelemetry(knowledge: KnowledgeCache): MissionTelemetry[] {
    const active = this.state.missions
      .filter((mission) => isMissionVisibleTo(knowledge, mission))
      .map((mission) => this.telemetryForMission(mission, mission.arrivesAt));
    const completed = this.state.completedMissions
      .filter(({ reportArrivesAt }) => this.state.now < reportArrivesAt)
      .filter(({ mission }) => isMissionVisibleTo(knowledge, mission))
      .map(({ mission }) => this.telemetryForMission(mission, mission.arrivesAt));
    return [...active, ...completed].filter((mission): mission is MissionTelemetry => Boolean(mission));
  }

  private telemetryForMission(mission: MissionTrace, maxObservedAt: number): MissionTelemetry | undefined {
    const observedAt = this.latestReceivedMissionEmissionAt(mission, Math.min(maxObservedAt, mission.arrivesAt));
    if (observedAt === undefined) {
      return undefined;
    }
    return {
      ...mission,
      observedAt,
      receivedAt: this.state.now,
      ...this.missionPositionAt(mission, observedAt)
    };
  }

  private latestReceivedMissionEmissionAt(mission: MissionTrace, maxObservedAt: number): number | undefined {
    if (this.state.now < mission.launchedAt) {
      return undefined;
    }

    const upper = Math.max(mission.launchedAt, Math.min(this.state.now, maxObservedAt));
    if (!this.hasReceivedMissionEmission(mission, mission.launchedAt)) {
      return undefined;
    }
    if (this.hasReceivedMissionEmission(mission, upper)) {
      return upper;
    }

    let low = mission.launchedAt;
    let high = upper;
    for (let index = 0; index < 32; index += 1) {
      const middle = (low + high) / 2;
      if (this.hasReceivedMissionEmission(mission, middle)) {
        low = middle;
      } else {
        high = middle;
      }
    }
    return low;
  }

  private hasReceivedMissionEmission(mission: MissionTrace, sentAt: number): boolean {
    return sentAt + this.missionSignalDelayToNearestPlayerBase(mission, sentAt) <= this.state.now + 0.000001;
  }

  private missionSignalDelayToNearestPlayerBase(mission: MissionTrace, sentAt: number): number {
    const position = this.missionPositionAt(mission, sentAt);
    const receivers = Object.values(this.state.stars).filter((star) => star.owner === "player");
    const fallback = this.requireStar(HOME_STAR_ID);
    const nearest = nearestStarId(position, receivers.length > 0 ? receivers : [fallback]);
    return distance(position, this.requireStar(nearest ?? HOME_STAR_ID)) / SIGNAL_SPEED;
  }

  private missionPositionAt(mission: MissionTrace, time: number): { x: number; y: number } {
    const from = this.requireStar(mission.fromStarId);
    const to = this.requireStar(mission.toStarId);
    const ratio = progress(time, mission.launchedAt, mission.arrivesAt);
    return {
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio
    };
  }

  private chooseScoutTarget(star: StarTruth): StarId | undefined {
    const cache = this.state.knowledge[PLAYER];
    const candidates = Object.values(cache.stars).filter((known) => {
      return known.id !== star.id && known.state === "catalog-only" && !this.hasMissionTo(known.id, "scout", star.owner);
    });
    return nearestStarId(star, candidates);
  }

  private chooseMissileTarget(star: StarTruth): StarId | undefined {
    const cache = this.state.knowledge[PLAYER];
    const candidates = Object.values(cache.stars).filter((known) => {
      return (
        known.id !== star.id &&
        known.knownOwner !== undefined &&
        known.knownOwner !== star.owner &&
        (known.knownFortification ?? 0) > 0 &&
        !this.hasMissionTo(known.id, "missile", star.owner)
      );
    });
    return nearestStarId(star, candidates);
  }

  private chooseColonizeTarget(star: StarTruth): StarId | undefined {
    const cache = this.state.knowledge[PLAYER];
    const candidates = Object.values(cache.stars).filter((known) => {
      return known.id !== star.id && known.state === "scouted" && !known.knownOwner && !this.hasMissionTo(known.id, "colonize", star.owner);
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

  private travelDelay(fromStarId: StarId, toStarId: StarId, kind: MissionKind): number {
    const speed = kind === "colonize" ? EXPANSION_SPEED : kind === "missile" ? MISSILE_SPEED : SCOUT_SPEED;
    return distance(this.requireStar(fromStarId), this.requireStar(toStarId)) / speed;
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
    lyra: { id: "lyra", name: "Lyra", x: 612, y: 228, owner: "rival", fortification: 1, inertFortifyInterval: 9, inertFortifyCap: 3 },
    mira: { id: "mira", name: "Mira", x: 688, y: 418, owner: "rival", fortification: 2, inertFortifyInterval: 10, inertFortifyCap: 3 },
    umbra: { id: "umbra", name: "Umbra", x: 778, y: 132, owner: "rival", fortification: 5, inertFortifyInterval: 2.5, inertFortifyCap: 8 }
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
    completedMissions: [],
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
    text: "Home cache loaded: unknown sky plus stale Vega and Aster reports.",
    tone: "info"
  });
  state.queue.enqueue({ id: "event-0a", kind: "policyEvaluates", time: 0, starId: "sol", reason: "initial" });
  state.queue.enqueue({ id: "event-0b", kind: "policyEvaluates", time: 0, starId: "vega", reason: "initial" });
  state.queue.enqueue({ id: "event-0c", kind: "policyEvaluates", time: 2.5, starId: "umbra", reason: "initial" });
  state.queue.enqueue({ id: "event-0d", kind: "policyEvaluates", time: 9, starId: "lyra", reason: "initial" });
  state.queue.enqueue({ id: "event-0e", kind: "policyEvaluates", time: 10, starId: "mira", reason: "initial" });
  sim.advanceTo(0);
  return sim;
}

export function isMissionVisibleTo(knowledge: KnowledgeCache, mission: MissionTrace): boolean {
  if (mission.owner === knowledge.observerId) {
    return true;
  }
  const from = knowledge.stars[mission.fromStarId];
  const to = knowledge.stars[mission.toStarId];
  return Boolean(from && to && from.state !== "catalog-only" && to.state !== "catalog-only");
}

function nearestStarId(origin: { x: number; y: number }, candidates: Array<{ id: StarId; x: number; y: number }>): StarId | undefined {
  let nearest: { id: StarId; score: number } | undefined;
  for (const candidate of candidates) {
    const score = distance(origin, candidate);
    if (!nearest || score < nearest.score) {
      nearest = { id: candidate.id, score };
    }
  }
  return nearest?.id;
}

function addUniqueOwner(owners: Owner[] | undefined, owner: Owner): Owner[] {
  const next = owners ? [...owners] : [];
  if (!next.includes(owner)) {
    next.push(owner);
  }
  return next;
}

function missionLabel(kind: MissionKind): string {
  if (kind === "missile") {
    return "missile";
  }
  return `${kind} mission`;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function progress(now: number, start: number, end: number): number {
  if (end <= start) {
    return 1;
  }
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

function formatYears(years: number): string {
  return `${years.toFixed(1)}y`;
}

function formatTime(time: number): string {
  return time.toFixed(1);
}
