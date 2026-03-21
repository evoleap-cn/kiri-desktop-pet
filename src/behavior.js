// ── Autonomous Behavior Engine for Clawd ──
// Manages idle personality: wandering, cursor interaction, resting, living animations.
// Only active when pet is idle (no external hook activity, not DND, not mini mode).

const WALK_SPEED = 70;   // px/sec
const RUN_SPEED = 180;   // px/sec
const TICK_MS = 16;       // ~60fps movement
const BOTTOM_MARGIN = 20; // px from screen bottom
const ROAM_EDGE_MARGIN = 10;
const CROSS_DISPLAY_BOTTOM_TOLERANCE = 120;
const INITIAL_SETTLE_MS = 18000;
const CURSOR_RECENT_MS = 7000;
const QUIET_DOZE_MS = 45000;
const CURSOR_INTEREST_DIST = 260;
const CURSOR_CHASE_SPEED = 180;
const CURSOR_ACTIVE_SPEED = 45;
const CURSOR_DODGE_SPEED = 240;
const CURSOR_DODGE_DIST = 135;
const CURSOR_DODGE_COOLDOWN_MS = 9000;
const EDGE_HIDE_POP_DISTANCE = 180;

// Behavior definitions: { weight, durationRange, interruptible }
// Weights tuned for a calm, pet-like personality:
//   - High weight for calm/static states (reading, coding, sunbathing)
//   - Medium weight for idle breathing and looking around
//   - Low weight for active behaviors (wandering, chasing)
const BEHAVIORS = {
  "idle-breathe":  { weight: 22, duration: [10000, 25000], interruptible: true },
  "idle-living":   { weight: 14, duration: [16000, 16000], interruptible: true },
  "sitting":       { weight: 15, duration: [12000, 22000], interruptible: true },
  "coffee":        { weight: 9,  duration: [9000, 18000],  interruptible: true },
  "writing":       { weight: 12, duration: [12000, 22000], interruptible: true },
  "snacking":      { weight: 11, duration: [9000, 17000],  interruptible: true },
  "dressing":      { weight: 7,  duration: [8000, 14000],  interruptible: true },
  "ball":          { weight: 6,  duration: [7000, 13000],  interruptible: true },
  "vacation":      { weight: 7,  duration: [18000, 32000], interruptible: true },
  "reading":       { weight: 16, duration: [20000, 45000], interruptible: true },
  "coding":        { weight: 14, duration: [20000, 40000], interruptible: true },
  "sunbathing":    { weight: 10, duration: [25000, 50000], interruptible: true },
  "bathing":       { weight: 9,  duration: [22000, 42000], interruptible: true },
  "bubbles":       { weight: 8,  duration: [16000, 32000], interruptible: true },
  "idle-nod":      { weight: 9,  duration: [12000, 24000], interruptible: true },
  "tea":           { weight: 10, duration: [12000, 22000], interruptible: true },
  "painting":      { weight: 9,  duration: [14000, 24000], interruptible: true },
  "gardening":     { weight: 8,  duration: [12000, 22000], interruptible: true },
  "fishing":       { weight: 7,  duration: [18000, 32000], interruptible: true },
  "knitting":      { weight: 10, duration: [14000, 26000], interruptible: true },
  "music":         { weight: 9,  duration: [12000, 22000], interruptible: true },
  "meditating":    { weight: 8,  duration: [18000, 32000], interruptible: true },
  "stargazing":    { weight: 7,  duration: [18000, 32000], interruptible: true },
  "skateboard":    { weight: 5,  duration: [7000, 14000],  interruptible: true },
  "dancing":       { weight: 6,  duration: [8000, 16000],  interruptible: true },
  "jumping-rope":  { weight: 5,  duration: [7000, 12000],  interruptible: true },
  "cooking":       { weight: 6,  duration: [10000, 18000], interruptible: true },
  "sweeping-floor": { weight: 5, duration: [8000, 15000],  interruptible: true },
  "exercising":    { weight: 5,  duration: [7000, 12000],  interruptible: true },
  "yoga":          { weight: 8,  duration: [14000, 26000], interruptible: true },
  "edge-hide":     { weight: 5,  duration: [9000, 18000], interruptible: true },
  "wander-short":  { weight: 10, duration: [4000, 8000],   interruptible: true },
  "wander-long":   { weight: 4,  duration: [8000, 15000],  interruptible: true },
  "chase-cursor":  { weight: 6,  duration: [4000, 10000],  interruptible: true },
  "flee-cursor":   { weight: 0,  duration: [2000, 4000],   interruptible: true },
  "notice-cursor": { weight: 8,  duration: [3000, 5000],   interruptible: true },
  "rest-doze":     { weight: 8,  duration: [15000, 35000], interruptible: true },
  "play-bounce":   { weight: 0,  duration: [4000, 4000],   interruptible: false },
};

