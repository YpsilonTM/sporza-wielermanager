import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { hasAuthCookie, normalizeCookies } from "./cookies.js";
import { performBrowserLogin } from "../../../scripts/auth-playwright.mjs";
import { AuthLoginError, AUTH_ERROR_CODES, formatAuthLoginError } from "./auth-errors.js";

export async function loginAndCaptureCookies(settings, options = {}) {
  if (typeof Bun !== "undefined") {
    return await loginViaNodeHelper(settings, options);
  }

  return await performBrowserLogin(settings, options);
}

async function loginViaNodeHelper(settings, options = {}) {
  const helperPath = fileURLToPath(new URL("../../../scripts/node-auth-login.mjs", import.meta.url));
  const onLog = typeof options.onLog === "function" ? options.onLog : null;

  return await new Promise((resolve, reject) => {
    const child = spawn("node", [helperPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DOTENV_CONFIG_QUIET: "true",
        SWM_SETTINGS_JSON: JSON.stringify(settings)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new AuthLoginError(AUTH_ERROR_CODES.TIMEOUT, "Node auth helper timed out after 180000ms", {
          step: "node_helper"
        })
      );
    }, 180_000);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (trimmed && onLog) {
          onLog(trimmed.startsWith("[auth]") ? trimmed.slice(6).trim() : trimmed);
        }
      }
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new AuthLoginError(AUTH_ERROR_CODES.HELPER_FAILED, `Failed to start Node auth helper: ${error.message}`, {
          step: "node_helper_spawn"
        })
      );
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        const message = stderr.trim() || `Node auth helper failed with exit code ${code}`;
        reject(new AuthLoginError(AUTH_ERROR_CODES.HELPER_FAILED, message, { step: "node_helper", exitCode: code }));
        return;
      }

      try {
        const cookies = normalizeCookies(parseHelperStdout(stdout));
        if (!hasAuthCookie(cookies)) {
          reject(
            new AuthLoginError(
              AUTH_ERROR_CODES.COOKIE_MISSING,
              "Node auth helper returned cookies without sporza-site_profile_at",
              { step: "node_helper_parse" }
            )
          );
          return;
        }
        resolve(cookies);
      } catch (error) {
        reject(
          new AuthLoginError(
            AUTH_ERROR_CODES.HELPER_FAILED,
            `Node auth helper returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
            { step: "node_helper_parse" }
          )
        );
      }
    });
  });
}

function parseHelperStdout(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("empty stdout");
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("[");
    const end = trimmed.lastIndexOf("]");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error(`Unrecognized token in stdout: ${trimmed.slice(0, 80)}`);
  }
}

export { formatAuthLoginError, AuthLoginError };
