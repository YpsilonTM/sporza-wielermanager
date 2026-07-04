import fs from "node:fs/promises";
import path from "node:path";

import { getDataPath } from "./config.js";

export async function logManagerDecision(settings, entry) {
  const file = settings.managerLogFile || ".manager_log.jsonl";
  const target = path.isAbsolute(file) ? file : getDataPath(path.basename(file));
  const line = JSON.stringify({
    loggedAt: new Date().toISOString(),
    ...entry
  });
  await fs.appendFile(target, `${line}\n`, "utf8");
}

export async function readManagerLog(settings, limit = 50) {
  const file = settings.managerLogFile || ".manager_log.jsonl";
  const target = path.isAbsolute(file) ? file : getDataPath(path.basename(file));

  try {
    const raw = await fs.readFile(target, "utf8");
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .slice(-limit)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