const RESTFUL_BEHAVIORS = new Set([
  "idle-breathe", "idle-living", "rest-doze", "reading", "sunbathing", "coding",
  "sitting", "coffee", "writing", "snacking", "dressing", "vacation",
  "bathing", "idle-nod", "bubbles", "tea", "painting", "gardening",
  "fishing", "knitting", "music", "meditating", "stargazing", "yoga",
]);

const ACTIVE_BEHAVIORS = new Set([
  "wander-long", "chase-cursor", "flee-cursor", "play-bounce", "ball", "edge-hide",
  "skateboard", "dancing", "jumping-rope", "cooking", "sweeping-floor", "exercising",
]);

const SETTLING_BLOCKED_BEHAVIORS = new Set([
  "sitting", "coffee", "writing", "snacking", "dressing", "ball", "vacation",
  "reading", "coding", "sunbathing", "bathing", "bubbles", "idle-nod", "tea",
  "painting", "gardening", "fishing", "knitting", "music", "meditating",
  "stargazing", "skateboard", "dancing", "jumping-rope", "cooking",
  "sweeping-floor", "exercising", "yoga", "edge-hide", "wander-short",
  "wander-long", "notice-cursor", "chase-cursor", "rest-doze",
]);

const CURSOR_SUPPRESSED_BEHAVIORS = new Set([
  "coffee", "writing", "snacking", "dressing", "vacation", "reading", "coding",
  "sunbathing", "bathing", "bubbles", "idle-nod", "tea", "painting", "gardening",
  "fishing", "knitting", "music", "meditating", "stargazing", "yoga", "edge-hide",
]);

const QUIET_BOOST_BEHAVIORS = new Set([
  "idle-breathe", "sitting", "coffee", "writing", "snacking", "dressing",
  "vacation", "reading", "coding", "bathing", "bubbles", "idle-nod", "tea",
  "painting", "gardening", "fishing", "knitting", "music", "meditating",
  "stargazing", "yoga", "edge-hide",
]);

const SCHEDULE_INTERVAL = [10000, 28000]; // ms between behaviors — calm, unhurried
const TIREDNESS_THRESHOLD = 12 * 60 * 1000; // 12 min → yield to sleep sequence

function smoothstep(t) {
  const clamped = Math.max(0, Math.min(1, t));
  return clamped * clamped * (3 - 2 * clamped);
}

class BehaviorEngine {
  constructor(opts) {
    this._applyState = opts.applyState;       // (state, svgFile) => void
    this._getWindowBounds = opts.getWindowBounds; // () => {x, y, width, height}
    this._setWindowPosition = opts.setWindowPosition; // (x, y) => void
    this._getCursorPos = opts.getCursorPos;    // () => {x, y}
    this._getAllDisplays = opts.getAllDisplays;  // () => [{ workArea: {x,y,width,height} }]
    this._sendDirection = opts.sendDirection;    // (dir: 'left'|'right') => void
    this._triggerSleep = opts.triggerSleep;      // () => void — yield to sleep sequence

    this._running = false;
    this._paused = false;
    this._scheduleTimer = null;
    this._behaviorTimer = null;
    this._moveTimer = null;
    this._currentBehavior = null;
    this._moving = false;
    this._targetX = 0;
    this._targetY = 0;
    this._moveSpeed = WALK_SPEED;
    this._moveOriginX = 0;
    this._moveOriginY = 0;
    this._moveDistance = 0;
    this._lastMoveTick = 0;
    this._moveComplete = null;
    this._direction = "right";
    this._tiredness = 0;
    this._lastTickTime = Date.now();
    this._cursorVelocity = 0;
    this._lastCursorX = null;
    this._lastCursorY = null;
    this._lastCursorTime = 0;
    this._startleTimeout = null;
    this._startedAt = 0;
    this._lastCursorActiveAt = 0;
    this._lastCursorNearAt = 0;
    this._cursorDistance = Infinity;
    this._skittishCooldownUntil = 0;
  }

