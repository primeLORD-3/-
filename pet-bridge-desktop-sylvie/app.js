"use strict";

const CODEX_HATCH_PROTOCOL = {
  name: "codex-hatch-pet",
  atlas: {
    columns: 8,
    rows: 9,
    cellWidth: 192,
    cellHeight: 208,
  },
  states: {
    idle: { row: 0, durations: [280, 110, 110, 140, 140, 320], label: "待机", icon: "I" },
    "running-right": {
      row: 1,
      durations: [120, 120, 120, 120, 120, 120, 120, 220],
      label: "向右",
      icon: "R",
    },
    "running-left": {
      row: 2,
      durations: [120, 120, 120, 120, 120, 120, 120, 220],
      label: "向左",
      icon: "L",
    },
    waving: { row: 3, durations: [140, 140, 140, 280], label: "招呼", icon: "W", transient: true },
    jumping: {
      row: 4,
      durations: [140, 140, 140, 140, 280],
      label: "跳跃",
      icon: "J",
      transient: true,
    },
    failed: {
      row: 5,
      durations: [140, 140, 140, 140, 140, 140, 140, 240],
      label: "受挫",
      icon: "F",
      transient: true,
    },
    waiting: { row: 6, durations: [150, 150, 150, 150, 150, 260], label: "等待", icon: "T" },
    running: { row: 7, durations: [120, 120, 120, 120, 120, 220], label: "工作", icon: "P" },
    review: { row: 8, durations: [150, 150, 150, 150, 150, 280], label: "审阅", icon: "V" },
  },
};

const DEFAULT_PET = {
  id: "sylvie",
  displayName: "希尔薇",
  description:
    "A wholesome compact Codex digital pet inspired by Sylvie: a shy gray-haired chibi companion with teal hairpins, black hair ribbons, melancholic cautious eyes, and three modest outfit variants.",
  spritesheetPath: "assets/spritesheet.webp",
  protocol: CODEX_HATCH_PROTOCOL,
  imageUrl: "assets/spritesheet.webp",
};

const DEFAULT_LINES = {
  idle: "我在。",
  "running-right": "向右巡逻。",
  "running-left": "向左巡逻。",
  waving: "收到。",
  jumping: "好。",
  failed: "先稳住。",
  waiting: "我等你。",
  running: "开始处理。",
  review: "我来看看。",
};

const DEFAULT_ACTION_ORDER = [
  "idle",
  "waiting",
  "running",
  "review",
  "waving",
  "jumping",
  "failed",
  "running-left",
  "running-right",
];

const SEQUENCES = {
  greeting: {
    label: "问候",
    steps: [
      ["waving", 1300, "你好。"],
      ["idle", 900, "我在这里。"],
    ],
  },
  patrol: {
    label: "巡逻",
    steps: [
      ["running-right", 1600, "右侧安全。"],
      ["running-left", 1600, "左侧安全。"],
      ["waiting", 1100, "回到岗位。"],
    ],
  },
  focus: {
    label: "专注",
    steps: [
      ["review", 1700, "先检查。"],
      ["running", 1900, "开始执行。"],
      ["idle", 900, "完成一轮。"],
    ],
  },
  recover: {
    label: "恢复",
    steps: [
      ["failed", 1300, "有点麻烦。"],
      ["waiting", 1100, "重新整理。"],
      ["jumping", 900, "可以继续。"],
    ],
  },
};

const COMMANDS = [
  [["你好", "嗨", "打招呼", "hello", "hi"], "waving", "你好，我在。"],
  [["跳", "跳一下", "jump"], "jumping", "好，跳一下。"],
  [["工作", "运行", "开始", "处理", "run"], "running", "开始处理。"],
  [["检查", "审阅", "看代码", "review"], "review", "我来检查。"],
  [["等", "等待", "wait"], "waiting", "我等你。"],
  [["失败", "报错", "坏了", "难过", "error", "fail", "sad"], "failed", "先别急。"],
  [["左", "left"], "running-left", "向左。"],
  [["右", "right"], "running-right", "向右。"],
  [["休息", "待机", "idle"], "idle", "好，我待机。"],
];

