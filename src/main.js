const { app, BrowserWindow, screen, Menu, Tray, ipcMain, nativeImage } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");

const { BehaviorEngine } = require("./behavior.js");
const TRAY_ICON_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABN0lEQVR42u1UPWvDMBB9KlnitaR0NdRTMsTQyf/ATSBzJs8l/jshc6bMhX4snjt1yBCDwQGvodC1HdWl8qDYknVKwQa/Ubq79+6ddECPHl1HEIU8iEJOzR/YEAOAN52IIw4A79s3Jsfy75wDAHM8Zi2gghhVQoQYQX4RB4Io5DKxDOmeX2QEdV03AXM8pQsD067XDzda0tXr55kIsoC/R2XkQL4/AABGaaaNvdIFLO5dPkozJLFfFtYhiX0ksV/mK0ekIweA3WZJ3hPLxx0A4OmjYCQHqgqKoiZ35BH8N4wXkWoclFF1zwH5cdk6QBZg8zMaj+D49fNS162JS6KOkYCxe/tsI0ImF/UaLyI54e56ODN1QO48LU5z8i9Q2WgTr1zFdbZRUNV9K/YAaxJk40Rd5z16tAa/5kZ7j/ONvbEAAAAASUVORK5CYII=";

const SIZES = {
  S: { width: 200, height: 200 },
  M: { width: 280, height: 280 },
  L: { width: 360, height: 360 },
};

const i18n = {
  en: {
    size: "Size",
    small: "Small (S)",
    medium: "Medium (M)",
    large: "Large (L)",
    miniMode: "Mini Mode",
    exitMiniMode: "Exit Mini Mode",
    sleep: "Sleep (Do Not Disturb)",
    wake: "Wake Clawd",
    startOnLogin: "Start on Login",
    language: "Language",
    quit: "Quit",
  },
  zh: {
    size: "大小",
    small: "小 (S)",
    medium: "中 (M)",
    large: "大 (L)",
    miniMode: "极简模式",
    exitMiniMode: "退出极简模式",
    sleep: "休眠（免打扰）",
    wake: "唤醒 Clawd",
    startOnLogin: "开机自启",
    language: "语言",
    quit: "退出",
  },
};
let lang = "en";
function t(key) { return (i18n[lang] || i18n.en)[key] || key; }

const PREFS_PATH = path.join(app.getPath("userData"), "clawd-prefs.json");

function loadPrefs() {
  try {
    const raw = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8"));
    if (!raw || typeof raw !== "object") return null;
    for (const key of ["x", "y", "preMiniX", "preMiniY"]) {
      if (key in raw && (typeof raw[key] !== "number" || !isFinite(raw[key]))) {
        raw[key] = 0;
      }
    }
    return raw;
  } catch {
    return null;
  }
}

function savePrefs() {
  if (!win || win.isDestroyed()) return;
  const { x, y } = win.getBounds();
  const data = {
    x, y, size: currentSize,
    miniMode, preMiniX, preMiniY, lang,
  };
  try { fs.writeFileSync(PREFS_PATH, JSON.stringify(data)); } catch {}
}

const SVG_IDLE_FOLLOW = "clawd-idle-follow.svg";
const SVG_IDLE_LOOK = "clawd-idle-look.svg";
const ALWAYS_INTERACTIVE = true;
const PET_TOPMOST_LEVEL = "screen-saver";
const CROSS_DISPLAY_BOTTOM_TOLERANCE = 120;

const STATE_SVGS = {
  idle: [SVG_IDLE_FOLLOW],
  yawning: ["clawd-idle-yawn.svg"],
  dozing: ["clawd-idle-doze.svg"],
  collapsing: ["clawd-collapse-sleep.svg"],
  thinking: ["clawd-working-thinking.svg"],
  working: ["clawd-working-typing.svg"],
  juggling: ["clawd-working-juggling.svg"],
  sweeping: ["clawd-working-sweeping.svg"],
  error: ["clawd-error.svg"],
  attention: ["clawd-happy.svg"],
  notification: ["clawd-notification.svg"],
  carrying: ["clawd-working-carrying.svg"],
  sleeping: ["clawd-sleeping.svg"],
  waking: ["clawd-wake.svg"],
  living: ["clawd-idle-living.svg"],
  sitting: ["clawd-sitting.svg"],
  coffee: ["clawd-coffee.svg"],
  writing: ["clawd-writing.svg"],
  snacking: ["clawd-snacking.svg"],
  dressing: ["clawd-dressing.svg"],
  ball: ["clawd-ball-play.svg"],
  vacation: ["clawd-vacation.svg"],
  walking: ["clawd-walk.svg"],
  running: ["clawd-run.svg"],
  startle: ["clawd-startle.svg"],
  reading: ["clawd-reading.svg"],
  coding: ["clawd-coding.svg"],
  sunbathing: ["clawd-sunbathing.svg"],
  bathing: ["clawd-bathing.svg"],
  bubbles: ["clawd-bubbles.svg"],
  "idle-nod": ["clawd-idle-nod.svg"],
  tea: ["clawd-tea.svg"],
  painting: ["clawd-painting.svg"],
  gardening: ["clawd-gardening.svg"],
  fishing: ["clawd-fishing.svg"],
  knitting: ["clawd-knitting.svg"],
  music: ["clawd-music.svg"],
  meditating: ["clawd-meditating.svg"],
  stargazing: ["clawd-stargazing.svg"],
  skateboard: ["clawd-skateboard.svg"],
  dancing: ["clawd-dancing.svg"],
  "jumping-rope": ["clawd-jumping-rope.svg"],
  cooking: ["clawd-cooking.svg"],
  "sweeping-floor": ["clawd-sweeping-floor.svg"],
  exercising: ["clawd-exercising.svg"],
  yoga: ["clawd-yoga.svg"],
  "wearing-scarf": ["clawd-wearing-scarf.svg"],
  "wearing-glasses": ["clawd-wearing-glasses.svg"],
  umbrella: ["clawd-umbrella.svg"],
  cape: ["clawd-cape.svg"],
  crown: ["clawd-crown.svg"],
  dizzy: ["clawd-react-dizzy.svg"],
  sneeze: ["clawd-react-sneeze.svg"],
  hiccup: ["clawd-react-hiccup.svg"],
  "edge-peek-left": ["clawd-peek-left.svg"],
  "edge-peek-right": ["clawd-peek-right.svg"],
};

STATE_SVGS["mini-idle"]  = ["clawd-mini-idle.svg"];
STATE_SVGS["mini-alert"] = ["clawd-mini-alert.svg"];
STATE_SVGS["mini-happy"] = ["clawd-mini-happy.svg"];
STATE_SVGS["mini-enter"] = ["clawd-mini-enter.svg"];
STATE_SVGS["mini-peek"]  = ["clawd-mini-peek.svg"];
STATE_SVGS["mini-crabwalk"] = ["clawd-mini-crabwalk.svg"];
STATE_SVGS["mini-enter-sleep"] = ["clawd-mini-enter-sleep.svg"];
STATE_SVGS["mini-sleep"] = ["clawd-mini-sleep.svg"];

const MIN_DISPLAY_MS = {
  attention: 4000,
  error: 5000,
  sweeping: 2000,
  notification: 4000,
  carrying: 3000,
  dizzy: 2600,
  sneeze: 2200,
  hiccup: 2100,
  working: 1000,
  thinking: 1000,
  "mini-alert": 4000,
  "mini-happy": 4000,
};

const AUTO_RETURN_MS = {
  attention: 4000,
  error: 5000,
  sweeping: 300000,  // 5min safety; PostCompact ends sweeping normally
  notification: 4000,  // matches SVG animation loop (4s)
  carrying: 3000,
  dizzy: 2600,
  sneeze: 2200,
  hiccup: 2100,
  "mini-alert": 4000,
  "mini-happy": 4000,
};