  start() {
    if (this._running) return;
    this._running = true;
    this._paused = false;
    this._tiredness = 0;
    this._lastTickTime = Date.now();
    this._startedAt = this._lastTickTime;
    this._lastCursorActiveAt = this._lastTickTime;
    this._lastCursorNearAt = 0;
    this._cursorDistance = Infinity;
    this._skittishCooldownUntil = 0;
    this._scheduleNext();
  }

  stop() {
    this._running = false;
    this._paused = false;
    this._clearAll();
  }

  pause() {
    if (!this._running) return;
    this._paused = true;
    this._stopMovement();
    if (this._scheduleTimer) { clearTimeout(this._scheduleTimer); this._scheduleTimer = null; }
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
  }

  resume() {
    if (!this._running || !this._paused) return;
    this._paused = false;
    this._currentBehavior = null;
    this._scheduleNext();
  }

  // Called from main tick (~50ms) with cursor data for reactive behaviors
  tick(cursor) {
    if (!this._running || this._paused) return;

    const now = Date.now();
    // Compute cursor velocity
    if (this._lastCursorX !== null) {
      const dt = (now - this._lastCursorTime) / 1000;
      if (dt > 0) {
        const dx = cursor.x - this._lastCursorX;
        const dy = cursor.y - this._lastCursorY;
        this._cursorVelocity = Math.sqrt(dx * dx + dy * dy) / dt;
      }
    }
    this._lastCursorX = cursor.x;
    this._lastCursorY = cursor.y;
    this._lastCursorTime = now;

    // Update tiredness
    this._tiredness += now - this._lastTickTime;
    this._lastTickTime = now;

    // Check tiredness → yield to sleep
    if (this._tiredness >= TIREDNESS_THRESHOLD) {
      this.stop();
      this._triggerSleep();
      return;
    }

    // Reactive: startle when cursor rushes toward pet
    if (!this._startleTimeout && this._currentBehavior !== "flee-cursor") {
      const bounds = this._getWindowBounds();
      const petCX = bounds.x + bounds.width / 2;
      const petCY = bounds.y + bounds.height / 2;
      const dist = Math.sqrt((cursor.x - petCX) ** 2 + (cursor.y - petCY) ** 2);
      this._cursorDistance = dist;

      if (dist < CURSOR_INTEREST_DIST) {
        this._lastCursorNearAt = now;
      }
      if (this._cursorVelocity > CURSOR_ACTIVE_SPEED || dist < CURSOR_INTEREST_DIST) {
        this._lastCursorActiveAt = now;
      }

      if (this._cursorVelocity > 600 && dist < 200) {
        this._triggerStarle(cursor);
        return;
      }

      if (this._shouldSkittishStep(now, dist)) {
        this._executeSkittishStep(cursor);
      }

      if ((this._currentBehavior === "edge-hide-left" || this._currentBehavior === "edge-hide-right")
          && dist < EDGE_HIDE_POP_DISTANCE) {
        this._stopCurrentBehavior();
        this._scheduleNext();
      }
    }
  }

  _shouldSkittishStep(now, dist) {
    if (now - this._startedAt < INITIAL_SETTLE_MS) return false;
    if (now < this._skittishCooldownUntil) return false;
    if (this._moving) return false;
    if (this._cursorVelocity < CURSOR_DODGE_SPEED || this._cursorVelocity > 700) return false;
    if (dist > CURSOR_DODGE_DIST) return false;
    if (this._currentBehavior === "startle" || this._currentBehavior === "flee-cursor"
        || this._currentBehavior === "walking" || this._currentBehavior === "running"
        || this._currentBehavior === "skittish-step") {
      return false;
    }
    return true;
  }

