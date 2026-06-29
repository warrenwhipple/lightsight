import { createFrontierScenario } from "../sim/scenario.js";
import type { Policy, SimView, StarId, StarKnowledge } from "../sim/types.js";

const WORLD = { width: 900, height: 560 };

let sim = createFrontierScenario();
let selectedStarId: StarId = "sol";
let playing = false;
let lastFrame = performance.now();

const canvas = requireElement<HTMLCanvasElement>("map");
const canvasContext = canvas.getContext("2d");
if (!canvasContext) {
  throw new Error("Canvas 2D context unavailable");
}
const context: CanvasRenderingContext2D = canvasContext;

const playPause = requireElement<HTMLButtonElement>("playPause");
const nextEvent = requireElement<HTMLButtonElement>("nextEvent");
const stepYear = requireElement<HTMLButtonElement>("stepYear");
const reset = requireElement<HTMLButtonElement>("reset");
const selectedName = requireElement("selectedName");
const selectedState = requireElement("selectedState");
const selectedFacts = requireElement("selectedFacts");
const pendingPolicy = requireElement("pendingPolicy");
const knowledgeList = requireElement("knowledgeList");
const knowledgeClock = requireElement("knowledgeClock");
const eventLog = requireElement("eventLog");
const starHitLayer = requireElement("starHitLayer");
const policyButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-policy]")];

playPause.addEventListener("click", () => {
  playing = !playing;
  playPause.textContent = playing ? "Pause" : "Play";
  lastFrame = performance.now();
});

nextEvent.addEventListener("click", () => {
  sim.runNextEvent();
  render();
});

stepYear.addEventListener("click", () => {
  sim.advanceTo(sim.now + 1);
  render();
});

reset.addEventListener("click", () => {
  sim = createFrontierScenario();
  selectedStarId = "sol";
  playing = false;
  playPause.textContent = "Play";
  render();
});

policyButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const policy = button.dataset.policy as Policy;
    sim.issuePolicyChange("player", selectedStarId, policy);
    render();
  });
});

canvas.addEventListener("click", (event) => {
  const rect = canvas.getBoundingClientRect();
  const point = clientPointToWorld(event.clientX, event.clientY, rect);
  if (!point) {
    return;
  }
  selectAtWorldPoint(point.x, point.y, point.hitRadius);
});

starHitLayer.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>("[data-star-id]") : undefined;
  if (!target || !starHitLayer.contains(target)) {
    return;
  }
  const starId = target?.dataset.starId as StarId | undefined;
  if (!starId) {
    return;
  }
  selectedStarId = starId;
  render();
});

knowledgeList.addEventListener("click", (event) => {
  const target = event.target instanceof HTMLElement ? event.target.closest<HTMLButtonElement>("[data-star-id]") : undefined;
  if (!target || !knowledgeList.contains(target)) {
    return;
  }
  const starId = target.dataset.starId as StarId | undefined;
  if (!starId) {
    return;
  }
  selectedStarId = starId;
  render();
});

window.addEventListener("resize", render);
requestAnimationFrame(tick);
render();

function tick(frameTime: number): void {
  if (playing) {
    const elapsedSeconds = Math.min(0.08, (frameTime - lastFrame) / 1000);
    sim.advanceTo(sim.now + elapsedSeconds * 2.4);
    render();
  }
  lastFrame = frameTime;
  requestAnimationFrame(tick);
}

function render(): void {
  const view = sim.getView("player");
  drawMap(view);
  renderSelected(view);
  renderKnowledge(view);
  renderLog(view);
}

function drawMap(view: SimView): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(320, rect.width);
  const height = Math.max(220, rect.height);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);

  const { scale, offsetX, offsetY } = mapTransform(width, height);
  const toScreen = (star: { x: number; y: number }) => ({
    x: offsetX + star.x * scale,
    y: offsetY + star.y * scale
  });
  const starsById = new Map(view.stars.map((star) => [star.id, star]));

  drawGrid(width, height);
  for (const mission of view.missions) {
    const from = starsById.get(mission.fromStarId);
    const to = starsById.get(mission.toStarId);
    if (from && to) {
      drawTrace(toScreen(from), toScreen(to), progress(view.now, mission.launchedAt, mission.arrivesAt), mission.kind);
    }
  }
  for (const signal of view.signals) {
    const from = starsById.get(signal.fromStarId);
    const to = starsById.get(signal.toStarId);
    if (from && to && signal.payload.kind === "setPolicy") {
      drawTrace(toScreen(from), toScreen(to), progress(view.now, signal.sentAt, signal.arrivesAt), "policy");
    }
  }
  for (const star of view.stars) {
    drawStar(star, toScreen(star), star.id === selectedStarId);
  }
  renderStarHitTargets(view, width, height);
}

