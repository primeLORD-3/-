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
  petName: document.querySelector("#petName"),
  importPet: document.querySelector("#importPet"),
  resetPet: document.querySelector("#resetPet"),
  stateRow: document.querySelector("#stateRow"),
  keymapToggle: document.querySelector("#keymapToggle"),
  keymapPanel: document.querySelector("#keymapPanel"),
  keymapList: document.querySelector("#keymapList"),
  scaleSlider: document.querySelector("#scaleSlider"),
  scaleOutput: document.querySelector("#scaleOutput"),
  pinState: document.querySelector("#pinState"),
  speechInput: document.querySelector("#speechInput"),
  sayButton: document.querySelector("#sayButton"),
  chatLog: document.querySelector("#chatLog"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  llmEnabled: document.querySelector("#llmEnabled"),
  personaPrompt: document.querySelector("#personaPrompt"),
  assistantPrompt: document.querySelector("#assistantPrompt"),
  ttsPrompt: document.querySelector("#ttsPrompt"),
  llmBaseUrl: document.querySelector("#llmBaseUrl"),
  llmModel: document.querySelector("#llmModel"),
  llmApiKey: document.querySelector("#llmApiKey"),
  ttsEnabled: document.querySelector("#ttsEnabled"),
  ttsMode: document.querySelector("#ttsMode"),
  ttsBaseUrl: document.querySelector("#ttsBaseUrl"),
  ttsModel: document.querySelector("#ttsModel"),
  ttsVoice: document.querySelector("#ttsVoice"),
  ttsApiKey: document.querySelector("#ttsApiKey"),
  historyList: document.querySelector("#historyList"),
  addHistory: document.querySelector("#addHistory"),
  clearHistory: document.querySelector("#clearHistory"),
};

let pet = clone(DEFAULT_PET);
let protocol = pet.protocol || CODEX_HATCH_PROTOCOL;
let states = normalizeStates(protocol.states);
let currentState = "idle";
let history = [];
let keymap = {};

const DEFAULT_SHORTCUTS = {
  idle: "I",
  waiting: "T",
  running: "P",
  review: "V",
  waving: "W",
  jumping: "J",
  failed: "F",
  "running-left": "L",
  "running-right": "R",
};

function defaultSettings() {
  return {
    llmEnabled: false,
    llmBaseUrl: "",
    llmModel: "",
    llmApiKey: "",
    ttsEnabled: true,
    ttsMode: "browser",
    ttsBaseUrl: "",
    ttsModel: "",
    ttsVoice: "alloy",
    ttsApiKey: "",
    personaPrompt: DEFAULT_PROMPTS.persona,
    assistantPrompt: DEFAULT_PROMPTS.assistant,
    ttsPrompt: DEFAULT_PROMPTS.tts,
    keymap: {},
  };
}

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem("pet-bridge-desktop-settings") || "{}");
  } catch {
    saved = {};
  }
  const settings = { ...defaultSettings(), ...saved };
  els.llmEnabled.checked = Boolean(settings.llmEnabled);
  els.llmBaseUrl.value = settings.llmBaseUrl;
  els.llmModel.value = settings.llmModel;
  els.llmApiKey.value = settings.llmApiKey;
  els.ttsEnabled.checked = settings.ttsEnabled !== false;
  els.ttsMode.value = settings.ttsMode;
  els.ttsBaseUrl.value = settings.ttsBaseUrl;
  els.ttsModel.value = settings.ttsModel;
  els.ttsVoice.value = settings.ttsVoice;
  els.ttsApiKey.value = settings.ttsApiKey;
  els.personaPrompt.value = settings.personaPrompt;
  els.assistantPrompt.value = settings.assistantPrompt;
  els.ttsPrompt.value = settings.ttsPrompt;
  history = Array.isArray(saved.history) ? saved.history : [];
  keymap = settings.keymap && typeof settings.keymap === "object" && !Array.isArray(settings.keymap)
    ? { ...settings.keymap }
    : {};
}

function saveSettings() {
  localStorage.setItem(
    "pet-bridge-desktop-settings",
    JSON.stringify({
      llmEnabled: els.llmEnabled.checked,
      llmBaseUrl: els.llmBaseUrl.value,
      llmModel: els.llmModel.value,
      llmApiKey: els.llmApiKey.value,
      ttsEnabled: els.ttsEnabled.checked,
      ttsMode: els.ttsMode.value,
      ttsBaseUrl: els.ttsBaseUrl.value,
      ttsModel: els.ttsModel.value,
      ttsVoice: els.ttsVoice.value,
      ttsApiKey: els.ttsApiKey.value,
      personaPrompt: els.personaPrompt.value,
      assistantPrompt: els.assistantPrompt.value,
      ttsPrompt: els.ttsPrompt.value,
      history,
      keymap,
    }),
  );
}