  _triggerStarle(cursor) {
    // Interrupt current behavior
    this._stopCurrentBehavior();
    this._startleTimeout = setTimeout(() => { this._startleTimeout = null; }, 2000);

    // Play startle, then flee
    this._applyState("startle", "clawd-startle.svg");
    this._currentBehavior = "startle";
    this._behaviorTimer = setTimeout(() => {
      this._executeFlee(cursor);
    }, 800);
  }

  _clearAll() {
    if (this._scheduleTimer) { clearTimeout(this._scheduleTimer); this._scheduleTimer = null; }
    if (this._behaviorTimer) { clearTimeout(this._behaviorTimer); this._behaviorTimer = null; }
    if (this._startleTimeout) { clearTimeout(this._startleTimeout); this._startleTimeout = null; }
    this._stopMovement();
    this._currentBehavior = null;
  }

  _scheduleNext() {
    if (!this._running || this._paused) return;
    const delay = SCHEDULE_INTERVAL[0] + Math.random() * (SCHEDULE_INTERVAL[1] - SCHEDULE_INTERVAL[0]);
    this._scheduleTimer = setTimeout(() => {
      this._scheduleTimer = null;
      if (!this._running || this._paused) return;
      this._pickAndExecute();
    }, delay);
  }

  _pickAndExecute() {
    const behavior = this._pickBehavior();
    this._executeBehavior(behavior);
  }

  _pickBehavior() {
    // Adjust weights based on tiredness
    const now = Date.now();
    const tiredRatio = Math.min(1, this._tiredness / TIREDNESS_THRESHOLD);
    const settling = now - this._startedAt < INITIAL_SETTLE_MS;
    const recentCursor = now - this._lastCursorActiveAt < CURSOR_RECENT_MS;
    const recentCursorNear = now - this._lastCursorNearAt < CURSOR_RECENT_MS;
    const quietLongEnough = now - this._lastCursorActiveAt > QUIET_DOZE_MS;
    const adjusted = {};
    for (const [name, def] of Object.entries(BEHAVIORS)) {
      let w = def.weight;
      if (w <= 0) {
        adjusted[name] = 0;
        continue;
      }
      // When tired, boost calm/rest behaviors and reduce active ones
      if (RESTFUL_BEHAVIORS.has(name)) {
        w += w * tiredRatio * 2;
      } else if (ACTIVE_BEHAVIORS.has(name)) {
        w *= (1 - tiredRatio * 0.7);
      }

      // Give Clawd time to settle before autonomous antics start.
      if (settling && SETTLING_BLOCKED_BEHAVIORS.has(name)) {
        w = 0;
      }

      // Cursor-aware states should only happen when the cursor was recently active nearby.
      if (name === "notice-cursor") {
        w = recentCursorNear ? w * 1.4 : 0;
      }
      if (name === "chase-cursor") {
        w = (recentCursorNear && this._cursorVelocity >= CURSOR_CHASE_SPEED) ? w : 0;
      }

      // Dozing should feel earned, not random.
      if (name === "rest-doze" && !(quietLongEnough || tiredRatio >= 0.55)) {
        w = 0;
      }
      if (name === "edge-hide" && recentCursorNear) {
        w = 0;
      }

      // When the cursor is active nearby, keep the pet attentive rather than lounging.
      if (recentCursor && CURSOR_SUPPRESSED_BEHAVIORS.has(name)) {
        w *= 0.45;
      }
      if (!recentCursor && QUIET_BOOST_BEHAVIORS.has(name)) {
        w *= 1.15;
      }

      adjusted[name] = w;
    }

    const total = Object.values(adjusted).reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (const [name, w] of Object.entries(adjusted)) {
      r -= w;
      if (r <= 0) return name;
    }
    return "idle-breathe"; // fallback
  }

