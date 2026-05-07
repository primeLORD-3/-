(function () {
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

  const DEFAULT_PROMPTS = {
    persona:
      "你是用户桌面上的桌宠希尔薇。你说话短、轻柔、自然，有陪伴感，像一个小心但愿意靠近的伙伴。不要解释自己是模型，不要写长段落。",
    assistant:
      "当前你处于桌宠控制器中。每次回复都要选择一个最合适的动作状态，并用一句适合气泡显示的话回应。",
    tts:
      "用轻快、清晰、亲近的语气朗读。中文自然，不要播报 JSON、状态名或标点说明。",
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeStates(rawStates) {
    const next = {};
    Object.entries(rawStates || {}).forEach(([name, state]) => {
      const frameCount = Number(state.frames || state.frameCount || (state.durations || []).length || 1);
      const durations = Array.isArray(state.durations)
        ? state.durations.map((value) => Number(value) || 140)
        : Array.from({ length: frameCount }, () => Number(state.duration || 140));
      next[name] = {
        row: Number(state.row || 0),
        colStart: Number(state.colStart || state.column || 0),
        durations,
        label: state.label || name,
        icon: state.icon || (state.label || name).slice(0, 1).toUpperCase(),
        transient: Boolean(state.transient),
      };
    });
    return next;
  }

  function getActionOrder(states) {
    const known = DEFAULT_ACTION_ORDER.filter((name) => states[name]);
    const extra = Object.keys(states).filter((name) => !known.includes(name));
    return [...known, ...extra];
  }

  function localCommand(raw, states) {
    const value = String(raw || "").trim().toLowerCase();
    for (const [terms, state, speech] of COMMANDS) {
      if (states[state] && terms.some((term) => value.includes(term.toLowerCase()))) {
        return { reply: speech, state };
      }
    }
    return { reply: "我听到了，先判断一下。", state: states.review ? "review" : "idle" };
  }

  function parseAssistantPayload(text, states) {
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
        // Use plain text fallback below.
      }
    }
    return { reply: trimmed || "嗯。", state: "" };
  }

  window.PetBridgeCore = {
    CODEX_HATCH_PROTOCOL,
    DEFAULT_PET,
    DEFAULT_LINES,
    DEFAULT_PROMPTS,
    clone,
    getActionOrder,
    localCommand,
    normalizeStates,
    parseAssistantPayload,
  };
})();