const MOUSE_IDLE_TIMEOUT = 20000;   // 20s → idle-look
const MOUSE_SLEEP_TIMEOUT = 60000;  // 60s → yawning → dozing
const DEEP_SLEEP_TIMEOUT = 600000;  // 10min → collapsing → sleeping
const YAWN_DURATION = 3000;
const COLLAPSE_DURATION = 800;
const WAKE_DURATION = 1500;
const IDLE_LOOK_DURATION = 10000;  // idle-look CSS loop is 10s
const SLEEP_SEQUENCE = new Set(["yawning", "dozing", "collapsing", "sleeping", "waking"]);
const BEHAVIOR_STATES = new Set([
  "idle", "living", "sitting", "coffee", "writing",
  "snacking", "dressing", "ball", "vacation",
  "walking", "running", "startle", "dozing", "attention",
  "reading", "coding", "sunbathing", "bathing",
  "bubbles", "idle-nod", "tea", "painting", "gardening",
  "fishing", "knitting", "music", "meditating", "stargazing",
  "skateboard", "dancing", "jumping-rope", "cooking",
  "sweeping-floor", "exercising", "yoga", "wearing-scarf",
  "wearing-glasses", "umbrella", "cape", "crown",
  "edge-peek-left", "edge-peek-right",
]);
const EYE_TRACK_STATES = new Set([
  "idle", "living", "sitting", "coffee", "writing",
  "snacking", "dressing", "vacation",
  "walking", "running", "bathing", "bubbles",
  "tea", "painting", "gardening", "fishing", "knitting",
  "music", "meditating", "stargazing", "yoga",
  "wearing-scarf", "wearing-glasses", "umbrella", "cape", "crown",
  "edge-peek-left", "edge-peek-right",
]);

const sessions = new Map(); // source/session id → { state, updatedAt }
const SESSION_STALE_MS = 300000; // 5 min cleanup
const KEYBOARD_ACTIVITY_SESSION_ID = "__linux_keyboard__";
const KEYBOARD_IDLE_MS = 5000;
const DESKTOP_NOTIFICATION_THROTTLE_MS = 1000;
const STATE_PRIORITY = {
  error: 8, notification: 7, sweeping: 6, attention: 5,
  dizzy: 5, sneeze: 5, hiccup: 5,
  carrying: 4, juggling: 4, working: 3, thinking: 2, coding: 1.5, idle: 1, sleeping: 0,
};

const OBJ_SCALE_W = 1.9;   // width: 190%
const OBJ_SCALE_H = 1.3;   // height: 130%
const OBJ_OFF_X   = -0.45; // left: -45%
const OBJ_OFF_Y   = -0.25; // top: -25%
const HITBOX_SCREEN_PAD = 10;

function getObjRect(bounds) {
  return {
    x: bounds.x + bounds.width * OBJ_OFF_X,
    y: bounds.y + bounds.height * OBJ_OFF_Y,
    w: bounds.width * OBJ_SCALE_W,
    h: bounds.height * OBJ_SCALE_H,
  };
}

const INTERACTION_BOXES = {
  default:    { x: -2, y: 4, w: 19, h: 13 },
  compact:    { x: -1, y: 5, w: 17, h: 11 },
  reclined:   { x: -2, y: 6, w: 21, h: 10 },
  sleeping:   { x: -3, y: 8, w: 21, h: 9 },
  coding:     { x: -2, y: 4, w: 23, h: 13 },
  bathing:    { x: -3, y: 4, w: 23, h: 12 },
  peekLeft:   { x: -14, y: 4, w: 16, h: 11 },
  peekRight:  { x: 12, y: 4, w: 16, h: 11 },
  sweeping:   { x: -3, y: 3, w: 22, h: 14 },
  carrying:   { x: -2, y: -2, w: 19, h: 19 },
  workWide:   { x: -4, y: 3, w: 24, h: 15 },
  reaction:   { x: -3, y: 3, w: 21, h: 15 },
};

const SVG_INTERACTION_BOUNDS = {
  "clawd-idle-follow.svg": INTERACTION_BOXES.default,
  "clawd-idle-look.svg": INTERACTION_BOXES.default,
  "clawd-idle-yawn.svg": INTERACTION_BOXES.default,
  "clawd-idle-living.svg": INTERACTION_BOXES.default,
  "clawd-idle-doze.svg": INTERACTION_BOXES.compact,
  "clawd-sitting.svg": INTERACTION_BOXES.compact,
  "clawd-coffee.svg": INTERACTION_BOXES.default,
  "clawd-writing.svg": INTERACTION_BOXES.coding,
  "clawd-snacking.svg": INTERACTION_BOXES.default,
  "clawd-dressing.svg": INTERACTION_BOXES.default,
  "clawd-ball-play.svg": INTERACTION_BOXES.workWide,
  "clawd-vacation.svg": INTERACTION_BOXES.reclined,
  "clawd-reading.svg": INTERACTION_BOXES.default,
  "clawd-coding.svg": INTERACTION_BOXES.coding,
  "clawd-sunbathing.svg": INTERACTION_BOXES.reclined,
  "clawd-bathing.svg": INTERACTION_BOXES.bathing,
  "clawd-bubbles.svg": INTERACTION_BOXES.default,
  "clawd-idle-nod.svg": INTERACTION_BOXES.compact,
  "clawd-tea.svg": INTERACTION_BOXES.default,
  "clawd-painting.svg": INTERACTION_BOXES.workWide,
  "clawd-gardening.svg": INTERACTION_BOXES.default,
  "clawd-fishing.svg": INTERACTION_BOXES.workWide,
  "clawd-knitting.svg": INTERACTION_BOXES.default,
  "clawd-music.svg": INTERACTION_BOXES.workWide,
  "clawd-meditating.svg": INTERACTION_BOXES.compact,
  "clawd-stargazing.svg": INTERACTION_BOXES.workWide,
  "clawd-skateboard.svg": INTERACTION_BOXES.workWide,
  "clawd-dancing.svg": INTERACTION_BOXES.reaction,
  "clawd-jumping-rope.svg": INTERACTION_BOXES.reaction,
  "clawd-cooking.svg": INTERACTION_BOXES.workWide,
  "clawd-sweeping-floor.svg": INTERACTION_BOXES.sweeping,
  "clawd-exercising.svg": INTERACTION_BOXES.reaction,
  "clawd-yoga.svg": INTERACTION_BOXES.compact,
  "clawd-wearing-scarf.svg": INTERACTION_BOXES.default,
  "clawd-wearing-glasses.svg": INTERACTION_BOXES.default,
  "clawd-umbrella.svg": INTERACTION_BOXES.carrying,
  "clawd-cape.svg": INTERACTION_BOXES.default,
  "clawd-crown.svg": INTERACTION_BOXES.default,
  "clawd-peek-left.svg": INTERACTION_BOXES.peekLeft,
  "clawd-peek-right.svg": INTERACTION_BOXES.peekRight,
  "clawd-sleeping.svg": INTERACTION_BOXES.sleeping,
  "clawd-collapse-sleep.svg": INTERACTION_BOXES.sleeping,
  "clawd-wake.svg": INTERACTION_BOXES.reclined,
  "clawd-walk.svg": INTERACTION_BOXES.default,
  "clawd-run.svg": INTERACTION_BOXES.default,
  "clawd-startle.svg": INTERACTION_BOXES.reaction,
  "clawd-happy.svg": INTERACTION_BOXES.reaction,
  "clawd-react-left.svg": INTERACTION_BOXES.reaction,
  "clawd-react-right.svg": INTERACTION_BOXES.reaction,
  "clawd-react-double.svg": INTERACTION_BOXES.reaction,
  "clawd-react-blush.svg": INTERACTION_BOXES.reaction,
  "clawd-react-bounce.svg": INTERACTION_BOXES.reaction,
  "clawd-react-hearts.svg": INTERACTION_BOXES.reaction,
  "clawd-react-sparkle.svg": INTERACTION_BOXES.reaction,
  "clawd-react-shy.svg": INTERACTION_BOXES.reaction,
  "clawd-react-surprise.svg": INTERACTION_BOXES.reaction,
  "clawd-react-dizzy.svg": INTERACTION_BOXES.reaction,
  "clawd-react-sneeze.svg": INTERACTION_BOXES.reaction,
  "clawd-react-hiccup.svg": INTERACTION_BOXES.reaction,
  "clawd-react-wiggle.svg": INTERACTION_BOXES.reaction,
  "clawd-react-wave.svg": INTERACTION_BOXES.reaction,
  "clawd-react-spin.svg": INTERACTION_BOXES.reaction,
  "clawd-react-thought.svg": INTERACTION_BOXES.reaction,
  "clawd-react-drag.svg": INTERACTION_BOXES.reaction,
  "clawd-drag-uncomfortable.svg": INTERACTION_BOXES.reaction,
  "clawd-working-thinking.svg": INTERACTION_BOXES.coding,
  "clawd-working-typing.svg": INTERACTION_BOXES.coding,
  "clawd-working-debugger.svg": INTERACTION_BOXES.coding,
  "clawd-working-confused.svg": INTERACTION_BOXES.coding,
  "clawd-working-overheated.svg": INTERACTION_BOXES.coding,
  "clawd-working-building.svg": INTERACTION_BOXES.workWide,
  "clawd-working-juggling.svg": INTERACTION_BOXES.workWide,
  "clawd-working-conducting.svg": INTERACTION_BOXES.workWide,
  "clawd-working-wizard.svg": INTERACTION_BOXES.workWide,
  "clawd-working-pushing.svg": INTERACTION_BOXES.workWide,
  "clawd-working-carrying.svg": INTERACTION_BOXES.carrying,
  "clawd-working-sweeping.svg": INTERACTION_BOXES.sweeping,
  "clawd-notification.svg": INTERACTION_BOXES.default,
  "clawd-error.svg": INTERACTION_BOXES.default,
  "clawd-mini-idle.svg": INTERACTION_BOXES.compact,
  "clawd-mini-peek.svg": INTERACTION_BOXES.compact,
  "clawd-mini-alert.svg": INTERACTION_BOXES.compact,
  "clawd-mini-happy.svg": INTERACTION_BOXES.compact,
  "clawd-mini-enter.svg": INTERACTION_BOXES.compact,
  "clawd-mini-enter-sleep.svg": INTERACTION_BOXES.compact,
  "clawd-mini-crabwalk.svg": INTERACTION_BOXES.compact,
  "clawd-mini-sleep.svg": INTERACTION_BOXES.compact,
};