  _executeBehavior(name) {
    this._currentBehavior = name;
    const def = BEHAVIORS[name];
    const duration = def.duration[0] + Math.random() * (def.duration[1] - def.duration[0]);

    switch (name) {
      case "idle-breathe":
        this._applyState("idle", "clawd-idle-follow.svg");
        this._restTiredness(duration);
        break;

      case "idle-living":
        this._applyState("living", "clawd-idle-living.svg");
        break;

      case "sitting":
        this._applyState("sitting", "clawd-sitting.svg");
        this._restTiredness(duration);
        break;

      case "coffee":
        this._applyState("coffee", "clawd-coffee.svg");
        this._restTiredness(duration);
        break;

      case "writing":
        this._applyState("writing", "clawd-writing.svg");
        this._restTiredness(duration);
        break;

      case "snacking":
        this._applyState("snacking", "clawd-snacking.svg");
        this._restTiredness(duration * 0.45);
        break;

      case "dressing":
        this._applyState("dressing", "clawd-dressing.svg");
        this._restTiredness(duration * 0.3);
        break;

      case "ball":
        this._applyState("ball", "clawd-ball-play.svg");
        break;

      case "vacation":
        this._applyState("vacation", "clawd-vacation.svg");
        this._restTiredness(duration * 0.7);
        break;

      case "wander-short":
        this._executeWander(100, 300, WALK_SPEED);
        break;

      case "wander-long":
        this._executeWander(400, 800, WALK_SPEED);
        break;

      case "chase-cursor": {
        const cursor = this._getCursorPos();
        this._executeChaseCursor(cursor);
        return; // chase manages its own timer
      }

      case "flee-cursor": {
        const cursor = this._getCursorPos();
        this._executeFlee(cursor);
        return; // flee manages its own timer
      }

      case "notice-cursor":
        // Just sit and look at cursor (eye tracking does the work)
        this._applyState("idle", "clawd-idle-follow.svg");
        break;

      case "reading":
        this._applyState("reading", "clawd-reading.svg");
        this._restTiredness(duration);
        break;

      case "coding":
        this._applyState("coding", "clawd-coding.svg");
        this._restTiredness(duration);
        break;

      case "sunbathing":
        this._applyState("sunbathing", "clawd-sunbathing.svg");
        this._restTiredness(duration);
        break;

      case "bathing":
        this._applyState("bathing", "clawd-bathing.svg");
        this._restTiredness(duration * 0.8);
        break;

      case "bubbles":
        this._applyState("bubbles", "clawd-bubbles.svg");
        this._restTiredness(duration * 0.55);
        break;

      case "idle-nod":
        this._applyState("idle-nod", "clawd-idle-nod.svg");
        this._restTiredness(duration * 0.75);
        break;

      case "tea":
        this._applyState("tea", "clawd-tea.svg");
        this._restTiredness(duration * 0.8);
        break;

      case "painting":
        this._applyState("painting", "clawd-painting.svg");
        this._restTiredness(duration * 0.65);
        break;

      case "gardening":
        this._applyState("gardening", "clawd-gardening.svg");
        this._restTiredness(duration * 0.6);
        break;

      case "fishing":
        this._applyState("fishing", "clawd-fishing.svg");
        this._restTiredness(duration * 0.75);
        break;

      case "knitting":
        this._applyState("knitting", "clawd-knitting.svg");
        this._restTiredness(duration * 0.8);
        break;

      case "music":
        this._applyState("music", "clawd-music.svg");
        this._restTiredness(duration * 0.6);
        break;

      case "meditating":
        this._applyState("meditating", "clawd-meditating.svg");
        this._restTiredness(duration);
        break;

      case "stargazing":
        this._applyState("stargazing", "clawd-stargazing.svg");
        this._restTiredness(duration * 0.85);
        break;

      case "skateboard":
        this._applyState("skateboard", "clawd-skateboard.svg");
        this._restTiredness(duration * 0.12);
        break;

      case "dancing":
        this._applyState("dancing", "clawd-dancing.svg");
        this._restTiredness(duration * 0.1);
        break;

      case "jumping-rope":
        this._applyState("jumping-rope", "clawd-jumping-rope.svg");
        this._restTiredness(duration * 0.05);
        break;

      case "cooking":
        this._applyState("cooking", "clawd-cooking.svg");
        this._restTiredness(duration * 0.2);
        break;

      case "sweeping-floor":
        this._applyState("sweeping-floor", "clawd-sweeping-floor.svg");
        this._restTiredness(duration * 0.12);
        break;

      case "exercising":
        this._applyState("exercising", "clawd-exercising.svg");
        this._restTiredness(duration * 0.05);
        break;

      case "yoga":
        this._applyState("yoga", "clawd-yoga.svg");
        this._restTiredness(duration * 0.85);
        break;

      case "edge-hide":
        this._executeEdgeHide(duration);
        return;

      case "rest-doze":
        this._applyState("dozing", "clawd-idle-doze.svg");
        this._restTiredness(duration);
        break;

      case "play-bounce":
        this._applyState("attention", "clawd-happy.svg");
        break;
    }

    this._behaviorTimer = setTimeout(() => {
      this._behaviorTimer = null;
      this._stopCurrentBehavior();
      this._scheduleNext();
    }, duration);
  }