const els = {
  sprite: document.querySelector("#petSprite"),
  petButton: document.querySelector("#petButton"),
  petName: document.querySelector("#petName"),
  stageSurface: document.querySelector("#stageSurface"),
  actionGrid: document.querySelector("#actionGrid"),
  stateChip: document.querySelector("#stateChip"),
  serverChip: document.querySelector("#serverChip"),
  speech: document.querySelector("#speechBubble"),
  chatForm: document.querySelector("#chatForm"),
  chatInput: document.querySelector("#chatInput"),
  log: document.querySelector("#eventLog"),
  autoMode: document.querySelector("#autoMode"),
  pinState: document.querySelector("#pinState"),
  bondMeter: document.querySelector("#bondMeter"),
  focusMeter: document.querySelector("#focusMeter"),
  sequenceRow: document.querySelector("#sequenceRow"),
  petFiles: document.querySelector("#petFiles"),
  petDirectory: document.querySelector("#petDirectory"),
  importHint: document.querySelector("#importHint"),
  resetPet: document.querySelector("#resetPet"),
  llmEnabled: document.querySelector("#llmEnabled"),
  llmBaseUrl: document.querySelector("#llmBaseUrl"),
  llmModel: document.querySelector("#llmModel"),
  llmApiKey: document.querySelector("#llmApiKey"),
  ttsEnabled: document.querySelector("#ttsEnabled"),
  ttsMode: document.querySelector("#ttsMode"),
  ttsBaseUrl: document.querySelector("#ttsBaseUrl"),
  ttsModel: document.querySelector("#ttsModel"),
  ttsVoice: document.querySelector("#ttsVoice"),
  ttsApiKey: document.querySelector("#ttsApiKey"),
};

let pet = structuredClone(DEFAULT_PET);
let states = normalizeStates(pet.protocol.states);
let currentState = "idle";
let frameIndex = 0;
let elapsed = 0;
let lastTime = performance.now();
let returnTimer = 0;
let autoTimer = 0;
let sequenceTimer = 0;
let lastInteraction = Date.now();
let bond = Number(localStorage.getItem("pet-bridge-bond") || 42);
let focus = Number(localStorage.getItem("pet-bridge-focus") || 55);
let petPosition = { x: 0, y: 0 };
let drag = null;
let serverAvailable = false;
let conversation = [];
let lastObjectUrl = "";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeStates(rawStates) {
  const next = {};
  Object.entries(rawStates || {}).forEach(([name, state]) => {
    const frameCount = Number(state.frames || state.frameCount || state.durations?.length || 1);
    const durations = Array.isArray(state.durations)
      ? state.durations.map((value) => Number(value) || 140)
      : Array.from({ length: frameCount }, () => Number(state.duration || 140));
    next[name] = {
      row: Number(state.row || 0),
      colStart: Number(state.colStart || state.column || 0),
      durations,
      label: state.label || name,
      icon: state.icon || state.label?.slice(0, 1) || name.slice(0, 1).toUpperCase(),
      transient: Boolean(state.transient),
    };
  });
  return next;
}

function getActionOrder() {
  const known = DEFAULT_ACTION_ORDER.filter((name) => states[name]);
  const extra = Object.keys(states).filter((name) => !known.includes(name));
  return [...known, ...extra];
}

function activeState() {
  return states[currentState] || states.idle || Object.values(states)[0];
}

function framePercent(index) {
  const columns = pet.protocol.atlas.columns;
  if (columns <= 1) {
    return "0%";
  }
  return `${(index / (columns - 1)) * 100}%`;
}

function rowPercent(index) {
  const rows = pet.protocol.atlas.rows;
  if (rows <= 1) {
    return "0%";
  }
  return `${(index / (rows - 1)) * 100}%`;
}

function paintFrame() {
  const state = activeState();
  els.sprite.style.setProperty("--frame", framePercent((state.colStart || 0) + frameIndex));
  els.sprite.style.setProperty("--row", rowPercent(state.row));
}

