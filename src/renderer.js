const container = document.getElementById("pet-container");
const motionLayer = document.getElementById("pet-motion");
const flipLayer = document.getElementById("pet-flip");

const CLICK_WINDOW_MS = 400;
const CROSSFADE_MS = 140;
const DRAG_THRESHOLD = 3;
const REACT_LEFT_SVG = "clawd-react-left.svg";
const REACT_RIGHT_SVG = "clawd-react-right.svg";
const REACT_DOUBLE_SVG = "clawd-react-double.svg";
const REACT_DRAG_SVG = "clawd-react-drag.svg";
const REACT_SINGLE_DURATION = 2500;
const REACT_DOUBLE_DURATION = 3500;
const DRAG_REACT_SVGS = [REACT_DRAG_SVG];

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
let firstClickDir = null;
let isReacting = false;
let isDragReacting = false;
let reactTimer = null;
let lastDragSvgIdx = 0;

let clawdEl = document.getElementById("clawd");
let pendingNext = null;
let visibleSvgName = "clawd-idle-follow.svg";
let activeStateName = "idle";
let deferredRendererState = null;

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
  tx: 0,
  ty: 0,
  rotate: 0,
  scaleX: 1,
  scaleY: 1,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

function getMotionFamily(nowTs) {
  if (isDragging && didDrag) return "drag";
  if (isDragging) return "press";
  if (motion.settleUntil > nowTs) return "settle";

  switch (activeStateName) {
    case "walking":
      return "walk";
    case "running":
      return "run";
    case "idle":
    case "living":
    case "reading":
    case "coding":
    case "sunbathing":
    case "dozing":
    case "mini-idle":
    case "mini-peek":
    case "mini-sleep":
      return "idle";
    default:
      return "busy";
  }
}

function getMotionTarget(nowTs) {
  const family = getMotionFamily(nowTs);
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
  }

  if (family === "press") {
    ty += 1.25;
    rotate += facingLeft ? 1.5 : -1.5;
    scaleX += 0.03;
    scaleY -= 0.03;
  }

  if (family === "drag") {
    const speed = clamp(Math.hypot(motion.dragVX, motion.dragVY), 0, 1.6);
    tx += clamp(motion.dragVX * 14, -10, 10);
    ty += 1 + clamp(Math.abs(motion.dragVY) * 7, 0, 6);
    rotate += clamp(motion.dragVX * 15, -10, 10);
    scaleX += 0.035 + speed * 0.03;
    scaleY -= 0.04 + speed * 0.025;
  } else if (family === "settle") {
    const remain = clamp((motion.settleUntil - nowTs) / 220, 0, 1);
    const bounce = Math.sin((1 - remain) * Math.PI);
    tx += motion.releaseVX * 10 * remain;
    ty -= bounce * 2.2 * remain;
    rotate += motion.releaseVX * 10 * remain;
    scaleX += 0.04 * remain;
    scaleY -= 0.04 * remain;
  }

  return { tx, ty, rotate, scaleX, scaleY };
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

  const target = getMotionTarget(nowTs);
  motion.tx = damp(motion.tx, target.tx, dtSec, 12);
  motion.ty = damp(motion.ty, target.ty, dtSec, 12);
  motion.rotate = damp(motion.rotate, target.rotate, dtSec, 12);
  motion.scaleX = damp(motion.scaleX, target.scaleX, dtSec, 10);
  motion.scaleY = damp(motion.scaleY, target.scaleY, dtSec, 10);

  setMotionVars(motion.tx, motion.ty, motion.rotate, motion.scaleX, motion.scaleY);
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
  pendingNext = null;
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
  });
}

function swapToSvg(svgFile) {
  if (svgFile === visibleSvgName && !pendingNext) {
    if (clawdEl) attachEyeTracking(clawdEl);
    return;
  }

  clearPendingSwap();
  const next = createClawdObject(svgFile);
  flipLayer.appendChild(next);
  pendingNext = next;

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
  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }
  if (reactTimer) {
    clearTimeout(reactTimer);
    reactTimer = null;
  }
  clickCount = 0;
  firstClickDir = null;
  isReacting = false;
  isDragReacting = false;
}