  _restTiredness(durationMs) {
    // Reduce tiredness during rest
    this._tiredness = Math.max(0, this._tiredness - durationMs * 0.5);
  }

  _getRoamingLanes(bounds) {
    const currentArea = this._getBottomWorkArea(bounds);
    const currentBottom = currentArea.y + currentArea.height;
    const displays = this._getAllDisplays()
      .map((display) => display.workArea)
      .filter((wa) => Math.abs((wa.y + wa.height) - currentBottom) <= CROSS_DISPLAY_BOTTOM_TOLERANCE)
      .sort((a, b) => a.x - b.x);

    const source = displays.length > 0 ? displays : [currentArea];
    return source.map((wa) => ({
      minX: wa.x + ROAM_EDGE_MARGIN,
      maxX: wa.x + wa.width - bounds.width - ROAM_EDGE_MARGIN,
      y: wa.y + wa.height - bounds.height - BOTTOM_MARGIN,
    }));
  }

  _getLaneForX(bounds, targetX) {
    const lanes = this._getRoamingLanes(bounds);
    for (const lane of lanes) {
      if (targetX >= lane.minX && targetX <= lane.maxX) {
        return lane;
      }
    }

    let nearest = lanes[0];
    let minDist = Infinity;
    for (const lane of lanes) {
      const clamped = Math.max(lane.minX, Math.min(targetX, lane.maxX));
      const dist = Math.abs(targetX - clamped);
      if (dist < minDist) {
        minDist = dist;
        nearest = lane;
      }
    }
    return nearest;
  }

  _clampRoamingX(bounds, targetX) {
    const lanes = this._getRoamingLanes(bounds);
    const minX = Math.min(...lanes.map((lane) => lane.minX));
    const maxX = Math.max(...lanes.map((lane) => lane.maxX));
    return Math.max(minX, Math.min(targetX, maxX));
  }

  _executeWander(minDist, maxDist, speed) {
    const bounds = this._getWindowBounds();
    const lanes = this._getRoamingLanes(bounds);
    const currentLane = lanes.find((lane) => bounds.x >= lane.minX && bounds.x <= lane.maxX)
      || this._getLaneForX(bounds, bounds.x);
    let targetX;

    if (lanes.length > 1 && Math.random() < 0.45) {
      const altLanes = lanes.filter((lane) => lane !== currentLane);
      const lane = altLanes[Math.floor(Math.random() * altLanes.length)] || currentLane;
      const span = Math.max(20, lane.maxX - lane.minX);
      targetX = lane.minX + Math.random() * span;
    } else {
      const dist = minDist + Math.random() * (maxDist - minDist);
      const dir = Math.random() < 0.5 ? -1 : 1;
      targetX = bounds.x + dir * dist;
    }

    targetX = this._clampRoamingX(bounds, targetX);
    const targetLane = this._getLaneForX(bounds, targetX);
    const targetY = targetLane.y;

    this._startMovement(Math.round(targetX), Math.round(targetY), speed, "walking", "clawd-walk.svg");
  }