function drawGrid(width: number, height: number): void {
  const gradient = context.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#151512");
  gradient.addColorStop(1, "#201d17");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(238, 231, 207, 0.06)";
  context.lineWidth = 1;
  for (let x = 32; x < width; x += 64) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 32; y < height; y += 64) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawTrace(
  from: { x: number; y: number },
  to: { x: number; y: number },
  ratio: number,
  kind: "policy" | "scout" | "colonize"
): void {
  const palette = {
    policy: "#60d6df",
    scout: "#e0b84d",
    colonize: "#6fd08c"
  };
  context.save();
  context.strokeStyle = palette[kind];
  context.globalAlpha = kind === "policy" ? 0.74 : 0.64;
  context.lineWidth = kind === "policy" ? 2 : 3;
  context.setLineDash(kind === "policy" ? [8, 8] : kind === "scout" ? [3, 9] : []);
  context.beginPath();
  context.moveTo(from.x, from.y);
  context.lineTo(to.x, to.y);
  context.stroke();
  context.setLineDash([]);
  const x = from.x + (to.x - from.x) * ratio;
  const y = from.y + (to.y - from.y) * ratio;
  context.fillStyle = palette[kind];
  context.beginPath();
  if (kind === "colonize") {
    context.rect(x - 4, y - 4, 8, 8);
  } else {
    context.arc(x, y, kind === "policy" ? 4 : 5, 0, Math.PI * 2);
  }
  context.fill();
  context.restore();
}

function drawStar(star: StarKnowledge, point: { x: number; y: number }, selected: boolean): void {
  const stateColor = {
    "catalog-only": "#8d887b",
    scouted: "#e1b756",
    owned: "#6fd08c"
  }[star.state];
  context.save();
  context.shadowColor = selected ? "#f28c55" : stateColor;
  context.shadowBlur = selected ? 18 : star.state === "owned" ? 10 : 0;
  context.strokeStyle = stateColor;
  context.fillStyle = star.state === "catalog-only" ? "#171714" : stateColor;
  context.lineWidth = selected ? 4 : 2;
  context.beginPath();
  context.arc(point.x, point.y, star.state === "owned" ? 9 : 7, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  if (star.state === "scouted") {
    context.beginPath();
    context.arc(point.x, point.y, 13, 0, Math.PI * 2);
    context.stroke();
  }
  if (selected) {
    context.strokeStyle = "#f28c55";
    context.beginPath();
    context.arc(point.x, point.y, 18, 0, Math.PI * 2);
    context.stroke();
  }
  context.shadowBlur = 0;
  context.fillStyle = "#eee7cf";
  context.font = "13px Inter, ui-sans-serif, system-ui, sans-serif";
  context.fillText(star.name, point.x + 14, point.y - 10);
  context.fillStyle = "#aaa494";
  context.font = "11px Inter, ui-sans-serif, system-ui, sans-serif";
  context.fillText(labelForState(star), point.x + 14, point.y + 6);
  context.restore();
}

function renderSelected(view: SimView): void {
  const selected = view.stars.find((star) => star.id === selectedStarId) ?? view.stars[0];
  if (!selected) {
    return;
  }
  selectedName.textContent = selected.name;
  selectedState.textContent = labelForState(selected);
  const pending = view.pendingPolicyCommands.find((command) => command.starId === selected.id);
  selectedFacts.innerHTML = "";
  const facts = [
    ["Policy", selected.knownPolicy ?? "unknown"],
    ["Freshness", freshnessLabel(selected, view.now)],
    ["Source", selected.source ?? "catalog"],
    ["Fort", selected.knownFortification === undefined ? "unknown" : String(selected.knownFortification)],
    ["Action", actionForSelected(view, selected.id)]
  ];
  for (const [label, value] of facts) {
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    selectedFacts.append(term, detail);
  }

  for (const button of policyButtons) {
    const policy = button.dataset.policy as Policy;
    const enabled = selected.state === "owned";
    button.disabled = !enabled;
    button.classList.toggle("active", selected.knownPolicy === policy);
    button.classList.toggle("pending", pending?.policy === policy);
  }

  if (!pending) {
    pendingPolicy.textContent = selected.state === "owned" ? "No pending remote policy change." : "Policy controls require an owned system.";
  } else if (pending.status === "outbound") {
    pendingPolicy.textContent = `Pending ${pending.policy}: arrives at ${selected.name} in ${formatYears(pending.commandArrivesAt - view.now)}.`;
  } else {
    pendingPolicy.textContent = `${pending.policy} is effective remotely; acknowledgement returns in ${formatYears((pending.ackArrivesAt ?? view.now) - view.now)}.`;
  }
}

function renderKnowledge(view: SimView): void {
  knowledgeClock.textContent = `t=${view.now.toFixed(1)}y`;
  const existingRows = new Map(
    [...knowledgeList.querySelectorAll<HTMLButtonElement>(".knowledgeRow[data-star-id]")].map((row) => [row.dataset.starId, row])
  );

  for (const star of [...view.stars].sort((a, b) => a.name.localeCompare(b.name))) {
    let row = existingRows.get(star.id);
    if (!row) {
      row = document.createElement("button");
      row.type = "button";
      row.className = "knowledgeRow";
      row.dataset.starId = star.id;
      row.innerHTML = `
        <span class="rowName"></span>
        <span class="rowState"></span>
        <span class="rowFresh"></span>
      `;
    }

    row.className = `knowledgeRow ${star.state === "catalog-only" ? "catalog" : star.state}`;
    row.classList.toggle("selected", star.id === selectedStarId);
    row.setAttribute("aria-label", `Select ${star.name}`);
    row.querySelector(".rowName")!.textContent = star.name;
    row.querySelector(".rowState")!.textContent = labelForState(star);
    row.querySelector(".rowFresh")!.textContent = freshnessLabel(star, view.now);
    knowledgeList.append(row);
    existingRows.delete(star.id);
  }

  for (const stale of existingRows.values()) {
    stale.remove();
  }
}

function renderLog(view: SimView): void {
  eventLog.innerHTML = "";
  for (const entry of [...view.eventLog].reverse().slice(0, 14)) {
    const item = document.createElement("li");
    item.className = entry.tone;
    item.innerHTML = `<time>t=${entry.time.toFixed(1)}</time><span>${entry.text}</span>`;
    eventLog.append(item);
  }
}

function actionForSelected(view: SimView, starId: StarId): string {
  const mission = view.missions.find((candidate) => candidate.fromStarId === starId);
  if (mission) {
    return `${mission.kind} to ${starName(view, mission.toStarId)} arrives in ${formatYears(mission.arrivesAt - view.now)}`;
  }
  const event = view.queuePreview.find((candidate) => candidate.kind === "policyEvaluates" && candidate.starId === starId);
  return event ? `next policy check in ${formatYears(event.time - view.now)}` : "idle";
}

function clientPointToWorld(clientX: number, clientY: number, rect: DOMRect): { x: number; y: number; hitRadius: number } | undefined {
  const { scale, offsetX, offsetY } = mapTransform(rect.width, rect.height);
  const x = (clientX - rect.left - offsetX) / scale;
  const y = (clientY - rect.top - offsetY) / scale;
  if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) {
    return undefined;
  }
  return {
    x,
    y,
    hitRadius: Math.max(18, 26 / scale)
  };
}