function getInteractionBox(svg) {
  return SVG_INTERACTION_BOUNDS[svg] || INTERACTION_BOXES.default;
}

let currentHitBox = getInteractionBox(SVG_IDLE_FOLLOW);

let win;
let tray = null;
let contextMenuOwner = null;
let ipcHandlersRegistered = false;
let screenHandlersRegistered = false;
let currentSize = "S";
let contextMenu;
let doNotDisturb = false;
let isQuitting = false;

function sendToRenderer(channel, ...args) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, ...args);
}

let currentState = "idle";
let currentSvg = null;
let stateChangedAt = Date.now();
let pendingTimer = null;
let autoReturnTimer = null;
let mainTickTimer = null;
let mouseOverPet = false;
let dragLocked = false;
let menuOpen = false;
let idlePaused = false;
let idleWasActive = false;
let lastEyeDx = 0, lastEyeDy = 0;
let forceEyeResend = false;

const MINI_OFFSET_RATIO = 0.486;
const PEEK_OFFSET = 25;
const SNAP_TOLERANCE = 30;
const JUMP_PEAK_HEIGHT = 40;
const JUMP_DURATION = 350;
const CRABWALK_SPEED = 0.12;  // px/ms

let miniMode = false;
let miniTransitioning = false;
let miniSleepPeeked = false;
let preMiniX = 0, preMiniY = 0;
let currentMiniX = 0;
let miniSnap = null;  // { y, width, height } — canonical rect to prevent DPI drift
let miniTransitionTimer = null;
let peekAnimTimer = null;
let isAnimating = false;

let lastCursorX = null, lastCursorY = null;
let mouseStillSince = Date.now();
let isMouseIdle = false;       // showing idle-look
let hasTriggeredYawn = false;  // 60s threshold already fired
let idleLookPlayed = false;    // idle-look already played once since last movement
let idleLookReturnTimer = null;
let yawnDelayTimer = null;     // tracked setTimeout for yawn/idle-look transitions

let wakePollTimer = null;
let lastWakeCursorX = null, lastWakeCursorY = null;

let pendingState = null; // tracks what state is waiting in pendingTimer

let behaviorEngine = null;
let desktopNotificationMonitor = null;
let desktopNotificationBuffer = "";
let lastDesktopNotificationAt = 0;
let keyboardActivityMonitor = null;
let keyboardActivityBuffer = "";
let keyboardIdleTimer = null;

function setState(newState, svgOverride) {
  if (doNotDisturb) return;

  if (newState === "yawning" && SLEEP_SEQUENCE.has(currentState)) return;

  if (pendingTimer) {
    if (pendingState && (STATE_PRIORITY[newState] || 0) < (STATE_PRIORITY[pendingState] || 0)) {
      return;
    }
    clearTimeout(pendingTimer);
    pendingTimer = null;
    pendingState = null;
  }

  const sameState = newState === currentState;
  const sameSvg = !svgOverride || svgOverride === currentSvg;
  if (sameState && sameSvg) {
    return;
  }

  const minTime = MIN_DISPLAY_MS[currentState] || 0;
  const elapsed = Date.now() - stateChangedAt;
  const remaining = minTime - elapsed;

  if (remaining > 0) {
    if (autoReturnTimer) { clearTimeout(autoReturnTimer); autoReturnTimer = null; }
    pendingState = newState;
    const pendingSvgOverride = svgOverride;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      const queued = pendingState;
      const queuedSvg = pendingSvgOverride;
      pendingState = null;
      if (ONESHOT_STATES.has(queued)) {
        applyState(queued, queuedSvg);
      } else {
        const resolved = resolveDisplayState();
        applyState(resolved, getSvgOverride(resolved));
      }
    }, remaining);
  } else {
    applyState(newState, svgOverride);
  }
}

function applyState(state, svgOverride) {
  if (miniTransitioning && !state.startsWith("mini-")) {
    return;
  }

  if (miniMode && !state.startsWith("mini-")) {
    if (state === "notification") return applyState("mini-alert");
    if (state === "attention") return applyState("mini-happy");
    if (AUTO_RETURN_MS[currentState] && !autoReturnTimer) {
      return applyState(mouseOverPet ? "mini-peek" : "mini-idle");
    }
    return;
  }

  currentState = state;
  stateChangedAt = Date.now();
  idlePaused = false;

  const svgs = STATE_SVGS[state] || STATE_SVGS.idle;
  const svg = svgOverride || svgs[Math.floor(Math.random() * svgs.length)];
  currentSvg = svg;

  currentHitBox = getInteractionBox(svg);

  sendToRenderer("state-change", state, svg);

  if (state !== "idle" && state !== "mini-idle") {
    sendToRenderer("eye-move", 0, 0);
  }

  if ((state === "dozing" || state === "collapsing" || state === "sleeping") && !doNotDisturb) {
    setTimeout(() => {
      if (currentState === state) startWakePoll();
    }, 500);
  } else {
    stopWakePoll();
  }

  if (autoReturnTimer) clearTimeout(autoReturnTimer);
  if (state === "yawning") {
    autoReturnTimer = setTimeout(() => {
      autoReturnTimer = null;
      applyState(doNotDisturb ? "collapsing" : "dozing");
    }, YAWN_DURATION);
  } else if (state === "waking") {
    autoReturnTimer = setTimeout(() => {
      autoReturnTimer = null;
      const resolved = resolveDisplayState();
      applyState(resolved, getSvgOverride(resolved));
    }, WAKE_DURATION);
  } else if (AUTO_RETURN_MS[state]) {
    autoReturnTimer = setTimeout(() => {
      autoReturnTimer = null;
      if (miniMode) {
        if (mouseOverPet && !doNotDisturb) {
          miniPeekIn();
          applyState("mini-peek");
        } else {
          applyState(doNotDisturb ? "mini-sleep" : "mini-idle");
        }
      } else {
        const resolved = resolveDisplayState();
        applyState(resolved, getSvgOverride(resolved));
      }
    }, AUTO_RETURN_MS[state]);
  }
}

