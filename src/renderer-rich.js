const container = document.getElementById("pet-container");
const motionLayer = document.getElementById("pet-motion");
const flipLayer = document.getElementById("pet-flip");
const hatEl = document.getElementById("pet-hat");

const CLICK_WINDOW_MS = 320;
const CROSSFADE_MS = 140;
const DRAG_THRESHOLD = 3;
const REACT_DRAG_SVG = "clawd-react-drag.svg";
const DRAG_UNCOMFORTABLE_SVG = "clawd-drag-uncomfortable.svg";
const PETTING_SVG = "clawd-react-shy.svg";
const HOVER_REACTION_DELAY_MS = 220;
const HOVER_REACTION_COOLDOWN_MS = 4200;
const HOVER_REACTION_CHANCE = 0.42;
const HOVER_COSTUME_CHANCE = 0.08;
const DRAG_UNCOMFORTABLE_AFTER_MS = 1200;
const DRAG_UNCOMFORTABLE_THRESHOLD = 0.58;
const SETTLE_BASE_MS = 220;
const SETTLE_EXTRA_MS = 220;
const LONG_PRESS_MS = 800;
const COSTUME_MIN_MS = 15000;
const COSTUME_MAX_MS = 30000;
const HAT_FALLBACK_TOP_OFFSET_PERCENT = 42;
const SVG_NS = "http://www.w3.org/2000/svg";
const JELLY_PHYSICS = {
  springX: 24,
  springY: 28,
  dampingX: 10,
  dampingY: 12,
  rotateSpring: 22,
  rotateDamping: 10,
  maxX: 1.2,
  maxY: 1.45,
  maxRotate: 7,
};
const HAT_PHYSICS = {
  springX: 26,
  springY: 30,
  dampingX: 12,
  dampingY: 13,
  tiltSpring: 18,
  tiltDamping: 10,
  scaleFollow: 14,
  maxOffsetX: 0.24,
  maxOffsetY: 0.45,
  maxTilt: 4.5,
};

const INTERACTABLE_STATES = new Set([
  "idle",
  "living",
  "sitting",
  "coffee",
  "writing",
  "snacking",
  "reading",
  "coding",
  "vacation",
  "sunbathing",
  "dozing",
  "bathing",
  "bubbles",
  "idle-nod",
  "tea",
  "painting",
  "gardening",
  "fishing",
  "knitting",
  "music",
  "meditating",
  "stargazing",
  "skateboard",
  "dancing",
  "jumping-rope",
  "cooking",
  "sweeping-floor",
  "exercising",
  "yoga",
  "wearing-scarf",
  "wearing-glasses",
  "umbrella",
  "cape",
  "crown",
  "edge-peek-left",
  "edge-peek-right",
]);

const REACTION_VARIANTS = {
  blush: {
    svg: "clawd-react-blush.svg",
    duration: 2400,
    hatMood: "shy",
  },
  bounce: {
    svg: "clawd-react-bounce.svg",
    duration: 2600,
    hatMood: "bounce",
  },
  hearts: {
    svg: "clawd-react-hearts.svg",
    duration: 2900,
    hatMood: "love",
  },
  sparkle: {
    svg: "clawd-react-sparkle.svg",
    duration: 2500,
    hatMood: "sparkle",
  },
  shy: {
    svg: "clawd-react-shy.svg",
    duration: 2500,
    hatMood: "shy",
  },
  surprise: {
    svg: "clawd-react-surprise.svg",
    duration: 2200,
    hatMood: "surprise",
  },
  dizzy: {
    svg: "clawd-react-dizzy.svg",
    duration: 2600,
    hatMood: "spin",
  },
  sneeze: {
    svg: "clawd-react-sneeze.svg",
    duration: 2200,
    hatMood: "surprise",
  },
  hiccup: {
    svg: "clawd-react-hiccup.svg",
    duration: 2100,
    hatMood: "bounce",
  },
  wiggle: {
    svg: "clawd-react-wiggle.svg",
    duration: 2400,
    hatMood: "wiggle",
  },
  wave: {
    svg: "clawd-react-wave.svg",
    duration: 2500,
    hatMood: "wave",
  },
  spin: {
    svg: "clawd-react-spin.svg",
    duration: 2300,
    hatMood: "spin",
  },
  thought: {
    svg: "clawd-react-thought.svg",
    duration: 2700,
    hatMood: "thought",
  },
};

const HOVER_REACTION_POOL = ["blush", "sparkle", "shy", "wave", "thought", "wiggle"];
const CLICK_REACTION_POOL = [
  "blush",
  "sparkle",
  "shy",
  "wave",
  "thought",
  "wiggle",
  "surprise",
  "spin",
  "hearts",
  "bounce",
  "dizzy",
  "sneeze",
  "hiccup",
];
const DOUBLE_REACTION_POOL = ["bounce", "hearts", "spin", "surprise"];
const COSTUME_VARIANTS = {
  scarf: {
    state: "wearing-scarf",
    svg: "clawd-wearing-scarf.svg",
    hatMood: "idle",
  },
  glasses: {
    state: "wearing-glasses",
    svg: "clawd-wearing-glasses.svg",
    hatMood: "sparkle",
  },
  umbrella: {
    state: "umbrella",
    svg: "clawd-umbrella.svg",
    hatMood: "wave",
  },
  cape: {
    state: "cape",
    svg: "clawd-cape.svg",
    hatMood: "bounce",
  },
  crown: {
    state: "crown",
    svg: "clawd-crown.svg",
    hatMood: "love",
  },
};
const COSTUME_POOL = Object.keys(COSTUME_VARIANTS);
const PETTING_VARIANT = {
  state: "petting",
  svg: PETTING_SVG,
  hatMood: "shy",
};