function mapTransform(width: number, height: number): { scale: number; offsetX: number; offsetY: number } {
  const scale = Math.min(width / WORLD.width, height / WORLD.height);
  return {
    scale,
    offsetX: (width - WORLD.width * scale) / 2,
    offsetY: (height - WORLD.height * scale) / 2
  };
}

function selectAtWorldPoint(x: number, y: number, hitRadius: number): StarKnowledge | undefined {
  const nearest = nearestStar(x, y, sim.getView("player").stars, hitRadius);
  if (nearest) {
    selectedStarId = nearest.id;
    render();
  }
  return nearest;
}

function nearestStar(x: number, y: number, stars: StarKnowledge[], hitRadius: number): StarKnowledge | undefined {
  let nearest: { star: StarKnowledge; distance: number } | undefined;
  for (const star of stars) {
    const distance = Math.hypot(star.x - x, star.y - y);
    if (distance <= hitRadius && (!nearest || distance < nearest.distance)) {
      nearest = { star, distance };
    }
  }
  return nearest?.star;
}

function renderStarHitTargets(view: SimView, width: number, height: number): void {
  const { scale, offsetX, offsetY } = mapTransform(width, height);
  const existingButtons = new Map(
    [...starHitLayer.querySelectorAll<HTMLButtonElement>("[data-star-id]")].map((button) => [button.dataset.starId, button])
  );

  for (const star of view.stars) {
    const key = star.id;
    let button = existingButtons.get(key);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "starHit";
      button.dataset.starId = star.id;
      starHitLayer.append(button);
    }
    button.setAttribute("aria-label", `Select ${star.name}`);
    button.title = `Select ${star.name}`;
    button.style.left = `${offsetX + star.x * scale}px`;
    button.style.top = `${offsetY + star.y * scale}px`;
    button.classList.toggle("selected", star.id === selectedStarId);
    existingButtons.delete(key);
  }

  for (const stale of existingButtons.values()) {
    stale.remove();
  }
}

function progress(now: number, start: number, end: number): number {
  if (end <= start) {
    return 1;
  }
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}

function labelForState(star: StarKnowledge): string {
  if (star.state === "catalog-only") {
    return "Catalog";
  }
  return star.state === "owned" ? "Owned" : "Scouted";
}

function freshnessLabel(star: StarKnowledge, now: number): string {
  if (star.observedAt === undefined || star.receivedAt === undefined) {
    return "catalog only";
  }
  const age = Math.max(0, now - star.observedAt);
  return age < 0.1 ? "fresh" : `${age.toFixed(1)}y stale`;
}

function starName(view: SimView, starId: StarId): string {
  return view.stars.find((star) => star.id === starId)?.name ?? starId;
}

function formatYears(value: number): string {
  return `${Math.max(0, value).toFixed(1)}y`;
}

function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing #${id}`);
  }
  return element as T;
}