function getHitRectScreen(bounds) {
  const obj = getObjRect(bounds);

  const scale = Math.min(obj.w, obj.h) / 45;
  const offsetX = obj.x + (obj.w - 45 * scale) / 2;
  const offsetY = obj.y + (obj.h - 45 * scale) / 2;

  const hb = currentHitBox;
  return {
    left:   offsetX + (hb.x + 15) * scale - HITBOX_SCREEN_PAD,
    top:    offsetY + (hb.y + 25) * scale - HITBOX_SCREEN_PAD,
    right:  offsetX + (hb.x + 15 + hb.w) * scale + HITBOX_SCREEN_PAD,
    bottom: offsetY + (hb.y + 25 + hb.h) * scale + HITBOX_SCREEN_PAD,
  };
}

function setClickThrough(over) {
  if (ALWAYS_INTERACTIVE || over) {
    win.setIgnoreMouseEvents(false);
  } else {
    win.setIgnoreMouseEvents(true, { forward: true });
  }
}

function startMainTick() {
  if (mainTickTimer) return;
  setClickThrough(false);
  mouseOverPet = false;

  mainTickTimer = setInterval(() => {
    if (!win || win.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();

    const bounds = win.getBounds();
    if (!dragLocked) {
      const hit = getHitRectScreen(bounds);
      const over = cursor.x >= hit.left && cursor.x <= hit.right
                && cursor.y >= hit.top  && cursor.y <= hit.bottom;
      if (over !== mouseOverPet) {
        mouseOverPet = over;
        setClickThrough(over);
        sendToRenderer("hover-change", over);
      }
    }

    if (miniMode && !miniTransitioning && !dragLocked && !menuOpen) {
      const canPeek = currentState === "mini-idle" || currentState === "mini-peek"
        || currentState === "mini-sleep";
      if (!isAnimating && canPeek) {
        if (mouseOverPet && currentState === "mini-sleep" && !miniSleepPeeked) {
          miniPeekIn();
          miniSleepPeeked = true;
        } else if (!mouseOverPet && currentState === "mini-sleep" && miniSleepPeeked) {
          miniPeekOut();
          miniSleepPeeked = false;
        } else if (mouseOverPet && currentState !== "mini-peek" && currentState !== "mini-sleep") {
          miniPeekIn();
          applyState("mini-peek");
        } else if (!mouseOverPet && currentState === "mini-peek") {
          miniPeekOut();
          applyState("mini-idle");
        }
      }
    }

    if (behaviorEngine) behaviorEngine.tick(cursor);

    const behaviorStates = BEHAVIOR_STATES;
    const idleNow = behaviorStates.has(currentState) && !idlePaused;
    const miniIdleNow = currentState === "mini-idle" && !idlePaused && !miniTransitioning;

    if (idleNow && !idleWasActive) {
      isMouseIdle = false;
      hasTriggeredYawn = false;
      idleLookPlayed = false;
      lastCursorX = null;
      lastCursorY = null;
      mouseStillSince = Date.now();
      lastEyeDx = 0;
      lastEyeDy = 0;
      if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
      if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
      if (behaviorEngine && sessions.size === 0 && !doNotDisturb && !miniMode) {
        behaviorEngine.start();
      }
    }

    if (!idleNow && idleWasActive) {
      if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
      if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
      if (behaviorEngine && !behaviorStates.has(currentState)) {
        behaviorEngine.stop();
      }
    }
    idleWasActive = idleNow;

    if (!idleNow && !miniIdleNow) return;

    const moved = lastCursorX !== null && (cursor.x !== lastCursorX || cursor.y !== lastCursorY);
    lastCursorX = cursor.x;
    lastCursorY = cursor.y;

    const engineActive = behaviorEngine && behaviorEngine._running;
    if (idleNow) {
      if (!engineActive) {
        if (moved) {
          mouseStillSince = Date.now();
          hasTriggeredYawn = false;
          idleLookPlayed = false;
          if (idleLookReturnTimer) { clearTimeout(idleLookReturnTimer); idleLookReturnTimer = null; }
          if (yawnDelayTimer) { clearTimeout(yawnDelayTimer); yawnDelayTimer = null; }
          if (isMouseIdle) {
            isMouseIdle = false;
            sendToRenderer("state-change", "idle", SVG_IDLE_FOLLOW);
          }
        }

        const elapsed = Date.now() - mouseStillSince;

        if (!hasTriggeredYawn && elapsed >= MOUSE_SLEEP_TIMEOUT) {
          hasTriggeredYawn = true;
          if (!isMouseIdle) sendToRenderer("eye-move", 0, 0);
          yawnDelayTimer = setTimeout(() => {
            yawnDelayTimer = null;
            if (currentState === "idle") setState("yawning");
          }, isMouseIdle ? 50 : 250);
          return;
        }

        if (!isMouseIdle && !hasTriggeredYawn && !idleLookPlayed && elapsed >= MOUSE_IDLE_TIMEOUT) {
          isMouseIdle = true;
          idleLookPlayed = true;
          sendToRenderer("eye-move", 0, 0);
          setTimeout(() => {
            if (isMouseIdle && currentState === "idle") {
              sendToRenderer("state-change", "idle", SVG_IDLE_LOOK);
            }
          }, 250);
          idleLookReturnTimer = setTimeout(() => {
            idleLookReturnTimer = null;
            if (isMouseIdle && currentState === "idle") {
              isMouseIdle = false;
              sendToRenderer("state-change", "idle", SVG_IDLE_FOLLOW);
              setTimeout(() => { forceEyeResend = true; }, 200);
            }
          }, 250 + IDLE_LOOK_DURATION);
          return;
        }
      }

      const eyeTrackStates = EYE_TRACK_STATES;
      if (!eyeTrackStates.has(currentState) && !engineActive) {
        if (isMouseIdle || (!moved && !forceEyeResend)) return;
      }
      if (!moved && !forceEyeResend) return;
    } else {
      if (!moved && !forceEyeResend) return;
    }

    const skipDedup = forceEyeResend;
    forceEyeResend = false;

    const obj = getObjRect(bounds);
    const eyeScreenX = obj.x + obj.w * (22 / 45);
    const eyeScreenY = obj.y + obj.h * (34 / 45);

    const relX = cursor.x - eyeScreenX;
    const relY = cursor.y - eyeScreenY;

    const MAX_OFFSET = 3;
    const dist = Math.sqrt(relX * relX + relY * relY);
    let eyeDx = 0, eyeDy = 0;
    if (dist > 1) {
      const scale = Math.min(1, dist / 300);
      eyeDx = (relX / dist) * MAX_OFFSET * scale;
      eyeDy = (relY / dist) * MAX_OFFSET * scale;
    }

    eyeDx = Math.round(eyeDx * 2) / 2;
    eyeDy = Math.round(eyeDy * 2) / 2;
    eyeDy = Math.max(-1.5, Math.min(1.5, eyeDy));

    if (skipDedup || eyeDx !== lastEyeDx || eyeDy !== lastEyeDy) {
      lastEyeDx = eyeDx;
      lastEyeDy = eyeDy;
      sendToRenderer("eye-move", eyeDx, eyeDy);
    }
  }, 50); // ~20fps — hit-test needs faster response than 67ms eye tracking
}

function startWakePoll() {
  if (wakePollTimer) return;
  const cursor = screen.getCursorScreenPoint();
  lastWakeCursorX = cursor.x;
  lastWakeCursorY = cursor.y;

  wakePollTimer = setInterval(() => {
    const cursor = screen.getCursorScreenPoint();
    const moved = cursor.x !== lastWakeCursorX || cursor.y !== lastWakeCursorY;

    if (moved) {
      stopWakePoll();
      wakeFromDoze();
      return;
    }

    if (currentState === "dozing" && Date.now() - mouseStillSince >= DEEP_SLEEP_TIMEOUT) {
      stopWakePoll();
      applyState("collapsing");
    }
  }, 200); // 5 checks/sec, lightweight
}

function stopWakePoll() {
  if (wakePollTimer) { clearInterval(wakePollTimer); wakePollTimer = null; }
}

function wakeFromDoze() {
  if (currentState === "sleeping" || currentState === "collapsing") {
    applyState("waking");
    return;
  }
  sendToRenderer("wake-from-doze");
  setTimeout(() => {
    if (currentState === "dozing") {
      applyState("idle");
    }
  }, 350);
}

const ONESHOT_STATES = new Set(["attention", "error", "sweeping", "notification", "carrying", "dizzy", "sneeze", "hiccup"]);

function updateSession(sessionId, state, event) {
  if (behaviorEngine && event !== "SessionEnd") behaviorEngine.stop();

  if (event === "SessionEnd") {
    sessions.delete(sessionId);
  } else if (state === "attention" || SLEEP_SEQUENCE.has(state)) {
    sessions.set(sessionId, { state: "idle", updatedAt: Date.now() });
  } else if (ONESHOT_STATES.has(state)) {
    const existing = sessions.get(sessionId);
    if (existing) {
      existing.updatedAt = Date.now();
    } else {
      sessions.set(sessionId, { state: "idle", updatedAt: Date.now() });
    }
  } else {
    const existing = sessions.get(sessionId);
    if (existing && existing.state === "juggling" && state === "working" && event !== "SubagentStop") {
      existing.updatedAt = Date.now();
    } else {
      sessions.set(sessionId, { state, updatedAt: Date.now() });
    }
  }
  cleanStaleSessions();

  if (sessions.size === 0 && event === "SessionEnd") {
    setState("sleeping");
    return;
  }

  if (ONESHOT_STATES.has(state)) {
    setState(state);
    return;
  }

  const displayState = resolveDisplayState();
  setState(displayState, getSvgOverride(displayState));
}

let staleCleanupTimer = null;

function cleanStaleSessions() {
  const now = Date.now();
  let changed = false;
  for (const [id, s] of sessions) {
    if (now - s.updatedAt > SESSION_STALE_MS) { sessions.delete(id); changed = true; }
  }
  if (changed && sessions.size === 0) {
    setState("yawning");
  } else if (changed) {
    const resolved = resolveDisplayState();
    setState(resolved, getSvgOverride(resolved));
  }
}

function startStaleCleanup() {
  if (staleCleanupTimer) return;
  staleCleanupTimer = setInterval(cleanStaleSessions, 60000); // every 60s
}

function stopStaleCleanup() {
  if (staleCleanupTimer) { clearInterval(staleCleanupTimer); staleCleanupTimer = null; }
}

function resolveDisplayState() {
  if (sessions.size === 0) return "idle";
  let best = "sleeping";
  for (const [, s] of sessions) {
    if ((STATE_PRIORITY[s.state] || 0) > (STATE_PRIORITY[best] || 0)) best = s.state;
  }
  return best;
}

function getActiveWorkingCount() {
  let n = 0;
  for (const [, s] of sessions) {
    if (s.state === "working" || s.state === "thinking" || s.state === "juggling") n++;
  }
  return n;
}

function getWorkingSvg() {
  const n = getActiveWorkingCount();
  if (n >= 3) return "clawd-working-building.svg";
  if (n >= 2) return "clawd-working-juggling.svg";
  return "clawd-working-typing.svg";
}

function getSvgOverride(state) {
  if (state === "working") return getWorkingSvg();
  if (state === "juggling") return getJugglingSvg();
  return null;
}

function getJugglingSvg() {
  let n = 0;
  for (const [, s] of sessions) {
    if (s.state === "juggling") n++;
  }
  return n >= 2 ? "clawd-working-conducting.svg" : "clawd-working-juggling.svg";
}

function triggerDesktopNotificationActivity() {
  const now = Date.now();
  if (now - lastDesktopNotificationAt < DESKTOP_NOTIFICATION_THROTTLE_MS) return;
  lastDesktopNotificationAt = now;
  setState("notification");
}

function handleDesktopNotificationOutput(chunk) {
  desktopNotificationBuffer += chunk.toString();
  const lines = desktopNotificationBuffer.split(/\r?\n/);
  desktopNotificationBuffer = lines.pop() || "";
  for (const line of lines) {
    if (line.includes("org.freedesktop.Notifications") && /\bNotify\b/.test(line)) {
      triggerDesktopNotificationActivity();
    }
  }
}

function clearKeyboardActivity() {
  if (keyboardIdleTimer) {
    clearTimeout(keyboardIdleTimer);
    keyboardIdleTimer = null;
  }
  if (!sessions.delete(KEYBOARD_ACTIVITY_SESSION_ID)) return;
  const displayState = resolveDisplayState();
  setState(displayState, getSvgOverride(displayState));
}

function noteKeyboardActivity() {
  updateSession(KEYBOARD_ACTIVITY_SESSION_ID, "coding", "KeyboardActivity");
  if (keyboardIdleTimer) clearTimeout(keyboardIdleTimer);
  keyboardIdleTimer = setTimeout(() => {
    keyboardIdleTimer = null;
    clearKeyboardActivity();
  }, KEYBOARD_IDLE_MS);
}

function handleKeyboardActivityOutput(chunk) {
  keyboardActivityBuffer += chunk.toString();
  const lines = keyboardActivityBuffer.split(/\r?\n/);
  keyboardActivityBuffer = lines.pop() || "";
  for (const line of lines) {
    if (/RawKeyPress/.test(line) || /EVENT type 13\b/.test(line)) {
      noteKeyboardActivity();
    }
  }
}

function startDesktopNotificationMonitor() {
  if (desktopNotificationMonitor || isQuitting) return;
  desktopNotificationBuffer = "";
  try {
    desktopNotificationMonitor = spawn(
      "dbus-monitor",
      ["--session", "interface='org.freedesktop.Notifications',member='Notify'"],
      { stdio: ["ignore", "pipe", "ignore"] }
    );
  } catch (error) {
    console.warn("Desktop notification monitor unavailable:", error.message);
    desktopNotificationMonitor = null;
    return;
  }

  desktopNotificationMonitor.stdout.on("data", handleDesktopNotificationOutput);
  desktopNotificationMonitor.on("error", (error) => {
    desktopNotificationMonitor = null;
    desktopNotificationBuffer = "";
    console.warn("Desktop notification monitor unavailable:", error.message);
  });
  desktopNotificationMonitor.on("exit", () => {
    desktopNotificationMonitor = null;
    desktopNotificationBuffer = "";
  });
}

function startKeyboardActivityMonitor() {
  if (keyboardActivityMonitor || isQuitting) return;
  if (process.env.XDG_SESSION_TYPE && process.env.XDG_SESSION_TYPE !== "x11") return;
  if (!process.env.DISPLAY) return;

  keyboardActivityBuffer = "";
  try {
    keyboardActivityMonitor = spawn("xinput", ["test-xi2", "--root"], {
      stdio: ["ignore", "pipe", "ignore"],
      env: process.env,
    });
  } catch (error) {
    console.warn("Keyboard activity monitor unavailable:", error.message);
    keyboardActivityMonitor = null;
    return;
  }

  keyboardActivityMonitor.stdout.on("data", handleKeyboardActivityOutput);
  keyboardActivityMonitor.on("error", (error) => {
    keyboardActivityMonitor = null;
    keyboardActivityBuffer = "";
    console.warn("Keyboard activity monitor unavailable:", error.message);
  });
  keyboardActivityMonitor.on("exit", () => {
    keyboardActivityMonitor = null;
    keyboardActivityBuffer = "";
    if (!isQuitting) clearKeyboardActivity();
  });
}

function startLinuxActivityMonitors() {
  startDesktopNotificationMonitor();
  startKeyboardActivityMonitor();
}

function stopLinuxActivityMonitors() {
  if (keyboardIdleTimer) {
    clearTimeout(keyboardIdleTimer);
    keyboardIdleTimer = null;
  }
  sessions.delete(KEYBOARD_ACTIVITY_SESSION_ID);
  desktopNotificationBuffer = "";
  keyboardActivityBuffer = "";

  const notificationMonitor = desktopNotificationMonitor;
  desktopNotificationMonitor = null;
  if (notificationMonitor) notificationMonitor.kill();

  const keyboardMonitor = keyboardActivityMonitor;
  keyboardActivityMonitor = null;
  if (keyboardMonitor) keyboardMonitor.kill();
}

function enableDoNotDisturb() {
  if (doNotDisturb) return;
  doNotDisturb = true;
  if (behaviorEngine) behaviorEngine.stop();
  sendToRenderer("dnd-change", true);
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; pendingState = null; }
  if (autoReturnTimer) { clearTimeout(autoReturnTimer); autoReturnTimer = null; }
  stopWakePoll();
  if (miniMode) {
    applyState("mini-sleep");
  } else {
    applyState("yawning");  // walk through yawning → collapsing → sleeping
  }
  buildContextMenu();
  buildTrayMenu();
}

