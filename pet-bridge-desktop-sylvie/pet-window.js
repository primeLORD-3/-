"use strict";

const {
  CODEX_HATCH_PROTOCOL,
  DEFAULT_LINES,
  DEFAULT_PET,
  DEFAULT_PROMPTS,
  clone,
  getActionOrder,
  localCommand,
  normalizeStates,
  parseAssistantPayload,
} = window.PetBridgeCore;

const els = {
  sprite: document.querySelector("#petSprite"),
  hitbox: document.querySelector("#petHitbox"),
  speech: document.querySelector("#speechBubble"),
  radial: document.querySelector("#radialMenu"),
  chat: document.querySelector("#petChat"),
  chatName: document.querySelector("#petChatName"),
  chatClose: document.querySelector("#petChatClose"),
  chatLog: document.querySelector("#petChatLog"),
  chatForm: document.querySelector("#petChatForm"),
  chatInput: document.querySelector("#petChatInput"),
};

let pet = clone(DEFAULT_PET);
let protocol = pet.protocol || CODEX_HATCH_PROTOCOL;
let states = normalizeStates(protocol.states);
let currentState = "idle";
let frameIndex = 0;
let elapsed = 0;
let lastTime = performance.now();
let currentScale = 1.2;
let speechTimer = 0;
let returnTimer = 0;
let dragging = null;
let conversation = [];

function savedSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("pet-bridge-desktop-settings") || "{}");
    return {
      llmEnabled: Boolean(saved.llmEnabled),
      llmBaseUrl: String(saved.llmBaseUrl || ""),
      llmModel: String(saved.llmModel || ""),
      llmApiKey: String(saved.llmApiKey || ""),
      personaPrompt: String(saved.personaPrompt || DEFAULT_PROMPTS.persona),
      assistantPrompt: String(saved.assistantPrompt || DEFAULT_PROMPTS.assistant),
    };
  } catch {
    return {
      llmEnabled: false,
      llmBaseUrl: "",
      llmModel: "",
      llmApiKey: "",
      personaPrompt: DEFAULT_PROMPTS.persona,
      assistantPrompt: DEFAULT_PROMPTS.assistant,
    };
  }
}

function availableStateLine() {
  return Object.entries(states)
    .map(([name, state]) => `${name}=${state.label}`)
    .join(", ");
}

function buildMessages(userText, settings) {
  const controllerPrompt = [
    "你必须只返回 JSON，不要 Markdown。",
    '格式固定为：{"reply":"一句中文回复","state":"动作名"}',
    `可用动作：${availableStateLine()}`,
    `当前动作：${currentState}`,
    `桌宠描述：${pet.description || ""}`,
  ].join("\n");
  const messages = [
    { role: "system", content: `${settings.personaPrompt.trim()}\n\n${controllerPrompt}` },
  ];
  if (settings.assistantPrompt.trim()) {
    messages.push({ role: "assistant", content: settings.assistantPrompt.trim() });
  }
  messages.push(...conversation.slice(-16));
  messages.push({ role: "user", content: userText });
  return messages;
}