const HAT_LAYOUTS = {
  default: { left: "46%", top: "18%", rotate: "-8deg", scale: 1, opacity: 1, mood: "idle" },
  idle: { left: "46%", top: "18%", rotate: "-8deg", scale: 1 },
  living: { left: "46%", top: "18%", rotate: "-8deg", scale: 1 },
  sitting: { left: "46%", top: "20%", rotate: "-10deg", scale: 0.98 },
  coffee: { left: "45%", top: "18%", rotate: "-10deg", scale: 1 },
  writing: { left: "44%", top: "18%", rotate: "-10deg", scale: 0.98 },
  snacking: { left: "46%", top: "18%", rotate: "-9deg", scale: 1 },
  reading: { left: "45%", top: "18%", rotate: "-9deg", scale: 0.98 },
  coding: { left: "35%", top: "18%", rotate: "-12deg", scale: 0.92 },
  sunbathing: { left: "57%", top: "28%", rotate: "-28deg", scale: 1.05 },
  vacation: { left: "58%", top: "27%", rotate: "-27deg", scale: 1.04 },
  dozing: { left: "46%", top: "20%", rotate: "-11deg", scale: 0.98 },
  sleeping: { left: "58%", top: "30%", rotate: "-38deg", scale: 1.05 },
  waking: { left: "54%", top: "28%", rotate: "-28deg", scale: 1.03 },
  walking: { left: "46%", top: "18%", rotate: "-7deg", scale: 1 },
  running: { left: "46%", top: "17%", rotate: "-6deg", scale: 1.02 },
  bathing: { left: "46%", top: "16%", rotate: "-7deg", scale: 0.96 },
  bubbles: { left: "46%", top: "17%", rotate: "-8deg", scale: 1 },
  "idle-nod": { left: "46%", top: "19%", rotate: "-10deg", scale: 0.98 },
  tea: { left: "46%", top: "18%", rotate: "-9deg", scale: 0.99 },
  painting: { left: "45%", top: "18%", rotate: "-10deg", scale: 0.98 },
  gardening: { left: "46%", top: "18%", rotate: "-9deg", scale: 0.99 },
  fishing: { left: "55%", top: "24%", rotate: "-18deg", scale: 1.02 },
  knitting: { left: "46%", top: "19%", rotate: "-10deg", scale: 0.98 },
  music: { left: "46%", top: "18%", rotate: "-8deg", scale: 0.98 },
  meditating: { left: "46%", top: "22%", rotate: "-10deg", scale: 0.96 },
  stargazing: { left: "52%", top: "22%", rotate: "-18deg", scale: 1.01 },
  skateboard: { left: "46%", top: "18%", rotate: "-6deg", scale: 1 },
  dancing: { left: "46%", top: "17%", rotate: "-7deg", scale: 1.01 },
  "jumping-rope": { left: "46%", top: "16%", rotate: "-6deg", scale: 1.01 },
  cooking: { left: "47%", top: "16%", rotate: "-7deg", scale: 0.97 },
  "sweeping-floor": { left: "46%", top: "18%", rotate: "-9deg", scale: 0.99 },
  exercising: { left: "46%", top: "17%", rotate: "-7deg", scale: 1 },
  yoga: { left: "46%", top: "22%", rotate: "-10deg", scale: 0.96 },
  "wearing-scarf": { left: "46%", top: "18%", rotate: "-8deg", scale: 1 },
  "wearing-glasses": { left: "46%", top: "18%", rotate: "-8deg", scale: 1 },
  umbrella: { left: "47%", top: "18%", rotate: "-9deg", scale: 0.99 },
  cape: { left: "46%", top: "18%", rotate: "-8deg", scale: 1 },
  crown: { left: "46%", top: "16%", rotate: "-8deg", scale: 1, opacity: 0 },
  petting: { left: "46%", top: "20%", rotate: "-9deg", scale: 0.98, mood: "shy" },
  "edge-peek-left": { left: "72%", top: "29%", rotate: "-8deg", scale: 0.88 },
  "edge-peek-right": { left: "29%", top: "29%", rotate: "8deg", scale: 0.88 },
  "mini-idle": { left: "47%", top: "30%", rotate: "-20deg", scale: 0.84 },
  "mini-peek": { left: "45%", top: "30%", rotate: "-18deg", scale: 0.84 },
  "mini-alert": { left: "46%", top: "29%", rotate: "-20deg", scale: 0.84 },
  "mini-happy": { left: "46%", top: "29%", rotate: "-20deg", scale: 0.84 },
  "mini-enter": { left: "48%", top: "29%", rotate: "-20deg", scale: 0.84 },
  "mini-enter-sleep": { left: "48%", top: "30%", rotate: "-24deg", scale: 0.82 },
  "mini-crabwalk": { left: "46%", top: "30%", rotate: "-20deg", scale: 0.84 },
  "mini-sleep": { left: "46%", top: "31%", rotate: "-24deg", scale: 0.82 },
};

const HAT_POSES = {
  default: { tx: 3.5, ty: 1.8, rotate: -8, scale: 0.25, opacity: 1, mood: "idle" },
  sitting: { ty: 2.0, rotate: -10, scale: 0.245 },
  coding: { tx: 3.3, ty: 1.9, rotate: -10, scale: 0.24 },
  dozing: { ty: 2.1, rotate: -10, scale: 0.245 },
  sleeping: { tx: 3.3, ty: 5.9, rotate: -24, scale: 0.26 },
  waking: { tx: 3.4, ty: 4.6, rotate: -16, scale: 0.255 },
  vacation: { tx: 3.3, ty: 2.8, rotate: -8, scale: 0.26 },
  sunbathing: { tx: 3.3, ty: 2.8, rotate: -8, scale: 0.26 },
  bathing: { tx: 3.8, ty: 1.0, rotate: -7, scale: 0.225 },
  "idle-nod": { ty: 2.1, rotate: -10, scale: 0.245 },
  tea: { ty: 2.0, rotate: -9, scale: 0.245 },
  painting: { tx: 3.2, ty: 1.9, rotate: -10, scale: 0.24 },
  gardening: { ty: 2.0, rotate: -9, scale: 0.245 },
  fishing: { tx: 3.3, ty: 3.2, rotate: -16, scale: 0.255 },
  knitting: { ty: 2.1, rotate: -10, scale: 0.245 },
  music: { ty: 2.0, rotate: -8, scale: 0.245 },
  meditating: { ty: 2.9, rotate: -11, scale: 0.235 },
  stargazing: { tx: 3.2, ty: 3.0, rotate: -16, scale: 0.255 },
  skateboard: { ty: 1.8, rotate: -7, scale: 0.25 },
  dancing: { ty: 1.7, rotate: -7, scale: 0.25 },
  "jumping-rope": { ty: 1.5, rotate: -6, scale: 0.25 },
  cooking: { tx: 3.6, ty: 1.1, rotate: -7, scale: 0.235, opacity: 0 },
  "sweeping-floor": { ty: 1.8, rotate: -9, scale: 0.245 },
  exercising: { ty: 1.7, rotate: -7, scale: 0.25 },
  yoga: { ty: 3.0, rotate: -11, scale: 0.235 },
  "wearing-scarf": { ty: 1.9, rotate: -8, scale: 0.25 },
  "wearing-glasses": { ty: 1.9, rotate: -8, scale: 0.25 },
  umbrella: { tx: 3.4, ty: 1.9, rotate: -9, scale: 0.25 },
  cape: { ty: 1.8, rotate: -8, scale: 0.25 },
  crown: { ty: 1.4, rotate: -8, scale: 0.25, opacity: 0 },
  petting: { ty: 2.1, rotate: -10, scale: 0.245 },
  "edge-peek-left": { tx: -6.4, ty: 1.8, rotate: -8, scale: 0.25 },
  "edge-peek-right": { tx: 13.4, ty: 1.8, rotate: 8, scale: 0.25 },
};

const SVG_HAT_LAYOUTS = {
  "clawd-react-blush.svg": { mood: "shy" },
  "clawd-react-bounce.svg": { mood: "bounce" },
  "clawd-react-hearts.svg": { mood: "love" },
  "clawd-react-sparkle.svg": { mood: "sparkle" },
  "clawd-react-shy.svg": { mood: "shy" },
  "clawd-react-surprise.svg": { mood: "surprise" },
  "clawd-react-dizzy.svg": { mood: "spin" },
  "clawd-react-sneeze.svg": { mood: "surprise" },
  "clawd-react-hiccup.svg": { mood: "bounce" },
  "clawd-react-wiggle.svg": { mood: "wiggle" },
  "clawd-react-wave.svg": { mood: "wave" },
  "clawd-react-spin.svg": { mood: "spin" },
  "clawd-react-thought.svg": { mood: "thought" },
  [REACT_DRAG_SVG]: { mood: "surprise", top: "16%", rotate: "-12deg", scale: 1.04 },
  [DRAG_UNCOMFORTABLE_SVG]: { mood: "shy", top: "16%", rotate: "-15deg", scale: 1.04 },
  "clawd-dressing.svg": { opacity: 0 },
  "clawd-cooking.svg": { opacity: 0 },
  "clawd-crown.svg": { opacity: 0 },
  "clawd-working-building.svg": { opacity: 0 },
  "clawd-working-wizard.svg": { opacity: 0 },
};

