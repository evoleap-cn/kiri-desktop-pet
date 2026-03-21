#!/usr/bin/env node
// Clawd Desktop Pet — Hook Installer
// Safely merges hook commands into a JSON hook config file.
// Does NOT overwrite existing hooks — appends to arrays.

const fs = require("fs");
const path = require("path");
const os = require("os");

const settingsPath = process.env.CLAWD_HOOKS_SETTINGS
  ? path.resolve(process.env.CLAWD_HOOKS_SETTINGS)
  : path.join(os.homedir(), ".config", "clawd", "hooks.json");
const hookScript = path.resolve(__dirname, "clawd-hook.js");

const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "Notification",
  "PermissionRequest",
  "Elicitation",
  "WorktreeCreate",
];

const MARKER = "clawd-hook.js";

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
} catch (err) {
  if (err.code !== "ENOENT") {
    console.error("Failed to read hook settings:", err.message);
    process.exit(1);
  }
}

if (!settings.hooks) settings.hooks = {};

let added = 0;
let skipped = 0;

for (const event of HOOK_EVENTS) {
  if (!Array.isArray(settings.hooks[event])) {
    const existing = settings.hooks[event];
    settings.hooks[event] = existing && typeof existing === "object" ? [existing] : [];
  }

  const alreadyExists = settings.hooks[event].some((entry) => {
    if (typeof entry.command === "string" && entry.command.includes(MARKER)) return true;
    if (Array.isArray(entry.hooks)) {
      return entry.hooks.some((hook) => typeof hook.command === "string" && hook.command.includes(MARKER));
    }
    return false;
  });

  if (alreadyExists) {
    skipped++;
    continue;
  }

  settings.hooks[event].push({
    matcher: "",
    hooks: [
      {
        type: "command",
        command: `node "${hookScript}" ${event}`,
      },
    ],
  });
  added++;
}

fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");

console.log(`Clawd hooks written to ${settingsPath}`);
console.log(`  Added: ${added} hooks`);
if (skipped > 0) console.log(`  Skipped: ${skipped} (already registered)`);
console.log(`\nHook events: ${HOOK_EVENTS.join(", ")}`);
