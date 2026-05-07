"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const ROOT = __dirname;
const PORT = Number(process.env.PET_BRIDGE_PORT || 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "http://127.0.0.1:" + PORT,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...headers,
  });
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), { "Content-Type": "application/json; charset=utf-8" });
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 2 * 1024 * 1024) {
        reject(new Error("request too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

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

async function handleChat(req, res) {
  const body = await readJson(req);
  const baseUrl = String(body.baseUrl || process.env.PET_BRIDGE_LLM_BASE_URL || "").trim();
  const key = authKey(body.apiKey, "PET_BRIDGE_LLM_API_KEY");
  const model = String(body.model || process.env.PET_BRIDGE_LLM_MODEL || "").trim();
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!baseUrl || !model) {
    sendJson(res, 400, { error: "LLM baseUrl and model are required" });
    return;
  }

  const useResponses = baseUrl.includes("/responses");
  const target = useResponses ? baseUrl : endpoint(baseUrl, "/chat/completions");
  const payload = useResponses
    ? {
        model,
        input: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }
    : {
        model,
        messages,
        temperature: Number(body.temperature ?? 0.7),
      };

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
    sendJson(res, response.status, { error: text });
    return;
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    sendJson(res, 502, { error: "LLM returned non-JSON response" });
    return;
  }

  const answer = useResponses
    ? extractResponsesText(data)
    : String(data.choices?.[0]?.message?.content || data.choices?.[0]?.text || "").trim();
  sendJson(res, 200, { text: answer, raw: data });
}

async function handleTts(req, res) {
  const body = await readJson(req);
  const baseUrl = String(body.baseUrl || process.env.PET_BRIDGE_TTS_BASE_URL || "").trim();
  const key = authKey(body.apiKey, "PET_BRIDGE_TTS_API_KEY");
  const model = String(body.model || process.env.PET_BRIDGE_TTS_MODEL || "").trim();
  const voice = String(body.voice || process.env.PET_BRIDGE_TTS_VOICE || "alloy").trim();
  const input = String(body.input || "").trim();

  if (!baseUrl || !model || !input) {
    sendJson(res, 400, { error: "TTS baseUrl, model, and input are required" });
    return;
  }

  const target = endpoint(baseUrl, "/audio/speech");
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
    },
    body: JSON.stringify({
      model,
      voice,
      input,
      response_format: body.format || "mp3",
    }),
  });

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    sendJson(res, response.status, { error: buffer.toString("utf8") });
    return;
  }

  send(res, 200, buffer, {
    "Content-Type": response.headers.get("content-type") || "audio/mpeg",
    "Cache-Control": "no-store",
  });
}

function serveStatic(req, res, url) {
  const requestPath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const resolved = path.resolve(ROOT, "." + requestPath);
  if (!resolved.startsWith(ROOT)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  fs.readFile(resolved, (error, data) => {
    if (error) {
      send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }
    send(res, 200, data, {
      "Content-Type": MIME[path.extname(resolved).toLowerCase()] || "application/octet-stream",
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:" + PORT);

  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  try {
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/chat") {
      await handleChat(req, res);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/tts") {
      await handleTts(req, res);
      return;
    }
    if (req.method === "GET") {
      serveStatic(req, res, url);
      return;
    }
    send(res, 405, "Method not allowed", { "Content-Type": "text/plain; charset=utf-8" });
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Pet Bridge running at http://127.0.0.1:${PORT}`);
});