const SVG_HAT_POSE_OVERRIDES = {
  "clawd-react-blush.svg": { mood: "shy" },
  "clawd-react-bounce.svg": { mood: "bounce" },
  "clawd-react-hearts.svg": { mood: "love" },
  "clawd-react-sparkle.svg": { mood: "sparkle" },
  "clawd-react-shy.svg": { mood: "shy" },
  "clawd-react-surprise.svg": { mood: "surprise" },
  "clawd-react-dizzy.svg": { mood: "spin" },
  "clawd-react-sneeze.svg": { mood: "surprise" },
  "clawd-react-hiccup.svg": { mood: "bounce" },
  "clawd-react-wiggle.svg": { mood: "wiggle" },
  "clawd-react-wave.svg": { mood: "wave" },
  "clawd-react-spin.svg": { mood: "spin" },
  "clawd-react-thought.svg": { mood: "thought" },
  [REACT_DRAG_SVG]: { mood: "surprise", rotate: -12, scale: 0.26 },
  [DRAG_UNCOMFORTABLE_SVG]: { mood: "shy", rotate: -15, scale: 0.26 },
  "clawd-dressing.svg": { opacity: 0 },
  "clawd-cooking.svg": { opacity: 0 },
  "clawd-crown.svg": { opacity: 0 },
  "clawd-working-building.svg": { opacity: 0 },
  "clawd-working-wizard.svg": { opacity: 0 },
};

let facingLeft = false;
let dndEnabled = false;
let miniMode = false;

let isDragging = false;
let didDrag = false;
let lastScreenX = 0;
let lastScreenY = 0;
let mouseDownX = 0;
let mouseDownY = 0;
let pendingDx = 0;
let pendingDy = 0;
let dragRAF = null;

let clickCount = 0;
let clickTimer = null;
let hoverIntentTimer = null;
let petHoldTimer = null;
let currentReactionKey = null;
let lastReactionKey = null;
let lastCostumeKey = null;
let lastHoverReactionAt = 0;
let isReacting = false;
let isDragReacting = false;
let isPetting = false;
let reactTimer = null;
let currentDragReactionSvg = REACT_DRAG_SVG;

let clawdEl = document.getElementById("clawd");
let pendingNext = null;
let visibleSvgName = "clawd-idle-follow.svg";
let activeStateName = "idle";
let deferredRendererState = null;
let currentHatLayout = null;
let currentHatPose = null;
let usingAttachedHat = false;
let pendingSwapMeta = null;

let eyeTarget = null;
let bodyTarget = null;
let shadowTarget = null;