function disableDoNotDisturb() {
  if (!doNotDisturb) return;
  doNotDisturb = false;
  sendToRenderer("dnd-change", false);
  if (miniMode) {
    if (miniSleepPeeked) { miniPeekOut(); miniSleepPeeked = false; }
    applyState("mini-idle");
  } else {
    applyState("waking");
  }
  buildContextMenu();
  buildTrayMenu();
}

let httpServer = null;

function startHttpServer() {
  httpServer = http.createServer((req, res) => {
    if (req.method === "POST" && req.url === "/state") {
      let body = "";
      let bodySize = 0;
      let destroyed = false;
      req.on("data", (chunk) => {
        bodySize += chunk.length;
        if (bodySize > 1024) { destroyed = true; req.destroy(); return; }
        body += chunk;
      });
      req.on("end", () => {
        if (destroyed) return;
        try {
          const data = JSON.parse(body);
          const { state, svg, session_id, event } = data;
          if (STATE_SVGS[state]) {
            const sid = session_id || "default";
            if (state.startsWith("mini-") && !svg) {
              res.writeHead(400);
              res.end("mini states require svg override");
              return;
            }
            if (svg) {
              const safeSvg = path.basename(svg);
              setState(state, safeSvg);
            } else {
              updateSession(sid, state, event);
            }
            res.writeHead(200);
            res.end("ok");
          } else {
            res.writeHead(400);
            res.end("unknown state");
          }
        } catch {
          res.writeHead(400);
          res.end("bad json");
        }
      });
    } else {
      res.writeHead(404);
      res.end();
    }
  });

  httpServer.listen(23333, "127.0.0.1", () => {
    console.log("Clawd state server listening on 127.0.0.1:23333");
  });

  httpServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn("Port 23333 is in use — running in idle-only mode (no state sync)");
    } else {
      console.error("HTTP server error:", err.message);
    }
  });
}

