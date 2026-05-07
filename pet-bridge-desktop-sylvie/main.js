"use strict";

const { app, BrowserWindow, dialog, ipcMain, screen } = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = __dirname;
const DEFAULT_SCALE = 1.2;
const state = {
  pet: null,
  currentState: "idle",
  speech: "我在。",
  scale: DEFAULT_SCALE,
};

let petWindow = null;
let consoleWindow = null;

process.on("uncaughtException", (error) => {
  console.error("Main process error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("Unhandled main process rejection:", error);
});

function endpoint(baseUrl, suffix) {
  const raw = String(baseUrl || "").trim();
  if (!raw) {
    return "";
  }
  if (raw.endsWith(suffix)) {
    return raw;
  }
  return raw.replace(/\/+$/, "") + suffix;
}

function authKey(bodyKey, envName) {
  return String(bodyKey || process.env[envName] || process.env.OPENAI_API_KEY || "").trim();
}

function extractResponsesText(data) {
  if (typeof data.output_text === "string") {
    return data.output_text;
  }
  const pieces = [];
  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") {
        pieces.push(content.text);
      }
    }
  }
  return pieces.join("\n").trim();
}

function broadcast(channel, payload) {
  for (const target of [petWindow, consoleWindow]) {
    if (target && !target.isDestroyed()) {
      target.webContents.send(channel, payload);
    }
  }
}

