export type Policy = "Scout" | "Attack" | "Expand";
export type StarId = "sol" | "vega" | "aster" | "lyra" | "mira" | "umbra";
export type ObserverId = "player";
export type Owner = "player" | "rival";
export type MissionKind = "scout" | "missile" | "colonize";
export type SignalPayloadKind = "setPolicy" | "report" | "ack";
export type EventKind = "signalArrives" | "policyEvaluates" | "missionArrives";
export type KnowledgeState = "catalog-only" | "scouted" | "owned";

export interface Vec2 {
  x: number;
  y: number;
}

export interface StarTruth extends Vec2 {
  id: StarId;
  name: string;
  owner?: Owner;
  policy?: Policy;
  fortification: number;
  orbitingScouts?: Owner[];
  inertFortifyInterval?: number;
  inertFortifyCap?: number;
  currentAction?: CurrentAction;
}

export interface CurrentAction {
  kind: "fortify" | "cooldown";
  policyAtStart: Policy;
  startedAt: number;
  completesAt: number;
  label: string;
}

export interface StarSnapshot extends Vec2 {
  id: StarId;
  name: string;
  owner?: Owner;
  policy?: Policy;
  fortification?: number;
  scoutOwners?: Owner[];
}

export interface ReportPayload {
  subjectId: StarId;
  source: string;
  observedAt: number;
  snapshot: StarSnapshot;
  logText?: string;
  logTone?: LogEntry["tone"];
}

export interface SignalEnvelope {
  id: string;
  fromStarId: StarId;
  toStarId: StarId;
  sentAt: number;
  arrivesAt: number;
  payload: SignalPayload;
}

export type SignalPayload =
  | {
      kind: "setPolicy";
      commandId: string;
      starId: StarId;
      policy: Policy;
      issuedAt: number;
    }
  | {
      kind: "report";
      report: ReportPayload;
    }
  | {
      kind: "ack";
      commandId: string;
      starId: StarId;
      policy: Policy;
      effectiveAt: number;
    };

export interface MissionTrace {
  id: string;
  kind: MissionKind;
  owner: Owner;
  fromStarId: StarId;
  toStarId: StarId;
  launchedAt: number;
  arrivesAt: number;
}

export interface MissionTelemetry extends MissionTrace {
  observedAt: number;
  receivedAt: number;
  x: number;
  y: number;
}

export interface PendingPolicyCommand {
  id: string;
  starId: StarId;
  policy: Policy;
  issuedAt: number;
  commandArrivesAt: number;
  ackArrivesAt?: number;
  status: "outbound" | "awaitingAck";
}

export interface StarKnowledge extends Vec2 {
  id: StarId;
  name: string;
  state: KnowledgeState;
  knownOwner?: Owner;
  knownPolicy?: Policy;
  knownFortification?: number;
  knownScoutOwners?: Owner[];
  observedAt?: number;
  receivedAt?: number;
  source?: string;
}

export interface KnowledgeCache {
  observerId: ObserverId;
  homeStarId: StarId;
  stars: Record<StarId, StarKnowledge>;
}

export interface LogEntry {
  id: string;
  time: number;
  text: string;
  tone: "control" | "info" | "mission" | "warning";
}

export type ScheduledEvent =
  | {
      id: string;
      kind: "signalArrives";
      time: number;
      signalId: string;
    }
  | {
      id: string;
      kind: "policyEvaluates";
      time: number;
      starId: StarId;
      reason: "initial" | "ready" | "newColony";
    }
  | {
      id: string;
      kind: "missionArrives";
      time: number;
      missionId: string;
    };

export interface ScheduledEventRecord {
  event: ScheduledEvent;
  seq: number;
}

export interface SimView {
  now: number;
  homeStarId: StarId;
  stars: StarKnowledge[];
  signals: SignalEnvelope[];
  missions: MissionTelemetry[];
  pendingPolicyCommands: PendingPolicyCommand[];
  eventLog: LogEntry[];
  queuePreview: ScheduledEvent[];
}