function createTray() {
  const icon = nativeImage.createFromDataURL(TRAY_ICON_DATA_URL).resize({ width: 32, height: 32 });
  if (tray) {
    tray.setImage(icon);
    tray.setToolTip("Clawd Desktop Pet");
    buildTrayMenu();
    return;
  }
  tray = new Tray(icon);
  tray.setToolTip("Clawd Desktop Pet");
  buildTrayMenu();
}

function buildTrayMenu() {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: doNotDisturb ? t("wake") : t("sleep"),
      click: () => doNotDisturb ? disableDoNotDisturb() : enableDoNotDisturb(),
    },
    { type: "separator" },
    {
      label: t("startOnLogin"),
      type: "checkbox",
      checked: app.getLoginItemSettings().openAtLogin,
      click: (menuItem) => {
        app.setLoginItemSettings({ openAtLogin: menuItem.checked });
      },
    },
    { type: "separator" },
    {
      label: t("language"),
      submenu: [
        { label: "English", type: "radio", checked: lang === "en", click: () => setLanguage("en") },
        { label: "中文", type: "radio", checked: lang === "zh", click: () => setLanguage("zh") },
      ],
    },
    { type: "separator" },
    { label: t("quit"), click: () => requestAppQuit() },
  ]);
  tray.setContextMenu(menu);
}

function requestAppQuit() {
  isQuitting = true;
  app.quit();
}

function ensureContextMenuOwner() {
  if (contextMenuOwner && !contextMenuOwner.isDestroyed()) return contextMenuOwner;
  if (!win || win.isDestroyed()) return null;

  contextMenuOwner = new BrowserWindow({
    parent: win,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: true,
    closable: false,
    minimizable: false,
    maximizable: false,
    hasShadow: false,
  });

  contextMenuOwner.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      contextMenuOwner.hide();
    }
  });

  contextMenuOwner.on("closed", () => {
    contextMenuOwner = null;
  });

  return contextMenuOwner;
}

function showPetContextMenu() {
  if (!win || win.isDestroyed()) return;
  if (menuOpen) return;

  buildContextMenu();
  const owner = ensureContextMenuOwner();
  if (!owner) return;

  const cursor = screen.getCursorScreenPoint();
  owner.setBounds({ x: cursor.x, y: cursor.y, width: 1, height: 1 });
  owner.show();
  owner.focus();

  menuOpen = true;
  contextMenu.popup({
    window: owner,
    callback: () => {
      menuOpen = false;
      if (owner && !owner.isDestroyed()) owner.hide();
      if (win && !win.isDestroyed()) {
        win.showInactive();
        win.moveTop();
      }
    },
  });
}

