#!/usr/bin/env bun

import { getSettings, ensureDataDir } from "./config.js";
import { runAuthRefresh, importCookiesFromHeader, createAuthenticatedApi } from "./auth.js";
import { formatAuthLoginError } from "./auth-errors.js";
import { WielermanagerApiClient } from "./wielermanager-api.js";
import { decodeTurboStream, extractEditionRouteLoader } from "./turbo-stream.js";
import { parseCyclistsResponse } from "./types.js";
import { runManager, runRosterBuilder } from "./manager.js";
import { describeLineup, formatLineupRoleLabel, formatCyclistShort } from "./lineup.js";
import { getFreeTransfers } from "./rules.js";
import { areTransfersOpen, calculateNextTransferCost, describeTransferWindow } from "./transfers.js";

function parseArgs(argv) {
  const args = argv.slice(2);
  const command = args[0] || "help";
  const flags = {};

  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--dry-run") {
      flags.dryRun = true;
    } else if (arg === "--submit") {
      flags.submit = true;
    } else if (arg.startsWith("--edition=")) {
      flags.edition = arg.slice("--edition=".length);
    } else if (arg === "--edition" && args[i + 1]) {
      flags.edition = args[++i];
    } else if (arg.startsWith("--match=")) {
      flags.match = arg.slice("--match=".length);
    } else if (arg === "--match" && args[i + 1]) {
      flags.match = args[++i];
    } else if (arg.startsWith("--limit=")) {
      flags.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--limit" && args[i + 1]) {
      flags.limit = Number(args[++i]);
    } else if (arg === "--allow-transfers") {
      flags.allowTransfers = true;
    } else if (arg.startsWith("--header=")) {
      flags.header = arg.slice("--header=".length);
    } else if (arg === "--header" && args[i + 1]) {
      flags.header = args[++i];
    }
  }

  return { command, flags };
}

function printHelp() {
  console.log(`Sporza Wielermanager CLI

Commands:
  import-cookies --header "..."  Save browser Cookie header to cache (no Playwright)
  auth-refresh              Force VRT login via Playwright (optional; also auto on 401/403)
  cyclists [--limit N]      List available cyclists (public)
  team                      Show authenticated team overview
  roster [--submit]         AI initial squad for new seasons (dry-run default)
  lineup [--submit]         AI lineup suggestion (dry-run by default)
  manage [--submit] [--allow-transfers]  Build roster if needed, then AI lineup
  help                      Show this help

Auth without Playwright:
  1. Log in at https://wielermanager.sporza.be/tour-m-26 in your browser
  2. Copy Cookie header from DevTools → Network
  3. bun run import-cookies --header "sporza-site_profile_at=...; ..."
     Or set WIELERMANAGER_COOKIE_HEADER in .env
`);
}

async function cmdImportCookies(settings, flags) {
  const header = flags.header || process.env.WIELERMANAGER_COOKIE_HEADER || "";
  if (!header) {
    throw new Error('Provide --header "name=value; ..." or set WIELERMANAGER_COOKIE_HEADER in .env');
  }

  await ensureDataDir();
  const cookies = await importCookiesFromHeader(settings, header);
  console.log(`Imported ${cookies.length} cookies — session valid.`);
}

async function cmdAuthRefresh(settings) {
  await ensureDataDir();
  try {
    const cookies = await runAuthRefresh(settings, {
      onLog: (message) => console.error(`[auth] ${message}`)
    });
    console.log(`Auth refreshed — ${cookies.length} cookies cached.`);
  } catch (error) {
    throw new Error(formatAuthLoginError(error));
  }
}

async function cmdCyclists(settings, flags) {
  const api = new WielermanagerApiClient(settings);
  const payload = parseCyclistsResponse(await api.fetchCyclists());
  const limit = Number.isFinite(flags.limit) ? flags.limit : 10;

  console.log(`Edition: ${settings.editionSlug}`);
  console.log(`Cyclists: ${payload.cyclists.length}, Teams: ${payload.teams.length}\n`);

  for (const cyclist of payload.cyclists.slice(0, limit)) {
    console.log(
      `#${cyclist.id} ${cyclist.firstName} ${cyclist.lastName} — €${cyclist.price}M — ${cyclist.team?.name ?? "?"} — ${(cyclist.riderTypes || []).join(", ")}`
    );
  }

  if (payload.cyclists.length > limit) {
    console.log(`\n... and ${payload.cyclists.length - limit} more (use --limit)`);
  }
}