const motion = {
  frame: 0,
  lastTs: 0,
  lastPointerTs: 0,
  dragVX: 0,
  dragVY: 0,
  releaseVX: 0,
  releaseVY: 0,
  settleUntil: 0,
  settleDuration: SETTLE_BASE_MS,
  settleStrength: 1,
  dragStartedAt: 0,
  dragStress: 0,
  dragDiscomfort: 0,
  dragIntensity: 0,
  jellyX: 0,
  jellyY: 0,
  jellyRotate: 0,
  jellyVX: 0,
  jellyVY: 0,
  jellyRotateV: 0,
  tx: 0,
  ty: 0,
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
  hatOffsetX: 0,
  hatOffsetY: 0,
  hatVelX: 0,
  hatVelY: 0,
  hatTilt: 0,
  hatTiltVel: 0,
  hatScaleX: 1,
  hatScaleY: 1,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addPercentOffset(value, offset) {
  if (typeof value !== "string" || !value.endsWith("%")) return value;
  return `${parseFloat(value) + offset}%`;
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createHatVariant(hatMood) {
  return hatMood ? { hatMood } : null;
}

function clearClickTimer() {
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
}

function clearReactTimer() {
  if (reactTimer) {
    clearTimeout(reactTimer);
    reactTimer = null;
  }
}

function clearPetHoldTimer() {
  if (petHoldTimer) {
    clearTimeout(petHoldTimer);
    petHoldTimer = null;
  }
}

function getStateMotionFamily(state = activeStateName) {
  switch (state) {
    case "walking":
    case "skateboard":
      return "walk";
    case "running":
    case "jumping-rope":
      return "run";
    case "petting":
      return "pet";
    case "idle":
    case "living":
    case "sitting":
    case "coffee":
    case "writing":
    case "snacking":
    case "vacation":
    case "reading":
    case "coding":
    case "sunbathing":
    case "bathing":
    case "bubbles":
    case "idle-nod":
    case "tea":
    case "painting":
    case "gardening":
    case "fishing":
    case "knitting":
    case "music":
    case "meditating":
    case "stargazing":
    case "yoga":
    case "wearing-scarf":
    case "wearing-glasses":
    case "umbrella":
    case "cape":
    case "crown":
    case "edge-peek-left":
    case "edge-peek-right":
    case "dozing":
    case "mini-idle":
    case "mini-peek":
    case "mini-sleep":
      return "idle";
    default:
      return "busy";
  }
}

function buildTransitionMeta(fromState = activeStateName, toState = activeStateName, strength = 1) {
  const fromFamily = getStateMotionFamily(fromState);
  const toFamily = getStateMotionFamily(toState);
  const direction = facingLeft ? -1 : 1;
  const movingFrom = fromFamily === "walk" || fromFamily === "run";
  const movingTo = toFamily === "walk" || toFamily === "run";
  const livelyTo = toFamily === "busy" || movingTo || toFamily === "pet";

  return {
    exit: {
      x: movingTo ? -direction * 6 * strength : movingFrom ? direction * 4 * strength : 0,
      y: 10 * strength,
      rotate: movingTo
        ? -direction * 12 * strength
        : movingFrom
          ? direction * 10 * strength
          : livelyTo
            ? direction * 4 * strength
            : 0,
    },
    entry: {
      x: movingTo ? direction * 4 * strength : movingFrom ? -direction * 3 * strength : 0,
      y: -7 * strength,
      rotate: movingTo ? direction * 8 * strength : livelyTo ? direction * 3 * strength : 0,
    },
    hat: {
      x: movingTo ? direction * 0.12 * strength : 0,
      y: -0.24 * strength,
      tilt: movingTo ? direction * 1.4 * strength : 0.8 * strength,
    },
  };
}

function kickJelly({ x = 0, y = 0, rotate = 0 } = {}) {
  motion.jellyVX = clamp(motion.jellyVX + x * 1.4, -18, 18);
  motion.jellyVY = clamp(motion.jellyVY + y * 1.6, -24, 24);
  motion.jellyRotateV = clamp(motion.jellyRotateV + rotate * 2, -90, 90);
}

function kickHat({ x = 0, y = 0, tilt = 0 } = {}) {
  motion.hatOffsetX = clamp(motion.hatOffsetX + x * 0.12, -HAT_PHYSICS.maxOffsetX, HAT_PHYSICS.maxOffsetX);
  motion.hatOffsetY = clamp(motion.hatOffsetY + y * 0.14, -HAT_PHYSICS.maxOffsetY, HAT_PHYSICS.maxOffsetY);
  motion.hatVelX = clamp(motion.hatVelX + x * 16, -8, 8);
  motion.hatVelY = clamp(motion.hatVelY + y * 18, -10, 10);
  motion.hatTiltVel = clamp(motion.hatTiltVel + tilt * 14, -55, 55);
}

function resolveHatPose(state = activeStateName, svg = visibleSvgName, variant = null) {
  const statePose = HAT_POSES[state] || HAT_POSES.default;
  const svgPose = SVG_HAT_POSE_OVERRIDES[svg] || {};
  const variantPose = variant ? { mood: variant.hatMood } : {};
  return {
    ...HAT_POSES.default,
    ...statePose,
    ...svgPose,
    ...variantPose,
  };
}

function getHatAnchor(svgDoc) {
  return svgDoc.getElementById("hat-anchor") || null;
}

function getHatAttachmentTarget(svgDoc) {
  return getHatAnchor(svgDoc)
    || svgDoc.querySelector("#body-js > .breathe-anim, #body-js > .walk-bob, #body-js > .run-bob")
    || svgDoc.querySelector(".breathe-anim, .walk-bob, .run-bob, .body-motion, .belly-breathe, .startle-bounce, [class*='body-']")
    || svgDoc.querySelector(".body-motion")
    || svgDoc.querySelector(".belly-breathe")
    || svgDoc.querySelector(".breathe")
    || svgDoc.querySelector("g.body")
    || svgDoc.getElementById("body-js")
    || svgDoc.querySelector("g[id*='body']")
    || svgDoc.getElementById("torso")?.parentNode
    || null;
}

function createAttachedHat(svgDoc) {
  const hatRoot = svgDoc.createElementNS(SVG_NS, "g");
  hatRoot.setAttribute("id", "clawd-hat-svg");
  hatRoot.innerHTML = `
    <g class="clawd-hat-pose">
      <g class="clawd-hat-rotator">
        <ellipse cx="16" cy="15.5" rx="8.8" ry="1.8" fill="rgba(0, 0, 0, 0.18)" />
        <path d="M9 11C9 7.5 11.9 5 16.1 5C20.6 5 23.3 7.8 23.3 11.2C23.3 12.1 22.9 12.8 22.1 13.2H10.5C9.5 12.7 9 12 9 11Z" fill="#5f8f75" />
        <path d="M6.5 12.9C6.5 11.8 7.4 10.9 8.5 10.9H24C25 10.9 25.8 11.8 25.8 12.9C25.8 14 25 14.8 24 14.8H8.5C7.4 14.8 6.5 14 6.5 12.9Z" fill="#4f7e68" />
        <rect x="12.6" y="9.1" width="6.2" height="2.1" rx="1" fill="#f4d98b" />
        <circle cx="21.8" cy="6.2" r="1.7" fill="#f4d98b" />
        <path d="M10 8.7L8.4 7.7L6.8 8.7L8.4 9.7Z" fill="#f59ab3" />
        <path d="M8 8.4H8.9V9.1H8Z" fill="#f4d98b" />
        <g class="clawd-hat-sparkles" stroke="#fff6db" stroke-width="1" stroke-linecap="round" opacity="0.34">
          <path d="M24.8 7.1H26.2M25.5 6.4V7.8" />
          <path d="M6.2 5.6H7.6M6.9 4.9V6.3" />
        </g>
      </g>
    </g>
  `;
  return hatRoot;
}

function updateAttachedHatTransform(existingHatRoot = null, pose = currentHatPose) {
  if (!pose || !clawdEl) return;

  let svgDoc;
  try {
    svgDoc = clawdEl.contentDocument;
  } catch {
    return;
  }
  if (!svgDoc) return;

  const hatRoot = existingHatRoot || svgDoc.getElementById("clawd-hat-svg");
  if (!hatRoot) return;

  const anchor = getHatAnchor(svgDoc);
  const anchored = !!anchor && hatRoot.parentNode === anchor;
  const anchorScale = Number.parseFloat(anchor?.getAttribute("data-hat-scale") || "");
  const anchorRotate = Number.parseFloat(anchor?.getAttribute("data-hat-rotate") || "");
  const anchorOpacity = Number.parseFloat(anchor?.getAttribute("data-hat-opacity") || "");
  const forceHidden = anchor?.getAttribute("data-hat-hide") === "true";

  const opacity = forceHidden
    ? 0
    : (Number.isFinite(anchorOpacity) ? anchorOpacity : (pose.opacity ?? 1));
  hatRoot.setAttribute("display", opacity <= 0 ? "none" : "inline");

  const poseGroup = hatRoot.querySelector(".clawd-hat-pose");
  const rotator = hatRoot.querySelector(".clawd-hat-rotator");
  const sparkles = hatRoot.querySelector(".clawd-hat-sparkles");
  const tx = (anchored ? 0 : pose.tx) + motion.hatOffsetX;
  const ty = (anchored ? 0 : pose.ty) + motion.hatOffsetY;
  const baseScale = Number.isFinite(anchorScale) ? anchorScale : pose.scale;
  const baseRotate = Number.isFinite(anchorRotate) ? anchorRotate : pose.rotate;
  const scaleX = Math.max(0.14, baseScale * motion.hatScaleX);
  const scaleY = Math.max(0.14, baseScale * motion.hatScaleY);

  hatRoot.setAttribute("transform", `translate(${tx.toFixed(2)} ${ty.toFixed(2)})`);
  if (poseGroup) {
    poseGroup.setAttribute("transform", `scale(${scaleX.toFixed(4)} ${scaleY.toFixed(4)})`);
  }
  if (rotator) {
    rotator.setAttribute("transform", `rotate(${(baseRotate + motion.hatTilt).toFixed(2)} 16 10)`);
  }
  if (sparkles) {
    sparkles.setAttribute("opacity", ["love", "sparkle", "thought"].includes(pose.mood) ? "0.82" : "0.34");
  }

  usingAttachedHat = opacity > 0;
}

function syncAttachedHat(pose = currentHatPose) {
  usingAttachedHat = false;
  if (!pose || !clawdEl) return;

  let svgDoc;
  try {
    svgDoc = clawdEl.contentDocument;
  } catch {
    return;
  }
  if (!svgDoc) return;

  const target = getHatAttachmentTarget(svgDoc);
  if (!target) return;

  let hatRoot = svgDoc.getElementById("clawd-hat-svg");
  if (!hatRoot || hatRoot.parentNode !== target) {
    if (hatRoot) hatRoot.remove();
    hatRoot = createAttachedHat(svgDoc);
    target.appendChild(hatRoot);
  }

  updateAttachedHatTransform(hatRoot, pose);
}

function updateHatPhysics(dtSec, motionFamily) {
  const safeDt = Math.max(dtSec, 1 / 120);
  motion.hatVelX += (-motion.hatOffsetX * HAT_PHYSICS.springX - motion.hatVelX * HAT_PHYSICS.dampingX) * safeDt;
  motion.hatVelY += (-motion.hatOffsetY * HAT_PHYSICS.springY - motion.hatVelY * HAT_PHYSICS.dampingY) * safeDt;
  motion.hatTiltVel += (-motion.hatTilt * HAT_PHYSICS.tiltSpring - motion.hatTiltVel * HAT_PHYSICS.tiltDamping) * safeDt;

  motion.hatOffsetX = clamp(
    motion.hatOffsetX + motion.hatVelX * safeDt,
    -HAT_PHYSICS.maxOffsetX,
    HAT_PHYSICS.maxOffsetX,
  );
  motion.hatOffsetY = clamp(
    motion.hatOffsetY + motion.hatVelY * safeDt,
    -HAT_PHYSICS.maxOffsetY,
    HAT_PHYSICS.maxOffsetY,
  );
  motion.hatTilt = clamp(
    motion.hatTilt + motion.hatTiltVel * safeDt,
    -HAT_PHYSICS.maxTilt,
    HAT_PHYSICS.maxTilt,
  );

  const deformation = clamp(
    Math.abs(motion.hatOffsetY) * 0.12 + Math.abs(motion.hatTilt) * 0.01,
    0,
    0.04,
  );
  motion.hatScaleX = damp(
    motion.hatScaleX,
    1 + deformation * 0.7,
    safeDt,
    HAT_PHYSICS.scaleFollow,
  );
  motion.hatScaleY = damp(
    motion.hatScaleY,
    1 - deformation * 0.85,
    safeDt,
    HAT_PHYSICS.scaleFollow,
  );
}

function damp(current, target, dtSec, speed) {
  const mix = 1 - Math.exp(-speed * dtSec);
  return current + (target - current) * mix;
}

function setMotionVars(tx, ty, rotate, scaleX, scaleY) {
  motionLayer.style.setProperty("--motion-x", `${tx.toFixed(2)}px`);
  motionLayer.style.setProperty("--motion-y", `${ty.toFixed(2)}px`);
  motionLayer.style.setProperty("--motion-rotate", `${rotate.toFixed(2)}deg`);
  motionLayer.style.setProperty("--motion-scale-x", scaleX.toFixed(4));
  motionLayer.style.setProperty("--motion-scale-y", scaleY.toFixed(4));
}

function applyFacingTransform() {
  flipLayer.style.setProperty("--flip-scale-x", facingLeft ? "-1" : "1");
}

function clearHoverIntent() {
  if (hoverIntentTimer) {
    clearTimeout(hoverIntentTimer);
    hoverIntentTimer = null;
  }
}

function setHatLayout(layout) {
  if (!hatEl) return;
  hatEl.style.setProperty("--hat-left", layout.left || HAT_LAYOUTS.default.left);
  hatEl.style.setProperty(
    "--hat-top",
    addPercentOffset(layout.top || HAT_LAYOUTS.default.top, HAT_FALLBACK_TOP_OFFSET_PERCENT),
  );
  hatEl.style.setProperty("--hat-rotate", layout.rotate || HAT_LAYOUTS.default.rotate);
  hatEl.style.setProperty("--hat-scale", String(layout.scale ?? HAT_LAYOUTS.default.scale));
  hatEl.style.setProperty("--hat-opacity", String(usingAttachedHat ? 0 : (layout.opacity ?? HAT_LAYOUTS.default.opacity)));
  hatEl.dataset.mood = layout.mood || HAT_LAYOUTS.default.mood;
}

function applyHatLayout(state = activeStateName, svg = visibleSvgName, variant = null) {
  const stateLayout = HAT_LAYOUTS[state] || HAT_LAYOUTS.default;
  const svgLayout = SVG_HAT_LAYOUTS[svg] || {};
  const variantLayout = variant ? { mood: variant.hatMood } : {};
  currentHatLayout = {
    ...HAT_LAYOUTS.default,
    ...stateLayout,
    ...svgLayout,
    ...variantLayout,
  };
  currentHatPose = resolveHatPose(state, svg, variant);
  syncAttachedHat(currentHatPose);
  setHatLayout(currentHatLayout);
}

function pickReactionKey(pool, excludedKey = lastReactionKey) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  const choices = pool.filter((key) => key !== excludedKey);
  const source = choices.length > 0 ? choices : pool;
  return source[Math.floor(Math.random() * source.length)];
}

function canPlayReaction() {
  return !dndEnabled
    && !miniMode
    && !isDragging
    && !isReacting
    && !isDragReacting
    && INTERACTABLE_STATES.has(activeStateName);
}

function getDragDiscomfort(nowTs = performance.now()) {
  const holdStress = motion.dragStartedAt
    ? clamp((nowTs - motion.dragStartedAt - DRAG_UNCOMFORTABLE_AFTER_MS) / 1800, 0, 1)
    : 0;
  return clamp(Math.max(holdStress, motion.dragStress), 0, 1);
}

function updateDragReactionVisual(force = false) {
  if (!isDragReacting) return;
  const discomfort = getDragDiscomfort();
  const nextSvg = discomfort >= DRAG_UNCOMFORTABLE_THRESHOLD
    ? DRAG_UNCOMFORTABLE_SVG
    : REACT_DRAG_SVG;

  if (!force && nextSvg === currentDragReactionSvg) return;
  currentDragReactionSvg = nextSvg;
  swapToSvg(nextSvg);
  applyHatLayout(activeStateName, nextSvg);
}

function getMotionFamily(nowTs) {
  if (isDragging && didDrag) return "drag";
  if (isPetting) return "pet";
  if (isDragging) return "press";
  if (motion.settleUntil > nowTs) return "settle";

  return getStateMotionFamily(activeStateName);
}

function getMotionTarget(nowTs, family = getMotionFamily(nowTs)) {
  const t = nowTs / 1000;
  let tx = 0;
  let ty = 0;
  let rotate = 0;
  let scaleX = 1;
  let scaleY = 1;

  if (family === "idle") {
    tx += Math.sin(t * 1.7) * 0.7 + Math.sin(t * 0.65) * 0.25;
    ty += Math.sin(t * 3.2) * 0.9;
    rotate += Math.sin(t * 1.25) * 1.2;
    scaleX += Math.sin(t * 2.9) * 0.01;
    scaleY -= Math.sin(t * 2.9) * 0.012;
  } else if (family === "busy") {
    tx += Math.sin(t * 1.5) * 0.15;
    ty += Math.sin(t * 2.6) * 0.2;
    rotate += Math.sin(t * 1.8) * 0.35;
  } else if (family === "walk") {
    const step = Math.sin(t * 10);
    const impact = Math.abs(step);
    tx += Math.sin(t * 5) * 0.8;
    ty -= impact * 3;
    rotate += step * 4;
    scaleX += impact * 0.025;
    scaleY -= impact * 0.03;
  } else if (family === "run") {
    const step = Math.sin(t * 15);
    const impact = Math.abs(step);
    tx += Math.sin(t * 7) * 1.1;
    ty -= impact * 5;
    rotate += step * 7;
    scaleX += impact * 0.04;
    scaleY -= impact * 0.05;
  } else if (family === "pet") {
    const nuzzle = Math.sin(t * 8.5);
    const cuddle = Math.sin(t * 4.2);
    tx += nuzzle * 0.8;
    ty += 1.1 + Math.abs(cuddle) * 0.35;
    rotate += nuzzle * 3.2;
    scaleX += 0.045 + Math.abs(nuzzle) * 0.02;
    scaleY -= 0.05 + Math.abs(cuddle) * 0.025;
  }

  if (family === "press") {
    ty += 1.25;
    rotate += facingLeft ? 1.5 : -1.5;
    scaleX += 0.03;
    scaleY -= 0.03;
  }

  if (family === "drag") {
    const speed = clamp(Math.max(
      motion.dragIntensity,
      Math.hypot(motion.dragVX, motion.dragVY),
    ), 0, 1.8);
    const discomfort = motion.dragDiscomfort;
    tx += clamp(
      motion.dragVX * (14 + discomfort * 9),
      -10 - discomfort * 4,
      10 + discomfort * 4,
    );
    ty += 1
      + clamp(Math.abs(motion.dragVY) * (7 + discomfort * 4), 0, 6 + discomfort * 4)
      + discomfort * 1.6;
    rotate += clamp(
      motion.dragVX * (15 + discomfort * 8),
      -10 - discomfort * 6,
      10 + discomfort * 6,
    );
    rotate += Math.sin(t * 26) * discomfort * 0.7;
    scaleX += 0.035 + speed * 0.03 + discomfort * 0.03;
    scaleY -= 0.04 + speed * 0.025 + discomfort * 0.045;
  } else if (family === "settle") {
    const remain = clamp((motion.settleUntil - nowTs) / motion.settleDuration, 0, 1);
    const strength = motion.settleStrength;
    const bounce = Math.sin((1 - remain) * Math.PI * (1.05 + strength * 0.12));
    tx += motion.releaseVX * 10 * remain * strength;
    ty += motion.releaseVY * 4 * remain;
    ty -= bounce * 2.2 * remain * strength;
    rotate += motion.releaseVX * 10 * remain * strength;
    scaleX += 0.04 * remain * strength;
    scaleY -= 0.04 * remain * (0.9 + (strength - 1) * 0.45);
  }

  return { tx, ty, rotate, scaleX, scaleY };
}

function updateJellyPhysics(dtSec, family) {
  const safeDt = Math.max(dtSec, 1 / 120);
  motion.jellyVX += (-motion.jellyX * JELLY_PHYSICS.springX - motion.jellyVX * JELLY_PHYSICS.dampingX) * safeDt;
  motion.jellyVY += (-motion.jellyY * JELLY_PHYSICS.springY - motion.jellyVY * JELLY_PHYSICS.dampingY) * safeDt;
  motion.jellyRotateV += (-motion.jellyRotate * JELLY_PHYSICS.rotateSpring - motion.jellyRotateV * JELLY_PHYSICS.rotateDamping) * safeDt;

  motion.jellyX = clamp(motion.jellyX + motion.jellyVX * safeDt, -JELLY_PHYSICS.maxX, JELLY_PHYSICS.maxX);
  motion.jellyY = clamp(motion.jellyY + motion.jellyVY * safeDt, -JELLY_PHYSICS.maxY, JELLY_PHYSICS.maxY);
  motion.jellyRotate = clamp(
    motion.jellyRotate + motion.jellyRotateV * safeDt,
    -JELLY_PHYSICS.maxRotate,
    JELLY_PHYSICS.maxRotate,
  );

  if (family === "drag") {
    const discomfort = motion.dragDiscomfort;
    const dragPullX = clamp(motion.dragVX * (7 + discomfort * 6), -0.9, 0.9);
    const dragPullY = clamp(Math.abs(motion.dragVY) * (5 + discomfort * 3) + discomfort * 0.35, 0, 1.1);
    const dragTwist = clamp(motion.dragVX * (20 + discomfort * 10), -6, 6);
    motion.jellyX = damp(motion.jellyX, dragPullX, safeDt, 9);
    motion.jellyY = damp(motion.jellyY, dragPullY, safeDt, 8);
    motion.jellyRotate = damp(motion.jellyRotate, dragTwist, safeDt, 8);
  }
}

function tickMotion(nowTs) {
  const lastTs = motion.lastTs || nowTs;
  const dtSec = Math.min(0.05, (nowTs - lastTs) / 1000);
  motion.lastTs = nowTs;

  if (!isDragging) {
    const decay = Math.exp(-dtSec * 10);
    motion.dragVX *= decay;
    motion.dragVY *= decay;
  }

  if (isDragging && didDrag) {
    motion.dragDiscomfort = damp(motion.dragDiscomfort, getDragDiscomfort(nowTs), dtSec, 14);
    motion.dragIntensity = damp(
      motion.dragIntensity,
      clamp(Math.hypot(motion.dragVX, motion.dragVY), 0, 1.8),
      dtSec,
      18,
    );
    updateDragReactionVisual();
  } else {
    const stressDecay = Math.exp(-dtSec * 4.5);
    motion.dragStress *= stressDecay;
    motion.dragDiscomfort *= stressDecay;
    motion.dragIntensity = damp(motion.dragIntensity, 0, dtSec, 7);
  }

  const family = getMotionFamily(nowTs);
  const target = getMotionTarget(nowTs, family);
  updateJellyPhysics(dtSec, family);

  const squash = clamp(Math.max(motion.jellyY, 0) * 0.038 + Math.abs(motion.jellyX) * 0.008, 0, 0.09);
  const stretch = clamp(Math.max(-motion.jellyY, 0) * 0.042 + Math.abs(motion.jellyRotate) * 0.002, 0, 0.1);
  target.tx += motion.jellyX * 0.55;
  target.ty += motion.jellyY * 0.72;
  target.rotate += motion.jellyRotate;
  target.scaleX += squash - stretch * 0.42;
  target.scaleY += stretch - squash * 0.95;

  if (family === "drag") {
    const taffy = clamp(Math.abs(motion.dragVX) * 0.05 + Math.abs(motion.dragVY) * 0.03, 0, 0.08);
    const pull = clamp(Math.abs(motion.dragVY) * 0.045, 0, 0.06);
    target.scaleX += taffy + motion.dragDiscomfort * 0.035;
    target.scaleY -= taffy * 0.6 + pull + motion.dragDiscomfort * 0.04;
  }

  motion.tx = damp(motion.tx, target.tx, dtSec, 12);
  motion.ty = damp(motion.ty, target.ty, dtSec, 12);
  motion.rotate = damp(motion.rotate, target.rotate, dtSec, 12);
  motion.scaleX = damp(motion.scaleX, target.scaleX, dtSec, 10);
  motion.scaleY = damp(motion.scaleY, target.scaleY, dtSec, 10);

  updateHatPhysics(dtSec, family);
  setMotionVars(motion.tx, motion.ty, motion.rotate, motion.scaleX, motion.scaleY);
  updateAttachedHatTransform();
  motion.frame = requestAnimationFrame(tickMotion);
}

function attachEyeTracking(objectEl) {
  eyeTarget = null;
  bodyTarget = null;
  shadowTarget = null;

  try {
    const svgDoc = objectEl.contentDocument;
    if (!svgDoc) return;
    eyeTarget = svgDoc.getElementById("eyes-js");
    bodyTarget = svgDoc.getElementById("body-js");
    shadowTarget = svgDoc.getElementById("shadow-js");
  } catch (error) {
    console.warn("Cannot access SVG contentDocument for eye tracking:", error.message);
  }

  syncAttachedHat();
  if (currentHatLayout) setHatLayout(currentHatLayout);
}

function detachEyeTracking() {
  eyeTarget = null;
  bodyTarget = null;
  shadowTarget = null;
}

function clearPendingSwap() {
  if (pendingNext) {
    pendingNext.remove();
    pendingNext = null;
  }
  pendingSwapMeta = null;
}

function createClawdObject(svgFile) {
  const objectEl = document.createElement("object");
  objectEl.className = "clawd-object";
  objectEl.type = "image/svg+xml";
  objectEl.data = `../assets/svg/${svgFile}`;
  objectEl.setAttribute("aria-hidden", "true");
  return objectEl;
}

function finalizeSwap(next, svgFile) {
  if (pendingNext !== next) return;

  const previous = clawdEl;
  const transition = pendingSwapMeta;
  pendingNext = null;
  pendingSwapMeta = null;
  visibleSvgName = svgFile;

  if (previous && previous !== next) {
    previous.removeAttribute("id");
    previous.classList.remove("is-visible");
    previous.classList.add("is-leaving");
    setTimeout(() => {
      if (previous !== clawdEl && previous.isConnected) previous.remove();
    }, CROSSFADE_MS + 40);
  }

  next.id = "clawd";
  clawdEl = next;
  attachEyeTracking(next);

  requestAnimationFrame(() => {
    next.classList.add("is-visible");
    if (transition?.entry) {
      kickJelly(transition.entry);
      kickHat({
        x: -(transition.hat?.x || 0) * 0.45,
        y: -(transition.hat?.y || 0) * 0.55,
        tilt: -(transition.hat?.tilt || 0) * 0.4,
      });
    }
  });
}

function swapToSvg(svgFile, meta = null) {
  if (svgFile === visibleSvgName && !pendingNext) {
    if (meta?.entry) {
      kickJelly(meta.entry);
      kickHat({
        x: -(meta.hat?.x || 0) * 0.45,
        y: -(meta.hat?.y || 0) * 0.55,
        tilt: -(meta.hat?.tilt || 0) * 0.4,
      });
    }
    if (clawdEl) attachEyeTracking(clawdEl);
    return;
  }

  clearPendingSwap();
  const next = createClawdObject(svgFile);
  flipLayer.appendChild(next);
  pendingNext = next;
  pendingSwapMeta = meta;

  let settled = false;
  const commit = () => {
    if (settled) return;
    settled = true;
    finalizeSwap(next, svgFile);
  };

  next.addEventListener("load", commit, { once: true });
  setTimeout(() => {
    if (pendingNext !== next) return;
    try {
      if (!next.contentDocument) {
        next.remove();
        pendingNext = null;
        return;
      }
    } catch {
      next.remove();
      pendingNext = null;
      return;
    }
    commit();
  }, 3000);
}

function cancelReaction() {
  clearHoverIntent();
  clearClickTimer();
  clearReactTimer();
  clearPetHoldTimer();
  clickCount = 0;
  isReacting = false;
  isDragReacting = false;
  isPetting = false;
  currentDragReactionSvg = REACT_DRAG_SVG;
  currentReactionKey = null;
  applyHatLayout(activeStateName, visibleSvgName);
}

function startTimedOverride({ key, svg, duration, layoutState = activeStateName, hatMood = null, transitionStrength = 1 }) {
  clearHoverIntent();
  clearClickTimer();
  clearReactTimer();
  clearPetHoldTimer();
  clickCount = 0;
  isReacting = true;
  currentReactionKey = key;
  detachEyeTracking();
  window.electronAPI.pauseCursorPolling();

  const transition = buildTransitionMeta(activeStateName, layoutState, transitionStrength);
  kickJelly(transition.exit);
  kickHat(transition.hat);
  swapToSvg(svg, transition);
  applyHatLayout(layoutState, svg, createHatVariant(hatMood));

  reactTimer = setTimeout(() => {
    reactTimer = null;
    isReacting = false;
    currentReactionKey = null;
    window.electronAPI.resumeFromReaction();
  }, duration);
}

function playReactionVariant(key) {
  const variant = REACTION_VARIANTS[key];
  if (!variant) return;

  lastReactionKey = key;
  startTimedOverride({
    key,
    svg: variant.svg,
    duration: variant.duration,
    layoutState: activeStateName,
    hatMood: variant.hatMood,
    transitionStrength: 0.95,
  });
}

function playCostumeVariant(key) {
  const variant = COSTUME_VARIANTS[key];
  if (!variant) return;

  lastCostumeKey = key;
  startTimedOverride({
    key: `costume-${key}`,
    svg: variant.svg,
    duration: Math.round(randomBetween(COSTUME_MIN_MS, COSTUME_MAX_MS)),
    layoutState: variant.state,
    hatMood: variant.hatMood,
    transitionStrength: 1.15,
  });
}

function startPettingMode() {
  if (isPetting || isReacting || isDragReacting || miniMode || dndEnabled) return;
  if (!INTERACTABLE_STATES.has(activeStateName)) return;

  clearHoverIntent();
  clearClickTimer();
  clearPetHoldTimer();
  clickCount = 0;
  isPetting = true;
  currentReactionKey = "petting";
  detachEyeTracking();
  window.electronAPI.pauseCursorPolling();

  const transition = buildTransitionMeta(activeStateName, PETTING_VARIANT.state, 0.9);
  kickJelly(transition.exit);
  kickHat({ x: 0, y: -0.18, tilt: 0.5 });
  swapToSvg(PETTING_VARIANT.svg, transition);
  applyHatLayout(PETTING_VARIANT.state, PETTING_VARIANT.svg, createHatVariant(PETTING_VARIANT.hatMood));
}

function stopPettingMode(shouldResume = true) {
  if (!isPetting) return;
  isPetting = false;
  currentReactionKey = null;
  if (shouldResume) {
    window.electronAPI.resumeFromReaction();
  }
}

function maybeTriggerHoverReaction() {
  if (!canPlayReaction()) return;
  if (Date.now() - lastHoverReactionAt < HOVER_REACTION_COOLDOWN_MS) return;
  if (Math.random() > HOVER_REACTION_CHANCE) return;

  clearHoverIntent();
  hoverIntentTimer = setTimeout(() => {
    hoverIntentTimer = null;
    if (!canPlayReaction()) return;
    if (Math.random() < HOVER_COSTUME_CHANCE) {
      const costumeKey = pickReactionKey(COSTUME_POOL, lastCostumeKey);
      if (costumeKey) {
        lastHoverReactionAt = Date.now();
        playCostumeVariant(costumeKey);
        return;
      }
    }
    const key = pickReactionKey(HOVER_REACTION_POOL);
    if (!key) return;
    lastHoverReactionAt = Date.now();
    playReactionVariant(key);
  }, HOVER_REACTION_DELAY_MS);
}

function handleHoverChange(over) {
  if (!over) {
    clearHoverIntent();
    return;
  }
  maybeTriggerHoverReaction();
}

function startDragReaction() {
  if (isDragReacting || dndEnabled) return;

  clearHoverIntent();
  clearPetHoldTimer();
  clearClickTimer();
  clickCount = 0;

  if (isReacting) {
    clearReactTimer();
    isReacting = false;
    currentReactionKey = null;
  }
  if (isPetting) {
    isPetting = false;
    currentReactionKey = null;
  }

  isDragReacting = true;
  detachEyeTracking();
  window.electronAPI.pauseCursorPolling();
  motion.dragStartedAt = performance.now();
  currentDragReactionSvg = REACT_DRAG_SVG;
  updateDragReactionVisual(true);
}

function endDragReaction(shouldResume = true) {
  if (!isDragReacting) return;
  isDragReacting = false;
  currentDragReactionSvg = REACT_DRAG_SVG;
  currentReactionKey = null;
  applyHatLayout(activeStateName, visibleSvgName);
  if (shouldResume) {
    window.electronAPI.resumeFromReaction();
  }
}

function applyMainState(state, svg) {
  const previousState = activeStateName;
  activeStateName = state;

  if (isDragging) {
    deferredRendererState = { state, svg };
    return;
  }

  deferredRendererState = null;
  cancelReaction();
  const transition = buildTransitionMeta(previousState, state);
  kickJelly(transition.exit);
  kickHat(transition.hat);
  swapToSvg(svg, transition);
  applyHatLayout(state, svg);
}

function handleClick() {
  if (miniMode) {
    window.electronAPI.exitMiniMode();
    return;
  }
  clearHoverIntent();
  if (!canPlayReaction()) return;

  clickCount += 1;
  clearClickTimer();

  clickTimer = setTimeout(() => {
    const burstCount = clickCount;
    clickTimer = null;
    clickCount = 0;
    if (!canPlayReaction()) return;
    if (burstCount >= 3) {
      const costumeKey = pickReactionKey(COSTUME_POOL, lastCostumeKey);
      if (costumeKey) playCostumeVariant(costumeKey);
      return;
    }
    if (burstCount === 2) {
      const key = pickReactionKey(DOUBLE_REACTION_POOL);
      if (key) playReactionVariant(key);
      return;
    }
    const key = pickReactionKey(CLICK_REACTION_POOL);
    if (key) playReactionVariant(key);
  }, CLICK_WINDOW_MS);
}

function stopDrag() {
  if (!isDragging) return;

  isDragging = false;
  clearPetHoldTimer();
  container.classList.remove("dragging");
  window.electronAPI.dragLock(false);

  if (pendingDx !== 0 || pendingDy !== 0) {
    if (dragRAF) {
      cancelAnimationFrame(dragRAF);
      dragRAF = null;
    }
    window.electronAPI.moveWindowBy(pendingDx, pendingDy);
    pendingDx = 0;
    pendingDy = 0;
  }

  const releaseWeight = clamp(
    Math.max(motion.dragDiscomfort, motion.dragIntensity * 0.6),
    0,
    1,
  );
  motion.releaseVX = motion.dragVX;
  motion.releaseVY = motion.dragVY;
  motion.settleStrength = 1 + releaseWeight * 0.9;
  motion.settleDuration = SETTLE_BASE_MS + Math.round(SETTLE_EXTRA_MS * releaseWeight);
  motion.settleUntil = performance.now() + motion.settleDuration;
  motion.lastPointerTs = 0;
  motion.dragStartedAt = 0;
  motion.dragStress = 0;
  motion.dragDiscomfort = 0;
  motion.dragIntensity = 0;
  kickJelly({
    x: motion.releaseVX * 12,
    y: 9 + releaseWeight * 9,
    rotate: motion.releaseVX * 48,
  });
  kickHat({
    x: motion.releaseVX * 0.08,
    y: -(0.16 + releaseWeight * 0.18),
    tilt: motion.releaseVX * 1.2,
  });

  const wasDrag = didDrag;
  const wasPetting = isPetting;
  const deferred = deferredRendererState;
  deferredRendererState = null;
  const hadDragReaction = isDragReacting;

  if (wasPetting) {
    stopPettingMode(false);
  }

  if (wasDrag) {
    window.electronAPI.dragEnd();
  }

  if (hadDragReaction) {
    endDragReaction(false);
    window.electronAPI.resumeFromReaction();
  } else if (deferred) {
    applyMainState(deferred.state, deferred.svg);
  } else if (wasPetting) {
    window.electronAPI.resumeFromReaction();
  }

  didDrag = false;
}

container.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  clearHoverIntent();
  if (miniMode) {
    didDrag = false;
    return;
  }

  container.setPointerCapture(event.pointerId);
  isDragging = true;
  didDrag = false;
  lastScreenX = event.screenX;
  lastScreenY = event.screenY;
  mouseDownX = event.clientX;
  mouseDownY = event.clientY;
  pendingDx = 0;
  pendingDy = 0;
  motion.dragVX = 0;
  motion.dragVY = 0;
  motion.releaseVX = 0;
  motion.releaseVY = 0;
  motion.settleDuration = SETTLE_BASE_MS;
  motion.settleStrength = 1;
  motion.settleUntil = 0;
  motion.lastPointerTs = 0;
  motion.dragStartedAt = 0;
  motion.dragStress = 0;
  motion.dragDiscomfort = 0;
  motion.dragIntensity = 0;
  kickJelly({ y: 6, rotate: facingLeft ? 4 : -4 });
  clearPetHoldTimer();
  petHoldTimer = setTimeout(() => {
    petHoldTimer = null;
    if (!isDragging || didDrag) return;
    startPettingMode();
  }, LONG_PRESS_MS);
  window.electronAPI.dragLock(true);
  container.classList.add("dragging");
});

