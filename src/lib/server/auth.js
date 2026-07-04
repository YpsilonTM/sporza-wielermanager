import fs from "node:fs/promises";

import { getCookiesCachePath } from "./config.js";
import { hasAuthCookie, normalizeCookies, parseCookieHeader } from "./cookies.js";
import { WielermanagerApiClient } from "./wielermanager-api.js";
import { decodeTurboStream, extractEditionRouteLoader } from "./turbo-stream.js";
import { formatAuthLoginError } from "./auth-errors.js";
import { createAuthLogger } from "./auth-logger.js";

const AUTH_HELP = `
No valid session cookies found.

Option A — paste cookies from your browser (no Playwright):
  1. Log in at https://wielermanager.sporza.be/tour-m-26
  2. DevTools → Network → any request → copy the Cookie header
  3. Run: bun run import-cookies --header "name=value; name2=value2"
     Or set WIELERMANAGER_COOKIE_HEADER in .env

Option B — browser auto-login (requires Playwright + bunx playwright install chromium):
  Set VRT_EMAIL and VRT_PASSWORD, then: bun run auth-refresh
`.trim();

function authLog(settings, message) {
  const logger = createAuthLogger(settings?._authOnLog);
  logger.info(message);
}

export async function getCachedCookies(settings) {
  const path = getCookiesCachePath(settings);

  try {
    const raw = await fs.readFile(path, "utf8");
    const payload = JSON.parse(raw);
    const cookies = normalizeCookies(Array.isArray(payload?.cookies) ? payload.cookies : payload);
    return cookies.length > 0 ? cookies : null;
  } catch {
    return null;
  }
}

export function getConfiguredCookies(settings) {
  const header = process.env.WIELERMANAGER_COOKIE_HEADER || "";
  const cookies = normalizeCookies(parseCookieHeader(header));
  return cookies.length > 0 ? cookies : null;
}

export async function storeCachedCookies(settings, cookies) {
  const path = getCookiesCachePath(settings);
  const payload = {
    cookies: normalizeCookies(cookies),
    updated_at: new Date().toISOString()
  };
  await fs.writeFile(path, JSON.stringify(payload, null, 2), "utf8");
  authLog(settings, `Cached ${payload.cookies.length} cookies → ${path}`);
}

export async function clearCachedCookies(settings) {
  const path = getCookiesCachePath(settings);
  try {
    await fs.unlink(path);
    authLog(settings, `Cleared cookie cache (${path})`);
  } catch {
    // ignore
  }
}

async function resolveValidCookies(settings, candidates) {
  const api = new WielermanagerApiClient(settings);
  const sources = ["WIELERMANAGER_COOKIE_HEADER", "cookie cache"];

  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const source = sources[i] || `candidate ${i + 1}`;
    const cookies = normalizeCookies(candidate || []);

    if (!cookies.length) {
      continue;
    }

    if (!hasAuthCookie(cookies)) {
      authLog(settings, `${source}: rejected — missing sporza-site_profile_at`);
      continue;
    }

    try {
      if (await api.isSessionValid(cookies, decodeTurboStream, extractEditionRouteLoader)) {
        return cookies;
      }
      authLog(settings, `${source}: rejected — API session check failed (expired or logged out)`);
    } catch (error) {
      authLog(
        settings,
        `${source}: rejected — ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return null;
}

function browserAuthEnabled(settings) {
  if ((process.env.SKIP_BROWSER_AUTH || "").toLowerCase() === "true") {
    return false;
  }
  if ((process.env.USE_BROWSER_AUTH || "").toLowerCase() === "true") {
    return true;
  }
  return Boolean(settings.vrtEmail && settings.vrtPassword);
}

async function loginWithBrowser(settings) {
  const { loginAndCaptureCookies } = await import("./browser-login.js");

  try {
    return await loginAndCaptureCookies(settings, { onLog: settings._authOnLog });
  } catch (error) {
    throw new Error(formatAuthLoginError(error));
  }
}

export async function resolveSession(settings, options = {}) {
  const forceRefresh = Boolean(options.forceRefresh);
  settings._authOnLog = options.onLog;

  if (!forceRefresh) {
    const configured = getConfiguredCookies(settings);
    const cached = await getCachedCookies(settings);
    const resolved = await resolveValidCookies(settings, [configured, cached]);
    if (resolved) {
      return resolved;
    }
    authLog(settings, "No valid cached session — browser login required");
  } else {
    authLog(settings, "Force refresh requested — running browser login");
  }

  if (!browserAuthEnabled(settings)) {
    throw new Error(AUTH_HELP);
  }

  await clearCachedCookies(settings);
  const cookies = await loginWithBrowser(settings);
  await storeCachedCookies(settings, cookies);
  return cookies;
}

export async function runAuthRefresh(settings, options = {}) {
  if (!browserAuthEnabled(settings)) {
    throw new Error(
      "Browser auth is disabled. Import cookies with `bun run import-cookies` or set USE_BROWSER_AUTH=true."
    );
  }
  return resolveSession(settings, { forceRefresh: true, ...options });
}

let activeRefresh = null;

export function canAutoRefreshAuth(settings) {
  return browserAuthEnabled(settings);
}

export async function refreshAuthSession(settings, options = {}) {
  if (activeRefresh) {
    authLog(settings, "Waiting for in-flight auth refresh...");
    return activeRefresh;
  }

  if (!browserAuthEnabled(settings)) {
    throw new Error(`Session expired.\n${AUTH_HELP}`);
  }

  activeRefresh = resolveSession(settings, { forceRefresh: true, ...options }).finally(() => {
    activeRefresh = null;
  });

  return activeRefresh;
}

export async function createAuthenticatedApi(settings, options = {}) {
  const onAuthRefresh =
    typeof options.onAuthRefresh === "function"
      ? options.onAuthRefresh
      : (message) => console.error(`[auth] ${message}`);

  const sessionRef = {
    cookies: await resolveSession(settings, {})
  };

  const api = new WielermanagerApiClient(settings, {
    onAuthFailure: async () => {
      onAuthRefresh("Session expired — refreshing login...");
      sessionRef.cookies = await refreshAuthSession(settings, { onLog: onAuthRefresh });
      onAuthRefresh(`Session refreshed (${sessionRef.cookies.length} cookies).`);
      return sessionRef.cookies;
    }
  });

  return {
    api,
    getCookies: () => sessionRef.cookies,
    sessionRef
  };
}

export async function importCookiesFromHeader(settings, header) {
  const cookies = normalizeCookies(parseCookieHeader(header));
  if (!hasAuthCookie(cookies)) {
    throw new Error("Cookie header must include sporza-site_profile_at (log in at wielermanager.sporza.be first).");
  }

  const api = new WielermanagerApiClient(settings);
  if (!(await api.isSessionValid(cookies, decodeTurboStream, extractEditionRouteLoader))) {
    throw new Error("Cookies were parsed but session is invalid — copy a fresh Cookie header while logged in.");
  }

  await storeCachedCookies(settings, cookies);
  return cookies;
}
