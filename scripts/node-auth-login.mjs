import { performBrowserLogin } from "./auth-playwright.mjs";
import { formatAuthLoginError } from "../src/lib/server/auth-errors.js";

function parseSettings() {
  const raw = process.env.SWM_SETTINGS_JSON || "";
  if (!raw) {
    throw new Error("SWM_SETTINGS_JSON is missing");
  }
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Invalid SWM_SETTINGS_JSON payload");
  }
  return parsed;
}

function logToStderr(message) {
  process.stderr.write(`[auth] ${message}\n`);
}

async function run() {
  const settings = parseSettings();
  const cookies = await performBrowserLogin(settings, { onLog: logToStderr });
  process.stdout.write(JSON.stringify(cookies));
}

run().catch((error) => {
  const message = formatAuthLoginError(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