document.addEventListener("pointermove", (event) => {
  if (!isDragging) return;

  const dx = event.screenX - lastScreenX;
  const dy = event.screenY - lastScreenY;
  pendingDx += dx;
  pendingDy += dy;
  lastScreenX = event.screenX;
  lastScreenY = event.screenY;

  const now = performance.now();
  const dt = motion.lastPointerTs ? Math.max(8, now - motion.lastPointerTs) : 16;
  motion.lastPointerTs = now;
  motion.dragVX = damp(motion.dragVX, dx / dt, dt / 1000, 18);
  motion.dragVY = damp(motion.dragVY, dy / dt, dt / 1000, 18);
  const pointerSpeed = Math.hypot(dx, dy) / dt;
  const yank = clamp((pointerSpeed - 0.45) / 0.95, 0, 1);
  const tug = clamp((Math.hypot(dx, dy) - 3) / 18, 0, 1);
  motion.dragStress = clamp(
    motion.dragStress * Math.exp(-(dt / 1000) * 7) + yank * 0.18 + tug * 0.05,
    0,
    1,
  );

  if (!didDrag) {
    const totalDx = event.clientX - mouseDownX;
    const totalDy = event.clientY - mouseDownY;
    if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
      clearPetHoldTimer();
      didDrag = true;
      startDragReaction();
    }
  }

  if (didDrag) {
    motion.dragDiscomfort = getDragDiscomfort(now);
    updateDragReactionVisual();
  }

  if (!dragRAF) {
    dragRAF = requestAnimationFrame(() => {
      window.electronAPI.moveWindowBy(pendingDx, pendingDy);
      pendingDx = 0;
      pendingDy = 0;
      dragRAF = null;
    });
  }
});