  _executeEdgeHide(durationMs) {
    const bounds = this._getWindowBounds();
    const lanes = this._getRoamingLanes(bounds);
    const currentLane = lanes.find((lane) => bounds.x >= lane.minX && bounds.x <= lane.maxX)
      || this._getLaneForX(bounds, bounds.x);
    const side = Math.random() < 0.5 ? "left" : "right";
    const targetX = side === "left" ? currentLane.minX : currentLane.maxX;
    const peekState = side === "left" ? "edge-peek-left" : "edge-peek-right";
    const peekSvg = side === "left" ? "clawd-peek-left.svg" : "clawd-peek-right.svg";

    this._startMovement(
      Math.round(targetX),
      Math.round(currentLane.y),
      WALK_SPEED * 0.92,
      "walking",
      "clawd-walk.svg",
      () => {
        this._currentBehavior = side === "left" ? "edge-hide-left" : "edge-hide-right";
        this._direction = "right";
        this._sendDirection("right");
        this._applyState(peekState, peekSvg);
        this._restTiredness(durationMs * 0.35);
        this._behaviorTimer = setTimeout(() => {
          this._behaviorTimer = null;
          this._stopCurrentBehavior();
          this._scheduleNext();
        }, durationMs);
      },
    );
  }

  _executeChaseCursor(cursor) {
    const bounds = this._getWindowBounds();
    const petCX = bounds.x + bounds.width / 2;
    // Stop 80-150px away from cursor
    const stopDist = 80 + Math.random() * 70;
    const dir = cursor.x > petCX ? 1 : -1;
    let targetX = cursor.x - dir * stopDist - bounds.width / 2;

    targetX = this._clampRoamingX(bounds, targetX);
    const targetLane = this._getLaneForX(bounds, targetX);
    const targetY = targetLane.y;

    this._startMovement(Math.round(targetX), Math.round(targetY), WALK_SPEED, "walking", "clawd-walk.svg");

    // End after reaching target or timeout
    const timeout = 3000 + Math.random() * 5000;
    this._behaviorTimer = setTimeout(() => {
      this._behaviorTimer = null;
      this._stopCurrentBehavior();
      this._scheduleNext();
    }, timeout);
  }

  _executeFlee(cursor) {
    const bounds = this._getWindowBounds();
    const petCX = bounds.x + bounds.width / 2;
    const dir = cursor.x > petCX ? -1 : 1; // run away from cursor
    const dist = 200 + Math.random() * 200;
    let targetX = bounds.x + dir * dist;

    targetX = this._clampRoamingX(bounds, targetX);
    const targetLane = this._getLaneForX(bounds, targetX);
    const targetY = targetLane.y;

    this._currentBehavior = "flee-cursor";
    this._startMovement(Math.round(targetX), Math.round(targetY), RUN_SPEED, "running", "clawd-run.svg");

    const timeout = 2000 + Math.random() * 2000;
    this._behaviorTimer = setTimeout(() => {
      this._behaviorTimer = null;
      this._stopCurrentBehavior();
      this._scheduleNext();
    }, timeout);
  }

  _executeSkittishStep(cursor) {
    if (this._behaviorTimer) {
      clearTimeout(this._behaviorTimer);
      this._behaviorTimer = null;
    }
    this._stopMovement();

    const bounds = this._getWindowBounds();
    const petCX = bounds.x + bounds.width / 2;
    const dir = cursor.x > petCX ? -1 : 1;
    const dist = 60 + Math.random() * 30;
    let targetX = bounds.x + dir * dist;

    targetX = this._clampRoamingX(bounds, targetX);
    const targetLane = this._getLaneForX(bounds, targetX);
    const targetY = targetLane.y;

    this._currentBehavior = "skittish-step";
    this._skittishCooldownUntil = Date.now() + CURSOR_DODGE_COOLDOWN_MS;
    this._startMovement(Math.round(targetX), Math.round(targetY), WALK_SPEED * 1.15, "walking", "clawd-walk.svg");

    this._behaviorTimer = setTimeout(() => {
      this._behaviorTimer = null;
      this._stopCurrentBehavior();
      this._scheduleNext();
    }, 900);
  }

