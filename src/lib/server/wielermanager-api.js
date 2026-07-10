import { assertActionSuccess } from "./api-response.js";
import { decodeTurboStream, extractMatchLineup, extractTransferSummary, extractUpcomingLineup } from "./turbo-stream.js";

export class HttpStatusError extends Error {
  constructor(status, message) {
    super(message || `HTTP ${status}`);
    this.name = "HttpStatusError";
    this.status = status;
  }
}

export function isAuthError(error) {
  return error instanceof HttpStatusError && (error.status === 401 || error.status === 403);
}

export class WielermanagerApiClient {
  constructor(settings, options = {}) {
    this.settings = settings;
    this.onAuthFailure = options.onAuthFailure ?? null;
  }

  async fetchCyclists() {
    const response = await this.#fetchPublic(`cyclists`);
    const payload = await response.json();
    return payload;
  }

  async fetchEditionLoader(cookies) {
    const response = await this.#fetchEditionData(cookies);
    const raw = await response.text();
    return raw;
  }

  async fetchEditionOverview(cookies, decodeTurboStream, extractEditionRouteLoader) {
    const raw = await this.fetchEditionLoader(cookies);
    const decoded = decodeTurboStream(raw);
    const loader = extractEditionRouteLoader(decoded);

    if (!loader) {
      throw new Error("Could not extract edition loader from .data response");
    }

    return {
      edition: loader.edition ?? null,
      gameStatus: loader.gameStatus ?? null,
      gameRules: loader.gameRules ?? null,
      personalRanking: loader.personalRanking ?? null,
      miniCompetitions: loader.miniCompetitions ?? null
    };
  }

  async isSessionValid(cookies, decodeTurboStream, extractEditionRouteLoader) {
    try {
      const overview = await this.fetchEditionOverview(cookies, decodeTurboStream, extractEditionRouteLoader);
      return Boolean(overview?.gameStatus?.user);
    } catch (error) {
      if (isAuthError(error)) {
        return false;
      }
      throw error;
    }
  }