function createWindow() {
  if (win && !win.isDestroyed()) {
    win.showInactive();
    win.moveTop();
    return;
  }

  const prefs = loadPrefs();
  if (prefs && SIZES[prefs.size]) currentSize = prefs.size;
  if (prefs && i18n[prefs.lang]) lang = prefs.lang;
  const size = SIZES[currentSize];

  let startX, startY;
  if (prefs && prefs.miniMode) {
    preMiniX = prefs.preMiniX || 0;
    preMiniY = prefs.preMiniY || 0;
    const wa = getNearestWorkArea(prefs.x + size.width / 2, prefs.y + size.height / 2);
    currentMiniX = wa.x + wa.width - Math.round(size.width * (1 - MINI_OFFSET_RATIO));
    startX = currentMiniX;
    startY = Math.max(wa.y, Math.min(prefs.y, wa.y + wa.height - size.height));
    miniSnap = { y: startY, width: size.width, height: size.height };
    miniMode = true;
  } else if (prefs) {
    const clamped = clampToScreen(prefs.x, prefs.y, size.width, size.height);
    startX = clamped.x;
    startY = clamped.y;
  } else {
    const { workArea } = screen.getPrimaryDisplay();
    startX = workArea.x + workArea.width - size.width - 20;
    startY = workArea.y + workArea.height - size.height - 20;
  }

  win = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: startX,
    y: startY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.setAlwaysOnTop(true, PET_TOPMOST_LEVEL);
  if (typeof win.setVisibleOnAllWorkspaces === "function") {
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    } catch {}
  }
  win.setFocusable(false);
  win.loadFile(path.join(__dirname, "index.html"));
  win.showInactive();
  win.moveTop();

  win.on("closed", () => {
    if (behaviorEngine) behaviorEngine.stop();
    win = null;
  });

  buildContextMenu();
  createTray();
  ensureContextMenuOwner();

  if (!ipcHandlersRegistered) {
    ipcMain.on("show-context-menu", showPetContextMenu);

    ipcMain.on("move-window-by", (event, dx, dy) => {
      if (miniMode || miniTransitioning || !win || win.isDestroyed()) return;
      const { x, y } = win.getBounds();
      const size = SIZES[currentSize];
      const clamped = clampToScreen(x + dx, y + dy, size.width, size.height);
      win.setBounds({ ...clamped, width: size.width, height: size.height });
    });

    ipcMain.on("pause-cursor-polling", () => { idlePaused = true; });
    ipcMain.on("resume-from-reaction", () => {
      idlePaused = false;
      if (miniTransitioning) return;
      sendToRenderer("state-change", currentState, currentSvg);
    });

    ipcMain.on("drag-lock", (event, locked) => {
      dragLocked = !!locked;
      if (!win || win.isDestroyed()) return;
      if (locked) {
        if (!mouseOverPet) mouseOverPet = true;
        win.setIgnoreMouseEvents(false);
        win.setAlwaysOnTop(true, PET_TOPMOST_LEVEL);
        win.moveTop();
        if (behaviorEngine) behaviorEngine.pause();
      } else {
        mouseOverPet = false;
        setClickThrough(false);
        sendToRenderer("hover-change", false);
        win.setAlwaysOnTop(true, PET_TOPMOST_LEVEL);
        win.moveTop();
        if (behaviorEngine) behaviorEngine.resume();
      }
    });

    ipcMain.on("drag-end", () => {
      if (!miniMode && !miniTransitioning) {
        checkMiniModeSnap();
      }
    });

    ipcMain.on("exit-mini-mode", () => {
      if (miniMode) exitMiniMode();
    });

    ipcHandlersRegistered = true;
  }

  startMainTick();
  startHttpServer();
  startStaleCleanup();
  startLinuxActivityMonitors();

  behaviorEngine = new BehaviorEngine({
    applyState: (state, svgFile) => {
      applyState(state, svgFile);
    },
    getWindowBounds: () => win.getBounds(),
    setWindowPosition: (x, y) => {
      if (!win || win.isDestroyed()) return;
      const size = SIZES[currentSize];
      const clamped = clampToScreen(x, y, size.width, size.height);
      win.setBounds({ ...clamped, width: size.width, height: size.height });
    },
    getCursorPos: () => screen.getCursorScreenPoint(),
    getAllDisplays: () => screen.getAllDisplays(),
    sendDirection: (dir) => {
      sendToRenderer("direction-change", dir);
    },
    triggerSleep: () => {
      setState("yawning");
    },
  });
  win.webContents.on("did-finish-load", () => {
    if (miniMode) {
      sendToRenderer("mini-mode-change", true);
    }
    sendToRenderer("hover-change", mouseOverPet);
    if (doNotDisturb) {
      sendToRenderer("dnd-change", true);
      if (miniMode) {
        applyState("mini-sleep");
      } else {
        applyState("sleeping");
      }
    } else if (miniMode) {
      applyState("mini-idle");
    } else if (sessions.size > 0) {
      const resolved = resolveDisplayState();
      applyState(resolved, getSvgOverride(resolved));
    } else {
      applyState("idle");
    }
  });

  win.webContents.on("render-process-gone", (_event, details) => {
    console.error("Renderer crashed:", details.reason);
    dragLocked = false;
    idlePaused = false;
    mouseOverPet = false;
    setClickThrough(false);
    win.webContents.reload();
  });

  if (!screenHandlersRegistered) {
    screen.on("display-metrics-changed", () => {
      if (!win || win.isDestroyed()) return;
      if (miniMode) {
        const size = SIZES[currentSize];
        const snapY = miniSnap ? miniSnap.y : win.getBounds().y;
        const wa = getNearestWorkArea(currentMiniX + size.width / 2, snapY + size.height / 2);
        currentMiniX = wa.x + wa.width - Math.round(size.width * (1 - MINI_OFFSET_RATIO));
        const clampedY = Math.max(wa.y, Math.min(snapY, wa.y + wa.height - size.height));
        miniSnap = { y: clampedY, width: size.width, height: size.height };
        win.setBounds({ x: currentMiniX, y: clampedY, width: size.width, height: size.height });
        return;
      }
      const { x, y, width, height } = win.getBounds();
      const clamped = clampToScreen(x, y, width, height);
      if (clamped.x !== x || clamped.y !== y) {
        win.setBounds({ ...clamped, width, height });
      }
    });
    screen.on("display-removed", () => {
      if (!win || win.isDestroyed()) return;
      if (miniMode) {
        exitMiniMode();
        return;
      }
      const { x, y, width, height } = win.getBounds();
      const clamped = clampToScreen(x, y, width, height);
      win.setBounds({ ...clamped, width, height });
    });
    screenHandlersRegistered = true;
  }
}

function getNearestWorkArea(cx, cy) {
  const displays = screen.getAllDisplays();
  let nearest = displays[0].workArea;
  let minDist = Infinity;
  for (const d of displays) {
    const wa = d.workArea;
    const dx = Math.max(wa.x - cx, 0, cx - (wa.x + wa.width));
    const dy = Math.max(wa.y - cy, 0, cy - (wa.y + wa.height));
    const dist = dx * dx + dy * dy;
    if (dist < minDist) { minDist = dist; nearest = wa; }
  }
  return nearest;
}

function getRoamingWorkAreas(cx, cy) {
  const nearest = getNearestWorkArea(cx, cy);
  const nearestBottom = nearest.y + nearest.height;
  const workAreas = screen.getAllDisplays()
    .map((display) => display.workArea)
    .filter((wa) => Math.abs((wa.y + wa.height) - nearestBottom) <= CROSS_DISPLAY_BOTTOM_TOLERANCE)
    .sort((a, b) => a.x - b.x);
  return workAreas.length > 0 ? workAreas : [nearest];
}

function clampToScreen(x, y, w, h) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const nearest = getNearestWorkArea(cx, cy);
  const roaming = getRoamingWorkAreas(cx, cy);
  const mLeft  = Math.round(w * 0.25);
  const mRight = Math.round(w * 0.25);
  const mTop   = Math.round(h * 0.6);
  const mBot   = Math.round(h * 0.04);
  const minX = Math.min(...roaming.map((wa) => wa.x));
  const maxX = Math.max(...roaming.map((wa) => wa.x + wa.width)) - w;
  return {
    x: Math.max(minX - mLeft, Math.min(x, maxX + mRight)),
    y: Math.max(nearest.y - mTop,  Math.min(y, nearest.y + nearest.height - h + mBot)),
  };
}

function animateWindowX(targetX, durationMs) {
  if (peekAnimTimer) { clearTimeout(peekAnimTimer); peekAnimTimer = null; }
  const bounds = win.getBounds();
  const startX = bounds.x;
  if (startX === targetX) { isAnimating = false; return; }
  isAnimating = true;
  const startTime = Date.now();
  const snapY = miniSnap ? miniSnap.y : bounds.y;
  const snapW = miniSnap ? miniSnap.width : bounds.width;
  const snapH = miniSnap ? miniSnap.height : bounds.height;
  const step = () => {
    if (!win || win.isDestroyed()) { peekAnimTimer = null; isAnimating = false; return; }
    const t = Math.min(1, (Date.now() - startTime) / durationMs);
    const eased = t * (2 - t);
    const x = Math.round(startX + (targetX - startX) * eased);
    win.setBounds({ x, y: snapY, width: snapW, height: snapH });
    if (t < 1) {
      peekAnimTimer = setTimeout(step, 16);
    } else {
      peekAnimTimer = null;
      isAnimating = false;
    }
  };
  step();
}

function animateWindowParabola(targetX, targetY, durationMs, onDone) {
  if (peekAnimTimer) { clearTimeout(peekAnimTimer); peekAnimTimer = null; }
  const bounds = win.getBounds();
  const startX = bounds.x, startY = bounds.y;
  const size = SIZES[currentSize];
  if (startX === targetX && startY === targetY) {
    isAnimating = false;
    if (onDone) onDone();
    return;
  }
  isAnimating = true;
  const startTime = Date.now();
  const step = () => {
    if (!win || win.isDestroyed()) { peekAnimTimer = null; isAnimating = false; return; }
    const t = Math.min(1, (Date.now() - startTime) / durationMs);
    const eased = t * (2 - t);
    const x = Math.round(startX + (targetX - startX) * eased);
    const arc = -4 * JUMP_PEAK_HEIGHT * t * (t - 1);
    const y = Math.round(startY + (targetY - startY) * eased - arc);
    win.setPosition(x, y);
    if (t < 1) {
      peekAnimTimer = setTimeout(step, 16);
    } else {
      peekAnimTimer = null;
      isAnimating = false;
      if (onDone) onDone();
    }
  };
  step();
}

function miniPeekIn() {
  animateWindowX(currentMiniX - PEEK_OFFSET, 200);
}

function miniPeekOut() {
  animateWindowX(currentMiniX, 200);
}

function cancelMiniTransition() {
  miniTransitioning = false;
  if (miniTransitionTimer) { clearTimeout(miniTransitionTimer); miniTransitionTimer = null; }
}