function appendChatMessage(role, content) {
  const item = document.createElement("div");
  item.className = `pet-chat-message ${role}`;
  item.textContent = content;
  els.chatLog.append(item);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function openChat() {
  closeRadial();
  window.petBridge.setMouseIgnore(false);
  els.chat.classList.add("is-open");
  window.setTimeout(() => els.chatInput.focus(), 30);
}

function closeChat() {
  els.chat.classList.remove("is-open");
}

async function askPet(userText) {
  const settings = savedSettings();
  if (!settings.llmEnabled) {
    return localCommand(userText, states);
  }
  try {
    const response = await window.petBridge.chat({
      baseUrl: settings.llmBaseUrl.trim(),
      apiKey: settings.llmApiKey.trim(),
      model: settings.llmModel.trim(),
      messages: buildMessages(userText, settings),
    });
    const parsed = parseAssistantPayload(response.text, states);
    return parsed.state ? parsed : { ...parsed, state: localCommand(userText, states).state };
  } catch (error) {
    return {
      state: states.failed ? "failed" : "idle",
      reply: `我这边没连上模型，先陪你待一会儿。`,
    };
  }
}

async function submitChat(text) {
  const userText = String(text || "").trim();
  if (!userText) {
    return;
  }
  appendChatMessage("user", userText);
  conversation.push({ role: "user", content: userText });
  setState(states.review ? "review" : "idle", { speech: "我想一想..." });
  const answer = await askPet(userText);
  const reply = answer.reply || "嗯。";
  const state = states[answer.state] ? answer.state : localCommand(userText, states).state;
  appendChatMessage("assistant", reply);
  conversation.push({ role: "assistant", content: reply });
  conversation = conversation.slice(-32);
  setState(state, { speech: reply });
  window.petBridge.setState({ state, speech: reply });
}

function framePercent(index) {
  const columns = protocol.atlas.columns;
  return columns <= 1 ? "0%" : `${(index / (columns - 1)) * 100}%`;
}

function rowPercent(index) {
  const rows = protocol.atlas.rows;
  return rows <= 1 ? "0%" : `${(index / (rows - 1)) * 100}%`;
}

function activeState() {
  return states[currentState] || states.idle || Object.values(states)[0];
}

function paintFrame() {
  const state = activeState();
  els.sprite.style.setProperty("--frame", framePercent((state.colStart || 0) + frameIndex));
  els.sprite.style.setProperty("--row", rowPercent(state.row));
}

function applyPet(nextPet) {
  pet = nextPet || clone(DEFAULT_PET);
  protocol = pet.protocol || CODEX_HATCH_PROTOCOL;
  states = normalizeStates(protocol.states);
  els.chatName.textContent = pet.displayName || pet.id || "桌宠";
  document.documentElement.style.setProperty("--pet-image", `url("${pet.imageUrl || pet.spritesheetPath}")`);
  document.documentElement.style.setProperty(
    "--pet-bg-size",
    `${protocol.atlas.columns * 100}% ${protocol.atlas.rows * 100}%`,
  );
  document.documentElement.style.setProperty(
    "--pet-aspect",
    `${protocol.atlas.cellWidth} / ${protocol.atlas.cellHeight}`,
  );
  setState(states[currentState] ? currentState : "idle", { speech: DEFAULT_LINES.idle, voice: false });
  buildRadial();
}

function showSpeech(text) {
  window.clearTimeout(speechTimer);
  els.speech.textContent = text || "";
  els.speech.classList.toggle("is-visible", Boolean(text));
  if (text) {
    speechTimer = window.setTimeout(() => {
      els.speech.classList.remove("is-visible");
    }, 4200);
  }
}

function setState(name, options = {}) {
  if (!states[name]) {
    name = states.idle ? "idle" : Object.keys(states)[0];
  }
  if (!name) {
    return;
  }
  window.clearTimeout(returnTimer);
  currentState = name;
  frameIndex = 0;
  elapsed = 0;
  paintFrame();
  showSpeech(options.speech || DEFAULT_LINES[name] || states[name].label);
  if ((states[name].transient || options.returnToIdle) && !options.sticky) {
    const duration = states[name].durations.reduce((sum, value) => sum + value, 0);
    returnTimer = window.setTimeout(() => {
      setState("idle", { speech: DEFAULT_LINES.idle });
      window.petBridge.setState({ state: "idle", speech: DEFAULT_LINES.idle });
    }, duration + 320);
  }
}

function setScale(scale) {
  currentScale = Math.max(0.55, Math.min(2.6, Number(scale) || currentScale));
  document.documentElement.style.setProperty("--pet-scale", currentScale);
}

function emitState(state, speech) {
  setState(state, { speech });
  window.petBridge.setState({ state, speech });
}

function buildRadial() {
  const items = [
    { label: "控制台", action: () => window.petBridge.openConsole() },
    { label: "待机", state: "idle" },
    { label: "招呼", state: "waving" },
    { label: "工作", state: "running" },
    { label: "审阅", state: "review" },
    { label: "跳跃", state: "jumping" },
    { label: "受挫", state: "failed" },
    { label: "放大", action: () => window.petBridge.resizePet(currentScale + 0.12) },
    { label: "缩小", action: () => window.petBridge.resizePet(currentScale - 0.12) },
  ].filter((item) => !item.state || states[item.state]);

  els.radial.innerHTML = '<div class="radial-center">右键轮盘</div>';
  const radius = 95;
  items.forEach((item, index) => {
    const angle = -90 + (360 / items.length) * index;
    const radians = (angle * Math.PI) / 180;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "radial-item";
    button.textContent = item.label;
    button.style.transform = `translate(${Math.cos(radians) * radius}px, ${Math.sin(radians) * radius}px)`;
    button.addEventListener("click", () => {
      closeRadial();
      if (item.state) {
        emitState(item.state, DEFAULT_LINES[item.state]);
      } else {
        item.action();
      }
    });
    els.radial.append(button);
  });
}

function openRadial() {
  window.petBridge.setMouseIgnore(false);
  els.radial.classList.add("is-open");
}

function closeRadial() {
  els.radial.classList.remove("is-open");
}

function animate(now) {
  const state = activeState();
  const dt = now - lastTime;
  lastTime = now;
  elapsed += dt;
  let duration = state.durations[frameIndex] || 140;
  while (elapsed >= duration) {
    elapsed -= duration;
    frameIndex = (frameIndex + 1) % state.durations.length;
    duration = state.durations[frameIndex] || 140;
    paintFrame();
  }
  requestAnimationFrame(animate);
}

function beginDrag(event) {
  if (event.button !== 0) {
    return;
  }
  if (!Number.isFinite(event.screenX) || !Number.isFinite(event.screenY)) {
    return;
  }
  dragging = {
    x: event.screenX,
    y: event.screenY,
    pointerId: event.pointerId,
    moved: false,
  };
  window.petBridge.setMouseIgnore(false);
  try {
    els.hitbox.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture can fail if the OS has already cancelled a fast drag.
  }
}

function moveDrag(event) {
  if (!dragging) {
    return;
  }
  if (!Number.isFinite(event.screenX) || !Number.isFinite(event.screenY)) {
    return;
  }
  const dx = event.screenX - dragging.x;
  const dy = event.screenY - dragging.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
    return;
  }
  if (Math.abs(dx) + Math.abs(dy) > 4) {
    dragging.moved = true;
    window.petBridge.movePetBy({ dx, dy });
    dragging.x = event.screenX;
    dragging.y = event.screenY;
    const runState = dx >= 0 ? "running-right" : "running-left";
    if (states[runState] && currentState !== runState) {
      setState(runState, { speech: dx >= 0 ? "往右。" : "往左。", sticky: true });
      window.petBridge.setState({ state: runState, speech: dx >= 0 ? "往右。" : "往左。" });
    }
  }
}