  async saveRoster(cookies, cyclistIds) {
    return this.#postAction(
      cookies,
      "cyclists",
      {
        action: "SAVE_ROSTER",
        cyclistIds
      },
      "SAVE_ROSTER"
    );
  }

  async saveLineup(cookies, matchId, lineup) {
    return this.#postAction(
      cookies,
      `gameteams/lineups/${matchId}`,
      {
        action: "SAVE_LINEUP",
        lineup: lineup.map((entry) => ({
          id: entry.id,
          lineupType: entry.lineupType
        }))
      },
      "SAVE_LINEUP"
    );
  }

  async createTransfer(cookies, ridersIn, ridersOut) {
    return this.#postAction(
      cookies,
      "transfers",
      {
        action: "CREATE_TRANSFER",
        ridersIn,
        ridersOut
      },
      "CREATE_TRANSFER"
    );
  }

  async deletePendingTransfers(cookies) {
    return this.#postAction(
      cookies,
      "transfers",
      {
        action: "DELETE_PENDING_TRANSFERS"
      },
      "DELETE_PENDING_TRANSFERS"
    );
  }

  async createGameTeam(cookies, payload) {
    return this.#postAction(cookies, "gameteams", payload, "CREATE_GAME_TEAM");
  }

  async fetchRouteLoader(cookies, routePath = "") {
    return this.#withAuthRetry(cookies, async (activeCookies) => {
      const suffix = routePath ? (routePath.startsWith("/") ? routePath.slice(1) : routePath) : "";
      const url = suffix
        ? `${this.settings.baseUrl}/${this.settings.editionSlug}/${suffix}.data`
        : `${this.settings.baseUrl}/${this.settings.editionSlug}.data`;
      const response = await this.#fetchWithTimeout(url, {
        method: "GET",
        headers: {
          ...this.#siteHeaders(activeCookies),
          accept: "*/*"
        }
      });
      await this.#raiseForStatus(response);
      return decodeTurboStream(await response.text());
    });
  }

  async fetchUpcomingLineup(cookies) {
    const decoded = await this.fetchRouteLoader(cookies, "");
    const fromIndex = extractUpcomingLineup(decoded);
    if (fromIndex?.riders?.length) {
      return fromIndex;
    }

    const teamDecoded = await this.fetchRouteLoader(cookies, "team");
    return extractMatchLineup(teamDecoded);
  }

  async fetchMatchLineup(cookies, matchId) {
    const path = matchId ? `team/${matchId}` : "team";
    const decoded = await this.fetchRouteLoader(cookies, path);
    return extractMatchLineup(decoded);
  }

  async fetchTransferSummary(cookies) {
    const decoded = await this.fetchRouteLoader(cookies, "transfers");
    return extractTransferSummary(decoded);
  }

  async fetchTransferState(cookies) {
    const summary = await this.fetchTransferSummary(cookies);
    if (!summary) {
      return {
        totalTransfers: 0,
        totalVirtualTransfers: 0,
        usedTransfers: 0,
        remainingBudget: null,
        executedTransfers: [],
        virtualTransfer: null
      };
    }

    const totalTransfers = Number(summary.totalTransfers) || 0;
    const totalVirtualTransfers = Number(summary.totalVirtualTransfers) || 0;
    const usedTransfers = totalTransfers + totalVirtualTransfers;
    const remainingFreeTransfers = Number(summary.remainingFreeTransfers ?? summary.freeTransfersRemaining);
    const parsedRemaining = Number.isFinite(remainingFreeTransfers) ? remainingFreeTransfers : null;

    return {
      ...summary,
      totalTransfers,
      totalVirtualTransfers,
      usedTransfers,
      remainingFreeTransfers: parsedRemaining,
      remainingBudget: summary.remainingBudget ?? null
    };
  }

  #siteHeaders(cookies, extra = {}) {
    const cookieHeader = this.#cookieHeader(cookies);
    return {
      accept: "*/*",
      origin: this.settings.baseUrl,
      referer: `${this.settings.baseUrl}/`,
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...extra
    };
  }

  #cookieHeader(cookies) {
    if (!Array.isArray(cookies)) {
      return "";
    }
    return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  }

  async #fetchPublic(pathSuffix) {
    const url = `${this.settings.baseUrl}/api/${this.settings.editionSlug}/${pathSuffix}`;
    const response = await this.#fetchWithTimeout(url, {
      method: "GET",
      headers: this.#siteHeaders([])
    });
    await this.#raiseForStatus(response);
    return response;
  }

  async #fetchEditionData(cookies) {
    return this.#withAuthRetry(cookies, async (activeCookies) => {
      const url = `${this.settings.baseUrl}/${this.settings.editionSlug}.data`;
      const response = await this.#fetchWithTimeout(url, {
        method: "GET",
        headers: {
          ...this.#siteHeaders(activeCookies),
          accept: "*/*"
        }
      });
      await this.#raiseForStatus(response);
      return response;
    });
  }

  async #postAction(cookies, pathSuffix, body, actionName = "API_ACTION") {
    return this.#withAuthRetry(cookies, async (activeCookies) => {
      const url = `${this.settings.baseUrl}/api/${this.settings.editionSlug}/${pathSuffix}`;
      const response = await this.#fetchWithTimeout(url, {
        method: "POST",
        headers: {
          ...this.#siteHeaders(activeCookies),
          "content-type": "application/json"
        },
        body: JSON.stringify(body)
      });
      await this.#raiseForStatus(response);

      const text = await response.text();
      if (!text) {
        return null;
      }

      let payload;
      try {
        payload = JSON.parse(text);
      } catch {
        return text;
      }

      return assertActionSuccess(payload, actionName);
    });
  }

  async #withAuthRetry(cookies, operation) {
    let activeCookies = cookies;
    let refreshed = false;

    for (;;) {
      try {
        return await operation(activeCookies);
      } catch (error) {
        if (refreshed || !isAuthError(error) || !this.onAuthFailure) {
          throw error;
        }
        refreshed = true;
        activeCookies = await this.onAuthFailure();
      }
    }
  }

  async #raiseForStatus(response) {
    if (response.ok) {
      return;
    }

    const text = await response.text();
    throw new HttpStatusError(response.status, text || `HTTP ${response.status}`);
  }

  async #fetchWithTimeout(url, options, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal
      });
    } catch (error) {
      if (error && error.name === "AbortError") {
        throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