function appendMessage(role, content) {
  const item = document.createElement("div");
  item.className = `message ${role}`;
  item.textContent = content;
  els.chatLog.append(item);
  els.chatLog.scrollTop = els.chatLog.scrollHeight;
}

function renderHistory() {
  els.historyList.innerHTML = "";
  history.forEach((message, index) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <select aria-label="角色">
        <option value="user">user</option>
        <option value="assistant">assistant</option>
        <option value="system">system</option>
      </select>
      <textarea spellcheck="false"></textarea>
      <button type="button">删除</button>
    `;
    const role = item.querySelector("select");
    const text = item.querySelector("textarea");
    const remove = item.querySelector("button");
    role.value = message.role || "user";
    text.value = message.content || "";
    role.addEventListener("change", () => {
      history[index].role = role.value;
      saveSettings();
    });
    text.addEventListener("input", () => {
      history[index].content = text.value;
      saveSettings();
    });
    remove.addEventListener("click", () => {
      history.splice(index, 1);
      renderHistory();
      saveSettings();
    });
    els.historyList.append(item);
  });
}

function stateLabel(name, state) {
  return state.label || name;
}

function normalizeShortcut(value) {
  const raw = String(value || "")
    .trim()
    .replaceAll("空格", "space")
    .replaceAll("←", "ArrowLeft")
    .replaceAll("→", "ArrowRight")
    .replaceAll("↑", "ArrowUp")
    .replaceAll("↓", "ArrowDown");
  if (!raw) {
    return "";
  }
  return raw
    .split("+")
    .map((part) =>
      part
        .trim()
        .replace(/^control$/i, "ctrl")
        .replace(/^esc$/i, "escape")
        .toUpperCase(),
    )
    .filter(Boolean)
    .join("+");
}

function displayShortcut(shortcut) {
  const labels = {
    SPACE: "空格",
    ARROWLEFT: "←",
    ARROWRIGHT: "→",
    ARROWUP: "↑",
    ARROWDOWN: "↓",
  };
  return normalizeShortcut(shortcut)
    .split("+")
    .map((part) => labels[part] || part)
    .join("+");
}

function eventShortcut(event) {
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    return "";
  }
  const base = event.key === " " ? "SPACE" : event.key.toUpperCase();
  const parts = [];
  if (event.ctrlKey) {
    parts.push("CTRL");
  }
  if (event.altKey) {
    parts.push("ALT");
  }
  if (event.shiftKey && event.key.length > 1) {
    parts.push("SHIFT");
  }
  if (event.metaKey) {
    parts.push("META");
  }
  parts.push(base);
  return parts.join("+");
}

function isTypingTarget(target) {
  return Boolean(
    target?.closest?.("input, textarea, select, button") ||
      target?.isContentEditable,
  );
}

function defaultShortcut(name, state, used) {
  const icon = normalizeShortcut(state.icon);
  const candidates = [
    DEFAULT_SHORTCUTS[name],
    /^[A-Z0-9]$/.test(icon) ? icon : "",
    /^[a-z0-9]/i.test(name) ? name.slice(0, 1) : "",
  ];
  for (const candidate of candidates.map(normalizeShortcut)) {
    if (candidate && !used.has(candidate)) {
      return candidate;
    }
  }
  return "";
}

function syncKeymap() {
  const ordered = getActionOrder(states);
  const next = {};
  const used = new Set();

  ordered.forEach((name) => {
    const shortcut = normalizeShortcut(keymap[name]);
    if (shortcut && !used.has(shortcut)) {
      next[name] = shortcut;
      used.add(shortcut);
    }
  });

  ordered.forEach((name) => {
    if (next[name] !== undefined) {
      return;
    }
    const shortcut = defaultShortcut(name, states[name], used);
    next[name] = shortcut;
    if (shortcut) {
      used.add(shortcut);
    }
  });

  keymap = next;
}

function setShortcut(name, shortcut) {
  const next = normalizeShortcut(shortcut);
  if (next) {
    Object.keys(keymap).forEach((otherName) => {
      if (otherName !== name && normalizeShortcut(keymap[otherName]) === next) {
        keymap[otherName] = "";
      }
    });
  }
  keymap[name] = next;
}

function renderKeymap() {
  if (!els.keymapList) {
    return;
  }
  els.keymapList.innerHTML = "";
  getActionOrder(states).forEach((name) => {
    const state = states[name];
    const row = document.createElement("label");
    row.className = "keymap-row";

    const label = document.createElement("span");
    label.className = "keymap-name";
    const title = document.createElement("strong");
    title.textContent = stateLabel(name, state);
    const detail = document.createElement("small");
    detail.textContent = name;
    label.append(title, detail);

    const input = document.createElement("input");
    input.type = "text";
    input.value = displayShortcut(keymap[name]);
    input.placeholder = "无";
    input.setAttribute("aria-label", `${stateLabel(name, state)}快捷键`);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Tab") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const shortcut = event.key === "Backspace" || event.key === "Delete" ? "" : eventShortcut(event);
      setShortcut(name, shortcut);
      renderKeymap();
      buildStateButtons();
      saveSettings();
    });
    input.addEventListener("change", () => {
      setShortcut(name, input.value);
      renderKeymap();
      buildStateButtons();
      saveSettings();
    });

    row.append(label, input);
    els.keymapList.append(row);
  });
}

function applyPet(nextPet) {
  pet = nextPet || clone(DEFAULT_PET);
  if (!pet.protocol) {
    pet.protocol = CODEX_HATCH_PROTOCOL;
  }
  protocol = pet.protocol;
  states = normalizeStates(protocol.states);
  syncKeymap();
  els.petName.textContent = pet.displayName || pet.id || "Pet";
  buildStateButtons();
  renderKeymap();
  saveSettings();
}

function buildStateButtons() {
  els.stateRow.innerHTML = "";
  getActionOrder(states).forEach((name) => {
    const state = states[name];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "state-button";
    button.dataset.state = name;
    button.title = `${stateLabel(name, state)} (${name})`;

    const shortcut = document.createElement("span");
    shortcut.textContent = displayShortcut(keymap[name]) || state.icon || "·";
    const label = document.createElement("span");
    label.textContent = stateLabel(name, state);
    const detail = document.createElement("small");
    detail.textContent = name;
    button.append(shortcut, label, detail);

    button.addEventListener("click", () => setPetState(name, DEFAULT_LINES[name] || stateLabel(name, state)));
    els.stateRow.append(button);
  });
  markActiveState();
}

function markActiveState() {
  document.querySelectorAll(".state-button").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.state === currentState);
  });
}

function setPetState(state, speech) {
  currentState = states[state] ? state : "idle";
  markActiveState();
  window.petBridge.setState({
    state: currentState,
    speech,
    sticky: els.pinState.checked,
  });
}

function updateScale(value) {
  const scale = Number(value || 1.2);
  els.scaleSlider.value = String(scale);
  els.scaleOutput.value = `${Math.round(scale * 100)}%`;
  window.petBridge.resizePet(scale);
}

function availableStateLine() {
  return Object.entries(states)
    .map(([name, state]) => `${name}=${state.label}`)
    .join(", ");
}

function buildMessages(userText) {
  const controllerPrompt = [
    "你必须只返回 JSON，不要 Markdown。",
    '格式固定为：{"reply":"一句中文回复","state":"动作名"}',
    `可用动作：${availableStateLine()}`,
    `当前动作：${currentState}`,
    `桌宠描述：${pet.description || ""}`,
  ].join("\n");
  const messages = [
    { role: "system", content: `${els.personaPrompt.value.trim()}\n\n${controllerPrompt}` },
  ];
  if (els.assistantPrompt.value.trim()) {
    messages.push({ role: "assistant", content: els.assistantPrompt.value.trim() });
  }
  messages.push(...history.filter((message) => message.content).slice(-20));
  messages.push({ role: "user", content: userText });
  return messages;
}

async function askLlm(userText) {
  if (!els.llmEnabled.checked) {
    return localCommand(userText, states);
  }
  try {
    const response = await window.petBridge.chat({
      baseUrl: els.llmBaseUrl.value.trim(),
      apiKey: els.llmApiKey.value.trim(),
      model: els.llmModel.value.trim(),
      messages: buildMessages(userText),
    });
    const parsed = parseAssistantPayload(response.text, states);
    return parsed.state ? parsed : { ...parsed, state: localCommand(userText, states).state };
  } catch (error) {
    appendMessage("assistant", `LLM 调用失败，已走本地规则：${error.message.slice(0, 90)}`);
    return localCommand(userText, states);
  }
}

async function speak(text) {
  if (!els.ttsEnabled.checked || !text) {
    return;
  }
  if (els.ttsMode.value === "api") {
    try {
      const audio = await window.petBridge.tts({
        baseUrl: els.ttsBaseUrl.value.trim(),
        apiKey: els.ttsApiKey.value.trim(),
        model: els.ttsModel.value.trim(),
        voice: els.ttsVoice.value.trim(),
        input: text,
        instructions: els.ttsPrompt.value.trim(),
      });
      const player = new Audio(`data:${audio.mimeType};base64,${audio.base64}`);
      await player.play();
      return;
    } catch (error) {
      appendMessage("assistant", `TTS API 失败，已回退系统语音：${error.message.slice(0, 90)}`);
    }
  }
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-CN";
    utterance.rate = 1.02;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  }
}

async function handleChat(text) {
  const userText = text.trim();
  if (!userText) {
    return;
  }
  appendMessage("user", userText);
  setPetState(states.review ? "review" : "idle", "我想一下。");
  const answer = await askLlm(userText);
  const state = states[answer.state] ? answer.state : localCommand(userText, states).state;
  const reply = answer.reply || "嗯。";
  appendMessage("assistant", reply);
  history.push({ role: "user", content: userText }, { role: "assistant", content: reply });
  if (history.length > 80) {
    history = history.slice(-80);
  }
  renderHistory();
  saveSettings();
  setPetState(state, reply);
  await speak(reply);
}

function wireEvents() {
  els.importPet.addEventListener("click", async () => {
    const nextPet = await window.petBridge.choosePetDirectory();
    if (nextPet) {
      applyPet(nextPet);
    }
  });
  els.resetPet.addEventListener("click", () => {
    const nextPet = clone(DEFAULT_PET);
    applyPet(nextPet);
    window.petBridge.setPet(nextPet);
  });
  els.scaleSlider.addEventListener("input", () => updateScale(els.scaleSlider.value));
  els.keymapToggle.addEventListener("click", () => {
    const shouldOpen = els.keymapPanel.hidden;
    els.keymapPanel.hidden = !shouldOpen;
    els.keymapToggle.classList.toggle("is-active", shouldOpen);
  });
  els.sayButton.addEventListener("click", () => {
    const text = els.speechInput.value.trim();
    if (text) {
      window.petBridge.setSpeech({ text });
      speak(text);
    }
  });
  els.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = els.chatInput.value;
    els.chatInput.value = "";
    handleChat(text);
  });
  els.addHistory.addEventListener("click", () => {
    history.push({ role: "user", content: "" });
    renderHistory();
    saveSettings();
  });
  els.clearHistory.addEventListener("click", () => {
    history = [];
    renderHistory();
    saveSettings();
  });

  [
    els.llmEnabled,
    els.llmBaseUrl,
    els.llmModel,
    els.llmApiKey,
    els.ttsEnabled,
    els.ttsMode,
    els.ttsBaseUrl,
    els.ttsModel,
    els.ttsVoice,
    els.ttsApiKey,
    els.personaPrompt,
    els.assistantPrompt,
    els.ttsPrompt,
  ].forEach((input) => {
    input.addEventListener("change", saveSettings);
    input.addEventListener("input", saveSettings);
  });

  document.addEventListener("keydown", (event) => {
    if (isTypingTarget(event.target)) {
      return;
    }
    const shortcut = eventShortcut(event);
    if (!shortcut) {
      return;
    }
    const stateName = getActionOrder(states).find((name) => normalizeShortcut(keymap[name]) === shortcut);
    if (!stateName) {
      return;
    }
    event.preventDefault();
    setPetState(stateName, DEFAULT_LINES[stateName] || stateLabel(stateName, states[stateName]));
  });

  window.petBridge.onPetChanged((nextPet) => applyPet(nextPet));
  window.petBridge.onPetState((payload) => {
    currentState = payload.state || payload;
    markActiveState();
  });
  window.petBridge.onPetScale((scale) => {
    els.scaleSlider.value = String(scale);
    els.scaleOutput.value = `${Math.round(scale * 100)}%`;
  });
}

async function init() {
  loadSettings();
  renderHistory();
  const initial = await window.petBridge.getInitialState();
  applyPet(initial.pet || clone(DEFAULT_PET));
  currentState = initial.currentState || "idle";
  updateScale(initial.scale || 1.2);
  wireEvents();
}

init();