function applyPetVisuals() {
  const atlas = pet.protocol.atlas;
  const imageUrl = pet.imageUrl || pet.spritesheetPath || "assets/spritesheet.webp";
  els.petName.textContent = pet.displayName || pet.id || "Pet";
  els.sprite.style.setProperty("--pet-image", `url("${imageUrl}")`);
  els.sprite.style.setProperty("--pet-bg-size", `${atlas.columns * 100}% ${atlas.rows * 100}%`);
  els.petButton.style.setProperty("--pet-aspect", `${atlas.cellWidth} / ${atlas.cellHeight}`);
  document.title = `${pet.displayName || "Pet"} Bridge`;
}

function updateSelectedButton() {
  document.querySelectorAll(".action-button").forEach((button) => {
    button.classList.toggle("is-selected", button.dataset.state === currentState);
  });
}

function setMeters() {
  els.bondMeter.value = bond;
  els.focusMeter.value = focus;
  localStorage.setItem("pet-bridge-bond", String(Math.round(bond)));
  localStorage.setItem("pet-bridge-focus", String(Math.round(focus)));
}

function speakBubble(text, quiet = false) {
  els.speech.textContent = text;
  els.speech.classList.toggle("is-quiet", quiet);
}

function logEvent(text) {
  const item = document.createElement("li");
  const time = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  item.textContent = `${time} · ${text}`;
  els.log.prepend(item);
  while (els.log.children.length > 18) {
    els.log.lastElementChild.remove();
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
  lastInteraction = Date.now();
  const state = activeState();
  els.stateChip.textContent = state.label;
  els.petButton.classList.toggle("is-active", name !== "idle" && name !== "waiting");
  updateSelectedButton();
  paintFrame();

  const line = options.speech || DEFAULT_LINES[name] || state.label;
  speakBubble(line, name === "idle" || name === "waiting");
  if (options.voice !== false) {
    speak(line);
  }
  if (options.log !== false) {
    logEvent(options.reason || `动作：${state.label}`);
  }

  const shouldReturn =
    !els.pinState.checked &&
    !options.sticky &&
    (state.transient || options.returnToIdle);

  if (shouldReturn) {
    const totalDuration = state.durations.reduce((sum, value) => sum + value, 0);
    returnTimer = window.setTimeout(() => {
      setState("idle", { reason: "回到待机", log: false, speech: DEFAULT_LINES.idle });
    }, options.returnAfter || totalDuration + 260);
  }
}

function nudgeStats(nextBond, nextFocus) {
  bond = clamp(bond + nextBond, 0, 100);
  focus = clamp(focus + nextFocus, 0, 100);
  setMeters();
}

function buildActions() {
  els.actionGrid.innerHTML = "";
  getActionOrder().forEach((name) => {
    const state = states[name];
    const button = document.createElement("button");
    button.type = "button";
    button.className = "action-button";
    button.dataset.state = name;
    button.title = state.label;
    button.innerHTML = `<span aria-hidden="true">${state.icon}</span><span>${state.label}</span>`;
    button.addEventListener("click", () => {
      nudgeStats(1, name === "review" || name === "running" ? 2 : 0);
      setState(name, { reason: `手动设为${state.label}`, sticky: els.pinState.checked });
    });
    els.actionGrid.append(button);
  });
  updateSelectedButton();
}

function buildSequences() {
  els.sequenceRow.innerHTML = "";
  Object.entries(SEQUENCES).forEach(([id, sequence]) => {
    const valid = sequence.steps.every(([state]) => states[state]);
    if (!valid) {
      return;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sequence-button";
    button.textContent = sequence.label;
    button.addEventListener("click", () => runSequence(id));
    els.sequenceRow.append(button);
  });
}

function runSequence(id) {
  const sequence = SEQUENCES[id];
  if (!sequence) {
    return;
  }
  window.clearTimeout(sequenceTimer);
  nudgeStats(2, id === "focus" ? 5 : 1);
  logEvent(`序列：${sequence.label}`);

  let index = 0;
  const step = () => {
    const [stateName, duration, line] = sequence.steps[index];
    setState(stateName, {
      speech: line,
      reason: `${sequence.label}：${states[stateName].label}`,
      sticky: true,
      log: false,
    });
    index += 1;
    if (index < sequence.steps.length) {
      sequenceTimer = window.setTimeout(step, duration);
    } else if (!els.pinState.checked) {
      sequenceTimer = window.setTimeout(() => {
        setState("idle", { log: false, speech: DEFAULT_LINES.idle });
      }, duration);
    }
  };
  step();
}

function localCommand(raw) {
  const value = raw.trim().toLowerCase();
  for (const [terms, state, speech] of COMMANDS) {
    if (states[state] && terms.some((term) => value.includes(term.toLowerCase()))) {
      return { reply: speech, state };
    }
  }
  return { reply: "我听到了，先判断一下。", state: states.review ? "review" : "idle" };
}

function parseAssistantPayload(text) {
  const trimmed = String(text || "").trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        reply: String(parsed.reply || parsed.text || trimmed).trim(),
        state: states[parsed.state] ? parsed.state : "",
      };
    } catch {
      // Fall through to plain text.
    }
  }

  const lower = trimmed.toLowerCase();
  const guessed = COMMANDS.find(([, state]) => states[state] && lower.includes(state));
  return { reply: trimmed || "嗯。", state: guessed?.[1] || "" };
}