function endDrag(event = {}) {
  if (!dragging) {
    return;
  }
  const activeDrag = dragging;
  dragging = null;
  try {
    els.hitbox.releasePointerCapture(activeDrag.pointerId ?? event.pointerId);
  } catch {
    // The pointer may already be released after rapid drags or window focus changes.
  }
  window.petBridge.setMouseIgnore(false);
  if (activeDrag.moved && states.waiting) {
    emitState("waiting", "我站好了。");
  } else if (!activeDrag.moved && states.waving) {
    emitState("waving", "嗯？我在。");
  }
}

function wireEvents() {
  document.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openRadial();
  });
  document.addEventListener("pointerdown", (event) => {
    if (!els.radial.contains(event.target) && event.target !== els.hitbox && !els.hitbox.contains(event.target)) {
      closeRadial();
    }
  });
  document.addEventListener("mousemove", (event) => {
    const interactive =
      event.target === els.hitbox ||
      els.hitbox.contains(event.target) ||
      els.radial.contains(event.target) ||
      els.chat.contains(event.target);
    window.petBridge.setMouseIgnore(
      !dragging &&
        !interactive &&
        !els.radial.classList.contains("is-open") &&
        !els.chat.classList.contains("is-open"),
    );
  });
  els.hitbox.addEventListener("pointerdown", beginDrag);
  els.hitbox.addEventListener("pointermove", moveDrag);
  els.hitbox.addEventListener("pointerup", endDrag);
  els.hitbox.addEventListener("pointercancel", endDrag);
  document.addEventListener("pointerup", endDrag);
  document.addEventListener("pointercancel", endDrag);
  window.addEventListener("blur", () => endDrag());
  els.hitbox.addEventListener(
    "dblclick",
    (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      openChat();
    },
    true,
  );
  els.hitbox.addEventListener("dblclick", () => {
    if (states.jumping) {
      emitState("jumping", "收到。");
    }
  });

  els.chatClose.addEventListener("click", closeChat);
  els.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.chatInput.value;
    els.chatInput.value = "";
    submitChat(text);
  });

  window.petBridge.onPetChanged((nextPet) => applyPet(nextPet));
  window.petBridge.onPetState((payload) => setState(payload.state || payload, payload));
  window.petBridge.onPetSpeech((payload) => showSpeech(payload.text || payload));
  window.petBridge.onPetScale((scale) => setScale(scale));
}

async function init() {
  const initial = await window.petBridge.getInitialState();
  setScale(initial.scale || currentScale);
  applyPet(initial.pet || clone(DEFAULT_PET));
  setState(initial.currentState || "idle", { speech: initial.speech || DEFAULT_LINES.idle });
  wireEvents();
  requestAnimationFrame(animate);
}

init();