  _startMovement(targetX, targetY, speed, stateName, svgFile, onArrive = null) {
    this._stopMovement();
    this._targetX = targetX;
    this._targetY = targetY;
    this._moveSpeed = speed;
    this._moving = true;
    this._moveComplete = onArrive;

    // Set direction
    const bounds = this._getWindowBounds();
    this._moveOriginX = bounds.x;
    this._moveOriginY = bounds.y;
    this._moveDistance = Math.max(1, Math.hypot(targetX - bounds.x, targetY - bounds.y));
    this._lastMoveTick = Date.now();
    const newDir = targetX > bounds.x ? "right" : "left";
    if (newDir !== this._direction) {
      this._direction = newDir;
      this._sendDirection(newDir);
    }

    // Set walking/running animation
    this._applyState(stateName, svgFile);

    this._moveTimer = setInterval(() => {
      if (!this._moving) return;
      const now = Date.now();
      const dtMs = Math.min(48, Math.max(12, now - this._lastMoveTick));
      this._lastMoveTick = now;
      const b = this._getWindowBounds();
      const dx = this._targetX - b.x;
      const dy = this._targetY - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) {
        const complete = this._moveComplete;
        this._stopMovement({ keepCallback: true });
        this._moveComplete = null;
        if (typeof complete === "function") complete();
        return;
      }

      const travelled = Math.hypot(b.x - this._moveOriginX, b.y - this._moveOriginY);
      const progress = Math.max(0, Math.min(1, travelled / this._moveDistance));
      const speedFactor = this._getMoveSpeedFactor(progress);
      const step = (this._moveSpeed * speedFactor * dtMs) / 1000;
      const ratio = Math.min(1, step / dist);
      const newX = Math.round(b.x + dx * ratio);
      const newY = Math.round(b.y + dy * ratio);

      // Update direction if it changed
      const newDir = dx > 0 ? "right" : "left";
      if (newDir !== this._direction) {
        this._direction = newDir;
        this._sendDirection(newDir);
      }

      this._setWindowPosition(newX, newY);
    }, TICK_MS);
  }

  _stopMovement(options = {}) {
    const { keepCallback = false } = options;
    if (this._moveTimer) {
      clearInterval(this._moveTimer);
      this._moveTimer = null;
    }
    this._moving = false;
    this._moveDistance = 0;
    if (!keepCallback) this._moveComplete = null;
  }

  _stopCurrentBehavior() {
    this._stopMovement();
    if (this._behaviorTimer) {
      clearTimeout(this._behaviorTimer);
      this._behaviorTimer = null;
    }
    this._currentBehavior = null;
    // Return to idle
    this._applyState("idle", "clawd-idle-follow.svg");
    this._sendDirection(this._direction);
  }

  _getMoveSpeedFactor(progress) {
    if (progress <= 0.18) {
      return 0.38 + 0.62 * smoothstep(progress / 0.18);
    }
    if (progress >= 0.72) {
      return 0.28 + 0.72 * smoothstep((1 - progress) / 0.28);
    }
    return 1.02;
  }

  _getBottomWorkArea(bounds) {
    // Find the work area containing the pet's center, or primary display
    const displays = this._getAllDisplays();
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;

    for (const d of displays) {
      const wa = d.workArea;
      if (cx >= wa.x && cx <= wa.x + wa.width && cy >= wa.y && cy <= wa.y + wa.height) {
        return wa;
      }
    }
    // Fallback: nearest display
    let nearest = displays[0].workArea;
    let minDist = Infinity;
    for (const d of displays) {
      const wa = d.workArea;
      const wcx = wa.x + wa.width / 2;
      const wcy = wa.y + wa.height / 2;
      const dist = Math.sqrt((cx - wcx) ** 2 + (cy - wcy) ** 2);
      if (dist < minDist) { minDist = dist; nearest = wa; }
    }
    return nearest;
  }
}

module.exports = { BehaviorEngine };