async function cmdTeam(settings) {
  await ensureDataDir();
  const { api, getCookies } = await createAuthenticatedApi(settings);
  const overview = await api.fetchEditionOverview(
    getCookies(),
    decodeTurboStream,
    extractEditionRouteLoader
  );

  console.log(`Edition: ${overview.edition?.name ?? settings.editionSlug}`);
  console.log(`User: ${overview.gameStatus?.user?.name ?? "(not logged in)"}`);
  console.log(`Team: ${overview.gameStatus?.gameTeam?.name ?? "(none)"} [${overview.gameStatus?.gameTeam?.teamType ?? "?"}]`);
  console.log(`Roster: ${overview.gameStatus?.roster?.length ?? 0} cyclists`);
  console.log(`Ranking: ${overview.gameStatus?.ranking?.rank ?? "?"} / ${overview.gameStatus?.ranking?.amountOfPlayers ?? "?"}`);

  const match = overview.edition?.upcomingCyclingMatch;
  if (match) {
    console.log(`\nUpcoming: ${match.name} (${match.matchType}, ${match.terrainType})`);
    console.log(`  deadline: ${match.deadline ?? match.startTime}`);
    console.log(`  match id: ${match.id}`);
  }

  try {
    const transferState = await api.fetchTransferState(getCookies());
    const freeTransfers = getFreeTransfers(overview.gameRules ?? {});
    const freeLeft = Math.max(0, freeTransfers - transferState.usedTransfers);
    const nextCost = calculateNextTransferCost(transferState.usedTransfers, overview.gameRules ?? {});
    console.log(`\n${describeTransferWindow(overview.gameStatus, overview.edition)}`);
    console.log(
      `Transfers: ${transferState.usedTransfers} used (${freeLeft} free remaining, next cost: ${nextCost}M)`
    );
  } catch (error) {
    console.log(`\nTransfers: unavailable (${error instanceof Error ? error.message : String(error)})`);
  }

  if (match) {
    try {
      const lineup = await api.fetchMatchLineup(getCookies(), match.id);
      if (lineup?.riders?.length) {
        const { starters, bench } = describeLineup(lineup);
        console.log(`\nLineup for ${match.name}:`);
        console.log(`  Starters (${starters.length}):`);
        for (const cyclist of starters) {
          console.log(`    ${formatCyclistShort(cyclist)} ${formatLineupRoleLabel(cyclist.lineupType)}`);
        }
        if (bench.length) {
          console.log(`  Bank (${bench.length}):`);
          for (const cyclist of bench) {
            console.log(`    ${formatCyclistShort(cyclist)} ${formatLineupRoleLabel(cyclist.lineupType)}`);
          }
        }
      } else {
        console.log(`\nLineup for ${match.name}: not submitted yet`);
      }
    } catch (error) {
      console.log(`\nLineup: unavailable (${error instanceof Error ? error.message : String(error)})`);
    }
  }

  if (overview.gameStatus?.roster?.length) {
    console.log("\nRoster:");
    for (const c of overview.gameStatus.roster) {
      console.log(`  #${c.id} ${c.firstName} ${c.lastName} (€${c.price}M)`);
    }
  }
}

async function cmdRoster(settings, flags) {
  await ensureDataDir();
  const { api, getCookies } = await createAuthenticatedApi(settings);

  const result = await runRosterBuilder({
    settings,
    api,
    getCookies,
    decodeTurboStream,
    extractEditionRouteLoader,
    options: {
      dryRun: !flags.submit,
      submit: Boolean(flags.submit),
      force: Boolean(flags.force),
      onLog: (msg) => console.log(msg)
    }
  });

  if (result.alreadyComplete) {
    return;
  }

  console.log(result.submitted ? "\nRoster submitted successfully." : "\nDry-run complete (use --submit to apply).");
}

async function cmdLineup(settings, flags) {
  await ensureDataDir();
  const { api, getCookies } = await createAuthenticatedApi(settings);

  await runManager({
    settings,
    api,
    getCookies,
    decodeTurboStream,
    extractEditionRouteLoader,
    options: {
      dryRun: flags.submit ? false : flags.dryRun !== false,
      submit: Boolean(flags.submit),
      allowTransfers: Boolean(flags.allowTransfers),
      onLog: (msg) => console.log(msg)
    }
  });
}

async function cmdManage(settings, flags) {
  await ensureDataDir();
  const { api, getCookies } = await createAuthenticatedApi(settings);

  const result = await runManager({
    settings,
    api,
    getCookies,
    decodeTurboStream,
    extractEditionRouteLoader,
    options: {
      dryRun: flags.submit ? false : flags.dryRun !== false,
      submit: Boolean(flags.submit),
      allowTransfers: Boolean(flags.allowTransfers),
      onLog: (msg) => console.log(msg)
    }
  });

  console.log(result.submitted ? "\nSubmitted successfully." : "\nDry-run complete (use --submit to apply).");
}

async function main() {
  const { command, flags } = parseArgs(process.argv);

  if (flags.edition) {
    process.env.EDITION_SLUG = flags.edition;
  }

  const settings = getSettings();

  switch (command) {
    case "import-cookies":
      await cmdImportCookies(settings, flags);
      break;
    case "auth-refresh":
      await cmdAuthRefresh(settings);
      break;
    case "cyclists":
      await cmdCyclists(settings, flags);
      break;
    case "team":
      await cmdTeam(settings);
      break;
    case "roster":
      await cmdRoster(settings, flags);
      break;
    case "lineup":
      await cmdLineup(settings, flags);
      break;
    case "manage":
      await cmdManage(settings, flags);
      break;
    case "help":
    default:
      printHelp();
      break;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
