#!/usr/bin/env bun

import { Cron } from "croner";

import { getSettings, ensureDataDir } from "./config.js";
import { runAuthRefresh, createAuthenticatedApi } from "./auth.js";
import { formatAuthLoginError } from "./auth-errors.js";
import { WielermanagerApiClient } from "./wielermanager-api.js";
import { decodeTurboStream, extractEditionRouteLoader } from "./turbo-stream.js";
import { runManager, runRosterBuilder } from "./manager.js";
import { readManagerLog } from "./manager-log.js";
import { describeLineup } from "./lineup.js";
import { getFreeTransfers } from "./rules.js";
import { areTransfersOpen } from "./transfers.js";
import { pinoLogger, sseClients, encoder, broadcastSse } from "./logger.js";

const PORT = Number(process.env.PORT || 3000);
const AUTO_MANAGE_WINDOW_MS = Number(process.env.AUTO_MANAGE_WINDOW_MS || 60 * 60 * 1000);
const HTML_FILE = Bun.file(new URL("./index.html", import.meta.url));

let manageRunning = false;
let overviewCache = null;
let overviewCacheTime = 0;

async function fetchOverview(settings, api, cookies) {
  if (overviewCache && Date.now() - overviewCacheTime < 5 * 60 * 1000) {
    return overviewCache;
  }

  const overview = await api.fetchEditionOverview(cookies, decodeTurboStream, extractEditionRouteLoader);
  overviewCache = overview;
  overviewCacheTime = Date.now();
  return overview;
}

function enrichMatchForUi(match, roster) {
  if (!match) {
    return null;
  }

  const deadline = new Date(match.deadline || match.startTime);
  const msUntil = deadline.getTime() - Date.now();
  const inAutoWindow = msUntil > 0 && msUntil <= AUTO_MANAGE_WINDOW_MS;

  return {
    ...match,
    minutesUntilDeadline: Math.max(0, Math.floor(msUntil / 60_000)),
    autoManageScheduled: inAutoWindow,
    rosterSize: roster?.length ?? 0
  };
}