document.addEventListener("pointerup", (event) => {
  if (event.button !== 0) return;
  const wasDrag = didDrag;
  const wasPetting = isPetting;
  stopDrag();
  if (!wasDrag && !wasPetting) {
    handleClick();
  }
});

container.addEventListener("pointercancel", stopDrag);
container.addEventListener("lostpointercapture", () => {
  if (isDragging) stopDrag();
});
window.addEventListener("blur", stopDrag);

window.electronAPI.onDndChange((enabled) => {
  dndEnabled = enabled;
  if (enabled) {
    clearHoverIntent();
    clearPetHoldTimer();
    if (isPetting) stopPettingMode(true);
  }
});

window.electronAPI.onMiniModeChange((enabled) => {
  miniMode = enabled;
  container.style.cursor = enabled ? "default" : "";
  if (enabled) {
    clearPetHoldTimer();
    if (isPetting) stopPettingMode(true);
  }
  applyHatLayout(activeStateName, visibleSvgName);
});

window.electronAPI.onHoverChange((over) => {
  handleHoverChange(over);
});

window.electronAPI.onStateChange((state, svg) => {
  applyMainState(state, svg);
});

window.electronAPI.onEyeMove((dx, dy) => {
  const eyeDx = facingLeft ? -dx : dx;
  if (eyeTarget) {
    eyeTarget.style.transform = `translate(${eyeDx}px, ${dy}px)`;
  }
  if (bodyTarget || shadowTarget) {
    const bodyDx = Math.round(eyeDx * 0.33 * 2) / 2;
    const bodyDy = Math.round(dy * 0.33 * 2) / 2;
    if (bodyTarget) bodyTarget.style.transform = `translate(${bodyDx}px, ${bodyDy}px)`;
    if (shadowTarget) {
      const absDx = Math.abs(bodyDx);
      const scaleX = 1 + absDx * 0.15;
      const shiftX = Math.round(bodyDx * 0.3 * 2) / 2;
      shadowTarget.style.transform = `translate(${shiftX}px, 0) scaleX(${scaleX})`;
    }
  }
});

window.electronAPI.onWakeFromDoze(() => {
  if (!clawdEl || !clawdEl.contentDocument) return;
  try {
    const eyes = clawdEl.contentDocument.getElementById("eyes-doze");
    if (eyes) eyes.style.transform = "scaleY(1)";
  } catch {}
});

window.electronAPI.onDirectionChange((dir) => {
  facingLeft = dir === "left";
  applyFacingTransform();
});

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  window.electronAPI.showContextMenu();
});

applyFacingTransform();
setMotionVars(0, 0, 0, 1, 1);
applyHatLayout();
motion.frame = requestAnimationFrame(tickMotion);

if (clawdEl) {
  const initialObject = clawdEl;
  const ready = () => {
    if (clawdEl === initialObject) attachEyeTracking(initialObject);
  };
  if (initialObject.contentDocument) {
    ready();
  } else {
    initialObject.addEventListener("load", ready, { once: true });
    setTimeout(ready, 3000);
  }
}