async function sendToLlm(userText) {
  if (!els.llmEnabled.checked || !serverAvailable) {
    return localCommand(userText);
  }

  const availableStates = Object.entries(states).map(([name, state]) => ({
    name,
    label: state.label,
  }));
  const system = [
    `你是桌宠 ${pet.displayName || pet.id || "Pet"} 的回复核心。`,
    "回答要短，适合气泡显示。",
    "必须只返回 JSON，不要 Markdown。",
    '格式：{"reply":"一句中文回复","state":"动作名"}',
    `可用动作：${availableStates.map((item) => item.name).join(", ")}`,
    `当前动作：${currentState}`,
    `宠物描述：${pet.description || ""}`,
  ].join("\n");

  const messages = [
    { role: "system", content: system },
    ...conversation.slice(-8),
    { role: "user", content: userText },
  ];

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: els.llmBaseUrl.value.trim(),
        apiKey: els.llmApiKey.value.trim(),
        model: els.llmModel.value.trim(),
        messages,
      }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    const data = await response.json();
    const parsed = parseAssistantPayload(data.text);
    conversation.push({ role: "user", content: userText });
    conversation.push({ role: "assistant", content: parsed.reply });
    return parsed;
  } catch (error) {
    logEvent(`LLM 失败：${error.message.slice(0, 80)}`);
    return localCommand(userText);
  }
}

async function handleChat(raw) {
  const text = raw.trim();
  if (!text) {
    return;
  }
  logEvent(`你：${text}`);
  nudgeStats(1, 1);
  setState(states.review ? "review" : "idle", {
    speech: "我想一下。",
    reason: "收到消息",
    sticky: true,
    voice: false,
    log: false,
  });
  const answer = await sendToLlm(text);
  const nextState = answer.state || localCommand(text).state;
  nudgeStats(nextState === "waving" ? 3 : 1, nextState === "review" || nextState === "running" ? 4 : 0);
  setState(nextState, {
    speech: answer.reply,
    reason: `回复：${answer.reply}`,
    sticky: els.pinState.checked,
  });
}

async function speak(text) {
  if (!els.ttsEnabled.checked || !text) {
    return;
  }

  if (els.ttsMode.value === "api" && serverAvailable) {
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: els.ttsBaseUrl.value.trim(),
          apiKey: els.ttsApiKey.value.trim(),
          model: els.ttsModel.value.trim(),
          voice: els.ttsVoice.value.trim(),
          input: text,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      audio.play().catch(() => browserSpeak(text));
      return;
    } catch (error) {
      logEvent(`TTS 失败：${error.message.slice(0, 80)}`);
    }
  }

  browserSpeak(text);
}