async function runAutoManage() {
  if (manageRunning) {
    pinoLogger.debug("Skipping overlapping auto-manage run.");
    return;
  }

  manageRunning = true;
  const settings = getSettings();

  try {
    const { api, getCookies } = await createAuthenticatedApi(settings, {
      onAuthRefresh: (message) => pinoLogger.info(message)
    });
    let overview = await fetchOverview(settings, api, getCookies());
    const match = overview.edition?.upcomingCyclingMatch;

    if (!match) {
      pinoLogger.debug("No upcoming match — skipping auto-manage.");
      return;
    }

    if (!overview.gameStatus?.roster?.length) {
      pinoLogger.info("Geen ploeg gevonden — AI bouwt initiële roster...");
      await runRosterBuilder({
        settings,
        api,
        getCookies,
        decodeTurboStream,
        extractEditionRouteLoader,
        options: {
          submit: true,
          onLog: (msg, level = "info") => {
            if (level === "debug") {
              pinoLogger.debug(msg);
            } else if (level === "warn") {
              pinoLogger.warn(msg);
            } else {
              pinoLogger.info(msg);
            }
          }
        }
      });
      overviewCache = null;
      overview = await fetchOverview(settings, api, getCookies());
    }

    if (!overview.gameStatus?.roster?.length) {
      pinoLogger.debug("Roster still empty after build attempt — skipping auto-manage.");
      return;
    }

    const enriched = enrichMatchForUi(match, overview.gameStatus.roster);
    if (!enriched.autoManageScheduled) {
      pinoLogger.debug(`Next match ${match.name} not in auto window yet.`);
      return;
    }

    pinoLogger.info(`🤖 Auto-manage voor ${match.name}...`);
    const result = await runManager({
      settings,
      api,
      getCookies,
      decodeTurboStream,
      extractEditionRouteLoader,
      options: {
        submit: true,
        allowTransfers: process.env.ALLOW_AUTO_TRANSFERS === "true",
        onLog: (msg, level = "info") => {
          if (level === "debug") {
            pinoLogger.debug(msg);
          } else if (level === "warn") {
            pinoLogger.warn(msg);
          } else {
            pinoLogger.info(msg);
          }
        }
      }
    });

    broadcastSse({
      type: "manage",
      matchId: match.id,
      matchName: match.name,
      summary: result.decision.summary,
      confidence: result.decision.confidence,
      submitted: true
    });

    overviewCache = null;
    pinoLogger.info(`✅ Auto-manage voltooid voor ${match.name}.`);
  } catch (error) {
    pinoLogger.error(`❌ Auto-manage mislukt: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    manageRunning = false;
  }
}

function startCronScheduler() {
  const minutes = Number(process.env.CRON_CHECK_MINUTES || 15);
  pinoLogger.info(`🕐 Auto-manage check elke ${minutes} minuten.`);
  new Cron(`*/${minutes} * * * *`, () => {
    runAutoManage().catch((error) => pinoLogger.error(error));
  });
}

Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(req) {
    const url = new URL(req.url);
    const settings = getSettings();
    const api = new WielermanagerApiClient(settings);

    if (url.pathname === "/health") {
      return Response.json({
        ok: true,
        edition: settings.editionSlug,
        uptimeSec: Math.floor(process.uptime())
      });
    }

    if (url.pathname === "/") {
      return new Response(HTML_FILE, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (url.pathname === "/overview") {
      try {
        const { api, getCookies } = await createAuthenticatedApi(settings, {
          onAuthRefresh: (message) => pinoLogger.info(message)
        });
        const overview = await fetchOverview(settings, api, getCookies());
        const match = enrichMatchForUi(
          overview.edition?.upcomingCyclingMatch,
          overview.gameStatus?.roster
        );

        let upcomingLineup = null;
        let transferState = null;

        try {
          upcomingLineup = match?.id
            ? await api.fetchMatchLineup(getCookies(), match.id)
            : await api.fetchUpcomingLineup(getCookies());
        } catch {
          upcomingLineup = null;
        }

        try {
          transferState = await api.fetchTransferState(getCookies());
        } catch {
          transferState = null;
        }

        const lineupView = upcomingLineup?.riders?.length ? describeLineup(upcomingLineup) : null;

        return Response.json({
          edition: overview.edition,
          gameStatus: overview.gameStatus,
          gameRules: overview.gameRules,
          upcomingMatch: match,
          upcomingLineup: lineupView,
          transferState: transferState
            ? {
                usedTransfers: transferState.usedTransfers,
                freeTransfers: getFreeTransfers(overview.gameRules ?? {}),
                freeTransfersRemaining: Math.max(
                  0,
                  getFreeTransfers(overview.gameRules ?? {}) - transferState.usedTransfers
                ),
                remainingBudget: transferState.remainingBudget,
                transfersOpen: areTransfersOpen(overview.gameStatus, overview.edition)
              }
            : null,
          logs: await readManagerLog(settings, 20)
        });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    }

    if (url.pathname === "/cyclists") {
      const payload = await api.fetchCyclists();
      return Response.json({
        count: payload.cyclists?.length ?? 0,
        teams: payload.teams?.length ?? 0
      });
    }

    if (url.pathname === "/logs") {
      let controller;
      let heartbeat;
      const stream = new ReadableStream({
        start(c) {
          controller = c;
          sseClients.add(controller);
          try {
            controller.enqueue(encoder.encode(": connected\n\n"));
          } catch {
            // ignore
          }
          heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode(": heartbeat\n\n"));
            } catch {
              clearInterval(heartbeat);
              sseClients.delete(controller);
            }
          }, 20_000);
        },
        cancel() {
          clearInterval(heartbeat);
          sseClients.delete(controller);
        }
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        }
      });
    }

    if (req.method === "POST" && url.pathname === "/run/roster") {
      const dryRun = url.searchParams.get("dryRun") === "1";
      try {
        const { api, getCookies } = await createAuthenticatedApi(settings, {
          onAuthRefresh: (message) => pinoLogger.info(message)
        });
        const result = await runRosterBuilder({
          settings,
          api,
          getCookies,
          decodeTurboStream,
          extractEditionRouteLoader,
          options: {
            dryRun,
            submit: !dryRun,
            force: url.searchParams.get("force") === "1",
            onLog: (msg) => pinoLogger.info(msg)
          }
        });

        overviewCache = null;
        broadcastSse({
          type: "roster",
          summary: result.decision?.summary ?? "Roster bijgewerkt",
          submitted: result.submitted
        });

        return Response.json({
          summary: result.decision?.summary,
          cyclistIds: result.cyclistIds,
          submitted: result.submitted,
          alreadyComplete: result.alreadyComplete
        });
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    }

    if (req.method === "POST" && url.pathname === "/run/manage") {
      const dryRun = url.searchParams.get("dryRun") === "1";
      try {
        const { api, getCookies } = await createAuthenticatedApi(settings, {
          onAuthRefresh: (message) => pinoLogger.info(message)
        });
        const result = await runManager({
          settings,
          api,
          getCookies,
          decodeTurboStream,
          extractEditionRouteLoader,
          options: {
            dryRun,
            submit: !dryRun,
            allowTransfers: url.searchParams.get("allowTransfers") === "1",
            onLog: (msg) => pinoLogger.info(msg)
          }
        });

        overviewCache = null;
        broadcastSse({
          type: "manage",
          matchId: result.context.match.id,
          matchName: result.context.match.name,
          summary: result.decision.summary,
          confidence: result.decision.confidence,
          submitted: result.submitted
        });

        return Response.json(result.decision);
      } catch (error) {
        return Response.json(
          { error: error instanceof Error ? error.message : String(error) },
          { status: 500 }
        );
      }
    }

    if (req.method === "POST" && url.pathname === "/run/auth-refresh") {
      runAuthRefresh(settings, { onLog: (message) => pinoLogger.info(message) })
        .then((cookies) => pinoLogger.info(`Auth refreshed (${cookies.length} cookies)`))
        .catch((error) => pinoLogger.error(formatAuthLoginError(error)));
      return new Response("ok");
    }

    return new Response("Not found", { status: 404 });
  }
});

pinoLogger.info(`🚀 Sporza Wielermanager server op http://localhost:${PORT}`);
ensureDataDir().catch(console.error);
runAutoManage().catch(console.error);
startCronScheduler();