function playReaction(svgFile, durationMs) {
  isReacting = true;
  detachEyeTracking();
  window.electronAPI.pauseCursorPolling();
  swapToSvg(svgFile);

  reactTimer = setTimeout(() => {
    reactTimer = null;
    isReacting = false;
    window.electronAPI.resumeFromReaction();
  }, durationMs);
}

function startDragReaction() {
  if (isDragReacting || dndEnabled) return;

  if (isReacting) {
    if (reactTimer) {
      clearTimeout(reactTimer);
      reactTimer = null;
    }
    isReacting = false;
  }

  isDragReacting = true;
  detachEyeTracking();
  window.electronAPI.pauseCursorPolling();

  const svgFile = DRAG_REACT_SVGS[lastDragSvgIdx % DRAG_REACT_SVGS.length];
  lastDragSvgIdx += 1;
  swapToSvg(svgFile);
}

function endDragReaction(shouldResume = true) {
  if (!isDragReacting) return;
  isDragReacting = false;
  if (shouldResume) {
    window.electronAPI.resumeFromReaction();
  }
}

function applyMainState(state, svg) {
  activeStateName = state;

  if (isDragging) {
    deferredRendererState = { state, svg };
    return;
  }

  deferredRendererState = null;
  cancelReaction();
  swapToSvg(svg);
}

function handleClick(clientX) {
  if (miniMode) {
    window.electronAPI.exitMiniMode();
    return;
  }
  if (isReacting || isDragReacting) return;
  if (visibleSvgName !== "clawd-idle-follow.svg") return;

  clickCount += 1;
  if (clickCount === 1) {
    firstClickDir = clientX < container.offsetWidth / 2 ? "left" : "right";
  }

  if (clickTimer) {
    clearTimeout(clickTimer);
    clickTimer = null;
  }

  if (clickCount >= 4) {
    clickCount = 0;
    firstClickDir = null;
    playReaction(REACT_DOUBLE_SVG, REACT_DOUBLE_DURATION);
    return;
  }

  if (clickCount >= 2) {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      const svgFile = firstClickDir === "left" ? REACT_LEFT_SVG : REACT_RIGHT_SVG;
      clickCount = 0;
      firstClickDir = null;
      playReaction(svgFile, REACT_SINGLE_DURATION);
    }, CLICK_WINDOW_MS);
    return;
  }

  clickTimer = setTimeout(() => {
    clickTimer = null;
    clickCount = 0;
    firstClickDir = null;
  }, CLICK_WINDOW_MS);
}

function stopDrag() {
  if (!isDragging) return;

  isDragging = false;
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

  motion.releaseVX = motion.dragVX;
  motion.releaseVY = motion.dragVY;
  motion.settleUntil = performance.now() + 220;

  const wasDrag = didDrag;
  const deferred = deferredRendererState;
  deferredRendererState = null;
  const hadDragReaction = isDragReacting;

  if (wasDrag) {
    window.electronAPI.dragEnd();
  }

  if (hadDragReaction) {
    endDragReaction(false);
    window.electronAPI.resumeFromReaction();
  } else if (deferred) {
    applyMainState(deferred.state, deferred.svg);
  }

  didDrag = false;
}

container.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
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
  motion.settleUntil = 0;
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

  if (!didDrag) {
    const totalDx = event.clientX - mouseDownX;
    const totalDy = event.clientY - mouseDownY;
    if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
      didDrag = true;
      startDragReaction();
    }
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
  stopDrag();
  if (!wasDrag) {
    handleClick(event.clientX);
  }
});

container.addEventListener("pointercancel", stopDrag);
container.addEventListener("lostpointercapture", () => {
  if (isDragging) stopDrag();
});
window.addEventListener("blur", stopDrag);

window.electronAPI.onDndChange((enabled) => {
  dndEnabled = enabled;
});

window.electronAPI.onMiniModeChange((enabled) => {
  miniMode = enabled;
  container.style.cursor = enabled ? "default" : "";
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