function browserSpeak(text) {
  if (!("speechSynthesis" in window)) {
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1.02;
  utterance.pitch = 1.08;
  window.speechSynthesis.speak(utterance);
}

function updatePetPosition() {
  els.petButton.style.setProperty("--pet-x", `${petPosition.x}px`);
  els.petButton.style.setProperty("--pet-y", `${petPosition.y}px`);
}

function pointerPoint(event) {
  return { x: event.clientX, y: event.clientY };
}

function beginDrag(event) {
  if (event.button !== undefined && event.button !== 0) {
    return;
  }
  const point = pointerPoint(event);
  drag = {
    startX: point.x,
    startY: point.y,
    originX: petPosition.x,
    originY: petPosition.y,
    moved: false,
  };
  els.petButton.setPointerCapture?.(event.pointerId);
}

function moveDrag(event) {
  if (!drag) {
    return;
  }

  const point = pointerPoint(event);
  const dx = point.x - drag.startX;
  const dy = point.y - drag.startY;
  if (Math.abs(dx) + Math.abs(dy) > 6) {
    drag.moved = true;
  }

  const stageRect = els.stageSurface.getBoundingClientRect();
  const petRect = els.petButton.getBoundingClientRect();
  const maxX = Math.max(24, stageRect.width / 2 - petRect.width / 2 - 24);
  const maxY = Math.max(18, stageRect.height / 2 - petRect.height / 2 - 18);
  petPosition.x = clamp(drag.originX + dx, -maxX, maxX);
  petPosition.y = clamp(drag.originY + dy, -maxY, maxY);
  updatePetPosition();

  if (Math.abs(dx) > 18) {
    const directional = dx > 0 ? "running-right" : "running-left";
    if (states[directional]) {
      setState(directional, {
        speech: dx > 0 ? "往右。" : "往左。",
        reason: "拖拽移动",
        sticky: true,
        log: false,
      });
    }
  }
}

function endDrag(event) {
  if (!drag) {
    return;
  }

  els.petButton.releasePointerCapture?.(event.pointerId);
  if (drag.moved) {
    nudgeStats(2, 0);
    setState(states.waiting ? "waiting" : "idle", {
      reason: "移动结束",
      speech: "我站好了。",
      returnToIdle: true,
    });
  } else {
    nudgeStats(4, 0);
    setState(states.waving ? "waving" : "idle", { reason: "点击互动", speech: "嗯？我在。" });
  }
  drag = null;
}

function runAutonomy() {
  window.clearInterval(autoTimer);
  autoTimer = window.setInterval(() => {
    if (!els.autoMode.checked || els.pinState.checked) {
      return;
    }
    const idleFor = Date.now() - lastInteraction;
    if (idleFor < 6500) {
      return;
    }

    if (focus > 72 && states.review && currentState !== "review") {
      setState("review", { reason: "自主检查", speech: "我顺手检查一下。", returnToIdle: true });
      focus = clamp(focus - 7, 0, 100);
      setMeters();
      return;
    }

    const candidates = ["waiting", "idle", "waving", "review"].filter((name) => states[name]);
    const next = candidates[Math.floor(Math.random() * candidates.length)] || Object.keys(states)[0];
    const line = {
      waiting: "我守着。",
      idle: "我在。",
      waving: "还在吗？",
      review: "看一眼情况。",
    }[next];
    setState(next, { reason: "自主行为", speech: line, returnToIdle: next !== "idle" && next !== "waiting" });
  }, 3400);
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

function fileName(file) {
  return (file.webkitRelativePath || file.name || "").replaceAll("\\", "/");
}

function findFile(files, path) {
  const normalized = String(path || "").replaceAll("\\", "/").toLowerCase();
  return files.find((file) => fileName(file).toLowerCase().endsWith(normalized));
}

function imageFile(files, preferredPath) {
  if (preferredPath) {
    const exact = findFile(files, preferredPath);
    if (exact) {
      return exact;
    }
  }
  return files.find((file) => /\.(webp|png|jpe?g)$/i.test(file.name));
}

function protocolFromManifest(manifest, fallbackName = "custom-spritesheet") {
  const protocolSource = manifest.protocol && typeof manifest.protocol === "object"
    ? manifest.protocol
    : manifest;
  const states = protocolSource.states || manifest.states;
  if (!states || typeof states !== "object") {
    return null;
  }
  const atlas = protocolSource.atlas || manifest.atlas || {};
  return {
    name:
      protocolSource.name ||
      (typeof manifest.protocol === "string" ? manifest.protocol : fallbackName),
    atlas: {
      columns: Number(atlas.columns || 8),
      rows: Number(atlas.rows || 9),
      cellWidth: Number(atlas.cellWidth || atlas.frameWidth || 192),
      cellHeight: Number(atlas.cellHeight || atlas.frameHeight || 208),
    },
    states,
  };
}

function readText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

function codexManifestToPet(manifest, imageUrl) {
  return {
    id: manifest.id || "imported-pet",
    displayName: manifest.displayName || manifest.name || manifest.id || "Imported Pet",
    description: manifest.description || "",
    spritesheetPath: manifest.spritesheetPath || "spritesheet.webp",
    protocol: protocolFromManifest(manifest) || CODEX_HATCH_PROTOCOL,
    imageUrl,
  };
}

function adapterManifestToPet(manifest, imageUrl) {
  const protocol =
    protocolFromManifest(
      manifest,
      typeof manifest.protocol === "string" ? manifest.protocol : "custom-spritesheet",
    ) || CODEX_HATCH_PROTOCOL;
  return {
    id: manifest.id || "custom-pet",
    displayName: manifest.displayName || manifest.name || manifest.id || "Imported Pet",
    description: manifest.description || "",
    spritesheetPath: manifest.spritesheetPath || manifest.image || "spritesheet.webp",
    protocol,
    imageUrl,
  };
}

async function importPetFromFiles(fileList) {
  const files = Array.from(fileList || []);
  if (!files.length) {
    return;
  }

  const adapterFile =
    files.find((file) => /pet\.adapter\.json$/i.test(file.name)) ||
    files.find((file) => /adapter\.json$/i.test(file.name));
  const petFile =
    adapterFile ||
    files.find((file) => /pet\.json$/i.test(file.name)) ||
    files.find((file) => /\.json$/i.test(file.name));

  if (!petFile) {
    els.importHint.textContent = "没有找到 JSON 清单。";
    return;
  }

  try {
    const manifest = JSON.parse(await readText(petFile));
    const preferredPath = manifest.spritesheetPath || manifest.image || manifest.texture || "";
    const sheet = imageFile(files, preferredPath);
    if (!sheet) {
      els.importHint.textContent = "找到了清单，但没有找到精灵表图片。";
      return;
    }
    if (lastObjectUrl) {
      URL.revokeObjectURL(lastObjectUrl);
    }
    lastObjectUrl = URL.createObjectURL(sheet);
    const nextPet = manifest.states || manifest.atlas || (manifest.protocol && typeof manifest.protocol === "object")
      ? adapterManifestToPet(manifest, lastObjectUrl)
      : codexManifestToPet(manifest, lastObjectUrl);
    loadPet(nextPet);
    els.importHint.textContent = `已导入：${nextPet.displayName}`;
    logEvent(`导入宠物：${nextPet.displayName}`);
  } catch (error) {
    els.importHint.textContent = `导入失败：${error.message}`;
  }
}

function loadPet(nextPet) {
  pet = nextPet;
  states = normalizeStates(nextPet.protocol.states);
  conversation = [];
  applyPetVisuals();
  buildActions();
  buildSequences();
  setState(states.idle ? "idle" : Object.keys(states)[0], {
    log: false,
    speech: DEFAULT_LINES.idle,
    voice: false,
  });
}

function resetPet() {
  if (lastObjectUrl) {
    URL.revokeObjectURL(lastObjectUrl);
    lastObjectUrl = "";
  }
  loadPet(structuredClone(DEFAULT_PET));
  els.importHint.textContent = "已恢复默认希尔薇。";
  logEvent("恢复默认宠物");
}

function saveSettings() {
  const settings = {
    llmEnabled: els.llmEnabled.checked,
    llmBaseUrl: els.llmBaseUrl.value,
    llmModel: els.llmModel.value,
    ttsEnabled: els.ttsEnabled.checked,
    ttsMode: els.ttsMode.value,
    ttsBaseUrl: els.ttsBaseUrl.value,
    ttsModel: els.ttsModel.value,
    ttsVoice: els.ttsVoice.value,
  };
  localStorage.setItem("pet-bridge-settings", JSON.stringify(settings));
}

function loadSettings() {
  const settings = JSON.parse(localStorage.getItem("pet-bridge-settings") || "{}");
  els.llmEnabled.checked = Boolean(settings.llmEnabled);
  els.llmBaseUrl.value = settings.llmBaseUrl || "";
  els.llmModel.value = settings.llmModel || "";
  els.ttsEnabled.checked = settings.ttsEnabled !== false;
  els.ttsMode.value = settings.ttsMode || "browser";
  els.ttsBaseUrl.value = settings.ttsBaseUrl || "";
  els.ttsModel.value = settings.ttsModel || "";
  els.ttsVoice.value = settings.ttsVoice || "";
}

async function checkServer() {
  try {
    const response = await fetch("/api/health", { cache: "no-store" });
    serverAvailable = response.ok;
  } catch {
    serverAvailable = false;
  }
  els.serverChip.textContent = serverAvailable ? "API 已连接" : "本地模式";
}

function wireEvents() {
  els.chatForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = els.chatInput.value;
    els.chatInput.value = "";
    handleChat(value);
  });

  els.petButton.addEventListener("pointerdown", beginDrag);
  els.petButton.addEventListener("pointermove", moveDrag);
  els.petButton.addEventListener("pointerup", endDrag);
  els.petButton.addEventListener("pointercancel", endDrag);
  els.petButton.addEventListener("dblclick", () => {
    nudgeStats(2, 0);
    setState(states.jumping ? "jumping" : "idle", { reason: "双击互动", speech: "收到。" });
  });

  els.stageSurface.addEventListener("pointerenter", () => {
    if (!els.pinState.checked && currentState === "idle" && states.waiting) {
      setState("waiting", { reason: "靠近互动区", speech: "我注意到了。", returnToIdle: true });
    }
  });

  els.petFiles.addEventListener("change", () => importPetFromFiles(els.petFiles.files));
  els.petDirectory.addEventListener("change", () => importPetFromFiles(els.petDirectory.files));
  els.resetPet.addEventListener("click", resetPet);

  [
    els.llmEnabled,
    els.llmBaseUrl,
    els.llmModel,
    els.ttsEnabled,
    els.ttsMode,
    els.ttsBaseUrl,
    els.ttsModel,
    els.ttsVoice,
  ].forEach((input) => {
    input.addEventListener("change", saveSettings);
    input.addEventListener("input", saveSettings);
  });

  els.autoMode.addEventListener("change", () => {
    logEvent(els.autoMode.checked ? "自主行为开启" : "自主行为关闭");
  });

  window.addEventListener("keydown", (event) => {
    if (document.activeElement === els.chatInput) {
      return;
    }
    if (event.key === "ArrowLeft" && states["running-left"]) {
      setState("running-left", { reason: "键盘向左", sticky: els.pinState.checked });
    } else if (event.key === "ArrowRight" && states["running-right"]) {
      setState("running-right", { reason: "键盘向右", sticky: els.pinState.checked });
    } else if (event.key === " ") {
      event.preventDefault();
      setState(states.waving ? "waving" : "idle", { reason: "键盘互动", speech: "在。" });
    }
  });
}

function init() {
  loadSettings();
  setMeters();
  loadPet(structuredClone(DEFAULT_PET));
  wireEvents();
  runAutonomy();
  checkServer();
  requestAnimationFrame(animate);
  logEvent("Pet Bridge 已载入");
}

init();