function petWindowSize(scale) {
  return {
    width: Math.round(Math.max(360, 420 * scale)),
    height: Math.round(Math.max(400, 470 * scale)),
  };
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function visiblePosition(x, y, width, height) {
  let displays = [];
  try {
    displays = screen.getAllDisplays();
  } catch {
    return { x: Math.round(x), y: Math.round(y) };
  }
  if (!displays.length) {
    return { x: Math.round(x), y: Math.round(y) };
  }
  const margin = 48;
  const minX = Math.min(...displays.map((display) => display.workArea.x));
  const minY = Math.min(...displays.map((display) => display.workArea.y));
  const maxX = Math.max(...displays.map((display) => display.workArea.x + display.workArea.width));
  const maxY = Math.max(...displays.map((display) => display.workArea.y + display.workArea.height));
  return {
    x: Math.round(clamp(x, minX - width + margin, maxX - margin)),
    y: Math.round(clamp(y, minY - height + margin, maxY - margin)),
  };
}

function applyPetScale(scale) {
  state.scale = clamp(finiteNumber(scale, DEFAULT_SCALE), 0.55, 2.6);
  if (petWindow && !petWindow.isDestroyed()) {
    const bounds = petWindow.getBounds();
    const size = petWindowSize(state.scale);
    const position = visiblePosition(bounds.x, bounds.y, size.width, size.height);
    try {
      petWindow.setBounds({
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      });
    } catch (error) {
      console.warn("Ignoring invalid pet resize:", error.message);
    }
  }
  broadcast("pet:scale", state.scale);
}

function createPetWindow() {
  const size = petWindowSize(state.scale);
  const window = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: 80,
    y: 120,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    backgroundColor: "#00000000",
    webPreferences: {
      preload: path.join(ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWindow = window;
  window.setAlwaysOnTop(true, "screen-saver");
  window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  window.on("closed", () => {
    if (petWindow === window) {
      petWindow = null;
    }
  });
  window.webContents.on("render-process-gone", (_event, details) => {
    console.warn("Pet renderer gone; rebuilding pet window:", details.reason);
    const bounds = window.isDestroyed() ? null : window.getBounds();
    if (!window.isDestroyed()) {
      window.destroy();
    }
    setTimeout(() => {
      if (app.isReady() && !petWindow) {
        createPetWindow();
        if (bounds && petWindow && !petWindow.isDestroyed()) {
          const position = visiblePosition(bounds.x, bounds.y, bounds.width, bounds.height);
          petWindow.setBounds({
            x: position.x,
            y: position.y,
            width: bounds.width,
            height: bounds.height,
          });
        }
      }
    }, 250);
  });
  window.loadFile(path.join(ROOT, "pet.html"));
}

function createConsoleWindow() {
  consoleWindow = new BrowserWindow({
    width: 1080,
    height: 780,
    minWidth: 860,
    minHeight: 620,
    title: "Pet Bridge 控制台",
    backgroundColor: "#111315",
    webPreferences: {
      preload: path.join(ROOT, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  consoleWindow.loadFile(path.join(ROOT, "console.html"));
}

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileUrl(filePath) {
  return pathToFileURL(filePath).toString();
}

function findImage(dir, preferred) {
  if (preferred) {
    const exact = path.resolve(dir, preferred);
    if (fs.existsSync(exact)) {
      return exact;
    }
  }
  const names = fs.readdirSync(dir);
  const imageName = names.find((name) => /\.(webp|png|jpe?g)$/i.test(name));
  return imageName ? path.join(dir, imageName) : "";
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

function codexManifestToPet(manifest, dir) {
  const imagePath = findImage(dir, manifest.spritesheetPath || "spritesheet.webp");
  if (!imagePath) {
    throw new Error("没有找到精灵表图片");
  }
  return {
    id: manifest.id || "imported-pet",
    displayName: manifest.displayName || manifest.name || manifest.id || "Imported Pet",
    description: manifest.description || "",
    spritesheetPath: manifest.spritesheetPath || path.basename(imagePath),
    protocol: protocolFromManifest(manifest),
    imageUrl: fileUrl(imagePath),
  };
}

function adapterManifestToPet(manifest, dir) {
  const imagePath = findImage(dir, manifest.spritesheetPath || manifest.image || manifest.texture);
  if (!imagePath) {
    throw new Error("没有找到精灵表图片");
  }
  return {
    id: manifest.id || "custom-pet",
    displayName: manifest.displayName || manifest.name || manifest.id || "Imported Pet",
    description: manifest.description || "",
    spritesheetPath: manifest.spritesheetPath || manifest.image || path.basename(imagePath),
    protocol: protocolFromManifest(
      manifest,
      typeof manifest.protocol === "string" ? manifest.protocol : "custom-spritesheet",
    ),
    imageUrl: fileUrl(imagePath),
  };
}

function readPetDirectory(dir) {
  const adapterPath = path.join(dir, "pet.adapter.json");
  const petPath = path.join(dir, "pet.json");
  if (fs.existsSync(adapterPath)) {
    return adapterManifestToPet(safeReadJson(adapterPath), dir);
  }
  if (fs.existsSync(petPath)) {
    return codexManifestToPet(safeReadJson(petPath), dir);
  }
  throw new Error("目录里没有 pet.json 或 pet.adapter.json");
}

ipcMain.handle("app:get-state", () => ({
  pet: state.pet,
  currentState: state.currentState,
  speech: state.speech,
  scale: state.scale,
}));

ipcMain.handle("pet:choose-directory", async () => {
  const result = await dialog.showOpenDialog(consoleWindow, {
    title: "选择宠物包目录",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) {
    return null;
  }
  const pet = readPetDirectory(result.filePaths[0]);
  state.pet = pet;
  broadcast("pet:changed", pet);
  return pet;
});

ipcMain.on("pet:set", (_event, pet) => {
  state.pet = pet;
  broadcast("pet:changed", pet);
});

ipcMain.on("pet:state", (_event, payload) => {
  state.currentState = payload.state || payload;
  if (payload.speech) {
    state.speech = payload.speech;
  }
  broadcast("pet:state", payload);
});

ipcMain.on("pet:speech", (_event, payload) => {
  state.speech = payload.text || payload;
  broadcast("pet:speech", payload);
});

ipcMain.on("pet:resize", (_event, scale) => {
  applyPetScale(scale);
});

ipcMain.on("pet:move-by", (_event, delta) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  const raw = delta && typeof delta === "object" ? delta : {};
  const dx = clamp(finiteNumber(raw.dx), -240, 240);
  const dy = clamp(finiteNumber(raw.dy), -240, 240);
  if (!dx && !dy) {
    return;
  }
  const bounds = petWindow.getBounds();
  const nextX = Math.round(finiteNumber(bounds.x) + dx);
  const nextY = Math.round(finiteNumber(bounds.y) + dy);
  if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
    return;
  }
  const position = visiblePosition(nextX, nextY, bounds.width, bounds.height);
  try {
    petWindow.setPosition(position.x, position.y, false);
  } catch (error) {
    console.warn("Ignoring invalid pet drag delta:", raw, error.message);
  }
});

ipcMain.on("pet:mouse-ignore", (_event, ignore) => {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }
  try {
    petWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  } catch (error) {
    console.warn("Ignoring invalid mouse-ignore update:", error.message);
  }
});

ipcMain.on("console:show", () => {
  if (!consoleWindow || consoleWindow.isDestroyed()) {
    createConsoleWindow();
  }
  consoleWindow.show();
  consoleWindow.focus();
});

ipcMain.handle("api:chat", async (_event, body) => {
  const baseUrl = String(body.baseUrl || process.env.PET_BRIDGE_LLM_BASE_URL || "").trim();
  const key = authKey(body.apiKey, "PET_BRIDGE_LLM_API_KEY");
  const model = String(body.model || process.env.PET_BRIDGE_LLM_MODEL || "").trim();
  const messages = Array.isArray(body.messages) ? body.messages : [];
  if (!baseUrl || !model) {
    throw new Error("LLM baseUrl and model are required");
  }

  const useResponses = baseUrl.includes("/responses");
  const target = useResponses ? baseUrl : endpoint(baseUrl, "/chat/completions");
  const payload = useResponses
    ? { model, input: messages.map((message) => ({ role: message.role, content: message.content })) }
    : { model, messages, temperature: Number(body.temperature ?? 0.7) };

  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text);
  }
  const data = JSON.parse(text);
  return {
    text: useResponses
      ? extractResponsesText(data)
      : String(data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "").trim(),
    raw: data,
  };
});

ipcMain.handle("api:tts", async (_event, body) => {
  const baseUrl = String(body.baseUrl || process.env.PET_BRIDGE_TTS_BASE_URL || "").trim();
  const key = authKey(body.apiKey, "PET_BRIDGE_TTS_API_KEY");
  const model = String(body.model || process.env.PET_BRIDGE_TTS_MODEL || "").trim();
  const voice = String(body.voice || process.env.PET_BRIDGE_TTS_VOICE || "alloy").trim();
  const input = String(body.input || "").trim();
  const instructions = String(body.instructions || process.env.PET_BRIDGE_TTS_PROMPT || "").trim();
  if (!baseUrl || !model || !input) {
    throw new Error("TTS baseUrl, model, and input are required");
  }

  const response = await fetch(endpoint(baseUrl, "/audio/speech"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model,
      voice,
      input,
      ...(instructions ? { instructions } : {}),
      response_format: body.format || "mp3",
    }),
  });
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new Error(buffer.toString("utf8"));
  }
  return {
    mimeType: response.headers.get("content-type") || "audio/mpeg",
    base64: buffer.toString("base64"),
  };
});

app.whenReady().then(() => {
  createPetWindow();
  createConsoleWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPetWindow();
      createConsoleWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