function checkMiniModeSnap() {
  if (miniMode) return;
  const bounds = win.getBounds();
  const size = SIZES[currentSize];
  const mRight = Math.round(size.width * 0.25);
  const centerX = bounds.x + size.width / 2;
  const displays = screen.getAllDisplays();
  for (const d of displays) {
    const wa = d.workArea;
    const centerY = bounds.y + size.height / 2;
    if (centerX < wa.x || centerX > wa.x + wa.width) continue;
    if (centerY < wa.y || centerY > wa.y + wa.height) continue;
    const rightLimit = wa.x + wa.width - size.width + mRight;
    if (bounds.x >= rightLimit - SNAP_TOLERANCE) {
      enterMiniMode(wa);
      return;
    }
  }
}

function enterMiniMode(wa, viaMenu) {
  if (miniMode && !viaMenu) return; // Already in mini mode
  const bounds = win.getBounds();
  if (!viaMenu) {
    preMiniX = bounds.x;
    preMiniY = bounds.y;
  }
  miniMode = true;
  if (behaviorEngine) behaviorEngine.stop();
  const size = SIZES[currentSize];
  currentMiniX = wa.x + wa.width - Math.round(size.width * (1 - MINI_OFFSET_RATIO));
  miniSnap = { y: bounds.y, width: size.width, height: size.height };

  if (autoReturnTimer) { clearTimeout(autoReturnTimer); autoReturnTimer = null; }
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; pendingState = null; }
  stopWakePoll();

  sendToRenderer("mini-mode-change", true);
  miniTransitioning = true;
  buildContextMenu();
  buildTrayMenu();

  const enterSvgState = doNotDisturb ? "mini-enter-sleep" : "mini-enter";

  if (viaMenu) {
    const displays = screen.getAllDisplays();
    let maxRight = 0;
    for (const d of displays) maxRight = Math.max(maxRight, d.bounds.x + d.bounds.width);
    const jumpTarget = maxRight;
    animateWindowParabola(jumpTarget, bounds.y, JUMP_DURATION, () => {
      applyState(enterSvgState);
      miniTransitionTimer = setTimeout(() => {
        miniSnap = { y: bounds.y, width: size.width, height: size.height };
        win.setBounds({ x: currentMiniX, y: miniSnap.y, width: miniSnap.width, height: miniSnap.height });
        miniTransitionTimer = setTimeout(() => {
          miniTransitioning = false;
          applyState(doNotDisturb ? "mini-sleep" : "mini-idle");
        }, 3200);
      }, 300);
    });
  } else {
    animateWindowX(currentMiniX, 100);
    applyState(enterSvgState);
    miniTransitionTimer = setTimeout(() => {
      miniTransitioning = false;
      applyState(doNotDisturb ? "mini-sleep" : "mini-idle");
    }, 3200);
  }
}

function exitMiniMode() {
  if (!miniMode) return;
  cancelMiniTransition();
  miniMode = false;
  miniSnap = null;
  miniSleepPeeked = false;
  sendToRenderer("mini-mode-change", false);
  buildContextMenu();
  buildTrayMenu();

  const size = SIZES[currentSize];
  const clamped = clampToScreen(preMiniX, preMiniY, size.width, size.height);
  const wa = getNearestWorkArea(clamped.x + size.width / 2, clamped.y + size.height / 2);
  const mRight = Math.round(size.width * 0.25);
  if (clamped.x >= wa.x + wa.width - size.width + mRight - SNAP_TOLERANCE) {
    clamped.x = wa.x + wa.width - size.width + mRight - 100;
  }

  if (autoReturnTimer) { clearTimeout(autoReturnTimer); autoReturnTimer = null; }
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; pendingState = null; }

  animateWindowParabola(clamped.x, clamped.y, JUMP_DURATION, () => {
    if (doNotDisturb) {
      doNotDisturb = false;
      sendToRenderer("dnd-change", false);
      buildContextMenu();
      buildTrayMenu();
      applyState("waking");
    } else {
      const resolved = resolveDisplayState();
      applyState(resolved, getSvgOverride(resolved));
    }
  });
}

function enterMiniViaMenu() {
  const bounds = win.getBounds();
  const size = SIZES[currentSize];
  const wa = getNearestWorkArea(bounds.x + size.width / 2, bounds.y + size.height / 2);

  preMiniX = bounds.x;
  preMiniY = bounds.y;
  miniTransitioning = true;

  sendToRenderer("mini-mode-change", true);

  applyState("mini-crabwalk");

  const edgeX = wa.x + wa.width - size.width + Math.round(size.width * 0.25);
  const walkDist = Math.abs(bounds.x - edgeX);
  const walkDuration = walkDist / CRABWALK_SPEED;
  animateWindowX(edgeX, walkDuration);

  miniTransitionTimer = setTimeout(() => {
    enterMiniMode(wa, true);
  }, walkDuration + 50);
}

function buildContextMenu() {
  const template = [
    {
      label: t("size"),
      submenu: [
        { label: t("small"), type: "radio", checked: currentSize === "S", click: () => resizeWindow("S") },
        { label: t("medium"), type: "radio", checked: currentSize === "M", click: () => resizeWindow("M") },
        { label: t("large"), type: "radio", checked: currentSize === "L", click: () => resizeWindow("L") },
      ],
    },
    { type: "separator" },
    {
      label: miniMode ? t("exitMiniMode") : t("miniMode"),
      enabled: !miniTransitioning && !(doNotDisturb && !miniMode),
      click: () => miniMode ? exitMiniMode() : enterMiniViaMenu(),
    },
    { type: "separator" },
    {
      label: doNotDisturb ? t("wake") : t("sleep"),
      click: () => doNotDisturb ? disableDoNotDisturb() : enableDoNotDisturb(),
    },
    { type: "separator" },
    {
      label: t("language"),
      submenu: [
        { label: "English", type: "radio", checked: lang === "en", click: () => setLanguage("en") },
        { label: "中文", type: "radio", checked: lang === "zh", click: () => setLanguage("zh") },
      ],
    },
    { type: "separator" },
    { label: t("quit"), click: () => requestAppQuit() },
  ];
  contextMenu = Menu.buildFromTemplate(template);
}

function setLanguage(newLang) {
  lang = newLang;
  buildContextMenu();
  buildTrayMenu();
  savePrefs();
}

function resizeWindow(sizeKey) {
  currentSize = sizeKey;
  const size = SIZES[sizeKey];
  if (miniMode) {
    const { y } = win.getBounds();
    const wa = getNearestWorkArea(currentMiniX + size.width / 2, y + size.height / 2);
    currentMiniX = wa.x + wa.width - Math.round(size.width * (1 - MINI_OFFSET_RATIO));
    const clampedY = Math.max(wa.y, Math.min(y, wa.y + wa.height - size.height));
    miniSnap = { y: clampedY, width: size.width, height: size.height };
    win.setBounds({ x: currentMiniX, y: clampedY, width: size.width, height: size.height });
  } else {
    const { x, y } = win.getBounds();
    const clamped = clampToScreen(x, y, size.width, size.height);
    win.setBounds({ ...clamped, width: size.width, height: size.height });
  }
  buildContextMenu();
  savePrefs();
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win && !win.isDestroyed()) {
      win.showInactive();
      win.moveTop();
    } else {
      createWindow();
    }
  });

  app.whenReady().then(() => {
    createWindow();
  });

  app.on("before-quit", () => {
    isQuitting = true;
    savePrefs();
    if (pendingTimer) clearTimeout(pendingTimer);
    if (autoReturnTimer) clearTimeout(autoReturnTimer);
    if (mainTickTimer) clearInterval(mainTickTimer);
    if (wakePollTimer) clearInterval(wakePollTimer);
    if (miniTransitionTimer) clearTimeout(miniTransitionTimer);
    if (peekAnimTimer) clearTimeout(peekAnimTimer);
    if (yawnDelayTimer) clearTimeout(yawnDelayTimer);
    if (idleLookReturnTimer) clearTimeout(idleLookReturnTimer);
    stopStaleCleanup();
    stopLinuxActivityMonitors();
    if (httpServer) httpServer.close();
  });

  app.on("window-all-closed", () => {
    if (!isQuitting) return;
    app.quit();
  });
}
