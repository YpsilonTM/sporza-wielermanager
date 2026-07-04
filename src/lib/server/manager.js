import { predictLineupDecision, predictRosterDecision } from "./predictor.js";
import { normalizeLineup, splitLineupByRole, formatLineupRoleLabel } from "./lineup.js";
import {
  validateLineup,
  validateRosterIds,
  lineupToApiPayload,
  rosterIsComplete,
  getSquadSize,
  getStarterCount,
  getSubstituteSlots,
  getFreeTransfersRemaining
} from "./rules.js";
import {
  areTransfersOpen,
  describeTransferWindow,
  formatTransferCostLabel,
  getNextTransferNumber,
  isPreRaceSquadWindow,
  minutesUntilMatch,
  validateTransfer
} from "./transfers.js";
import { buildFallbackRoster } from "./roster-fallback.js";
import { formatRiderName } from "./format.js";
import { getUpcomingMatch } from "./format.js";

function resolveCookiesAccessor({ cookies, getCookies }) {
  if (typeof getCookies === "function") {
    return getCookies;
  }
  return () => cookies;
}

export async function buildManagerContext(api, cookies, decodeTurboStream, extractEditionRouteLoader) {
  const overview = await api.fetchEditionOverview(cookies, decodeTurboStream, extractEditionRouteLoader);
  const cyclistsPayload = await api.fetchCyclists();

  const match = getUpcomingMatch(overview);

  return {
    overview,
    match,
    roster: overview.gameStatus?.roster ?? [],
    allCyclists: cyclistsPayload.cyclists ?? [],
    gameRules: overview.gameRules ?? {},
    gameStatus: overview.gameStatus ?? {},
    editionName: overview.edition?.name ?? null
  };
}

function formatCyclistLabel(cyclist) {
  return formatRiderName(cyclist, { includeId: true, includePrice: true, includeTeam: true });
}

export async function runRosterBuilder({
  settings,
  api,
  cookies,
  getCookies,
  decodeTurboStream,
  extractEditionRouteLoader,
  options = {}
}) {
  const dryRun = Boolean(options.dryRun);
  const submit = options.submit !== false && !dryRun;
  const force = Boolean(options.force);
  const onLog = typeof options.onLog === "function" ? options.onLog : () => {};
  const activeCookies = resolveCookiesAccessor({ cookies, getCookies });

  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  const context = await buildManagerContext(
    api,
    activeCookies(),
    decodeTurboStream,
    extractEditionRouteLoader
  );
  const squadSize = getSquadSize(context.gameRules);

  if (!force && rosterIsComplete(context.roster, context.gameRules)) {
    onLog(`Ploeg is al compleet (${squadSize} renners). Gebruik --force om opnieuw te kiezen.`);
    return {
      context,
      decision: null,
      cyclistIds: context.roster.map((c) => c.id),
      roster: context.roster,
      submitted: false,
      alreadyComplete: true
    };
  }

  onLog(`AI stelt initiële ploeg samen (${squadSize} renners)...`);

  let decision = null;
  if (apiKey) {
    decision = await predictRosterDecision(
      apiKey,
      {
        editionName: context.editionName,
        allCyclists: context.allCyclists,
        gameRules: context.gameRules
      },
      { onDebug: (msg) => onLog(msg, "debug") }
    );
  } else {
    onLog("Geen GEMINI_API_KEY — fallback roster wordt gebruikt.", "warn");
  }

  let cyclistIds = Array.isArray(decision?.cyclistIds) ? [...decision.cyclistIds] : [];
  let validation = validateRosterIds(cyclistIds, context.allCyclists, context.gameRules);

  if (!validation.valid) {
    onLog(`AI roster ongeldig: ${validation.errors.join("; ")}`, "warn");
    onLog("Fallback roster wordt gebruikt.", "warn");
    const fallback = buildFallbackRoster(context.allCyclists, context.gameRules);
    decision = { ...fallback, model: "fallback" };
    cyclistIds = fallback.cyclistIds;
    validation = validateRosterIds(cyclistIds, context.allCyclists, context.gameRules);
  }

  if (!validation.valid) {
    throw new Error(`Could not build valid roster: ${validation.errors.join("; ")}`);
  }

  onLog(`AI summary: ${decision.summary}`);
  onLog(`Confidence: ${decision.confidence ?? "?"}${decision.escalated ? " (escalated)" : ""}${decision.source === "fallback" ? " (fallback)" : ""}`);
  onLog(`Budget: €${validation.totalBudget}M / €${context.gameRules?.budget ?? 100}M`);

  for (const cyclist of validation.roster) {
    const pick = (Array.isArray(decision.picks) ? decision.picks : []).find(
      (entry) => entry.cyclistId === cyclist.id
    );
    onLog(`  ${formatCyclistLabel(cyclist)}${pick?.reasoning ? ` — ${pick.reasoning}` : ""}`);
  }

  if (submit) {
    onLog("Ploeg indienen via API...");
    await api.saveRoster(activeCookies(), cyclistIds);
    context.roster = validation.roster;
  } else {
    onLog("Dry-run — ploeg niet ingediend.");
  }

  return {
    context,
    decision,
    cyclistIds,
    roster: validation.roster,
    submitted: submit,
    alreadyComplete: false
  };
}

async function runPreRaceSquadReview({
  settings,
  api,
  activeCookies,
  context,
  decodeTurboStream,
  extractEditionRouteLoader,
  submit,
  onLog
}) {
  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    onLog("Geen GEMINI_API_KEY — sla pre-race ploegcheck over.", "warn");
    return { roster: context.roster, changed: false, decision: null };
  }

  const squadSize = getSquadSize(context.gameRules);
  const currentIds = context.roster.map((c) => c.id).sort((a, b) => a - b);
  const minutesUntilDeadline = minutesUntilMatch(context.match);

  onLog(
    `Vóór rit 1${minutesUntilDeadline != null ? ` (${minutesUntilDeadline} min)` : ""} — AI checkt ploeg op blessures/ziekte...`
  );

  const decision = await predictRosterDecision(
    apiKey,
    {
      editionName: context.editionName,
      allCyclists: context.allCyclists,
      gameRules: context.gameRules,
      currentRoster: context.roster,
      match: context.match,
      minutesUntilDeadline
    },
    { onDebug: (msg) => onLog(msg, "debug") }
  );

  if (!decision?.cyclistIds?.length) {
    onLog("Pre-race ploegcheck gaf geen resultaat — huidige ploeg behouden.", "warn");
    return { roster: context.roster, changed: false, decision: null };
  }

  const validation = validateRosterIds(decision.cyclistIds, context.allCyclists, context.gameRules);
  if (!validation.valid) {
    onLog(`Pre-race ploegwijziging ongeldig: ${validation.errors.join("; ")}`, "warn");
    return { roster: context.roster, changed: false, decision };
  }

  const nextIds = [...validation.roster.map((c) => c.id)].sort((a, b) => a - b);
  const changed =
    nextIds.length !== currentIds.length || nextIds.some((id, index) => id !== currentIds[index]);

  onLog(`AI summary: ${decision.summary}`);

  if (!changed) {
    onLog("Geen ploegwijzigingen nodig volgens AI.");
    return { roster: context.roster, changed: false, decision };
  }

  const outIds = currentIds.filter((id) => !nextIds.includes(id));
  const inIds = nextIds.filter((id) => !currentIds.includes(id));
  onLog(`Ploegwijziging: ${outIds.join(", ")} eruit → ${inIds.join(", ")} erin`);

  for (const cyclist of validation.roster) {
    if (inIds.includes(cyclist.id)) {
      const pick = (Array.isArray(decision.picks) ? decision.picks : []).find(
        (entry) => entry.cyclistId === cyclist.id
      );
      onLog(`  + ${formatCyclistLabel(cyclist)}${pick?.reasoning ? ` — ${pick.reasoning}` : ""}`);
    }
  }

  if (submit) {
    onLog("Bijgewerkte ploeg indienen...");
    await api.saveRoster(activeCookies(), validation.roster.map((c) => c.id));
  } else {
    onLog("Dry-run — ploeg niet aangepast.");
  }

  return {
    roster: validation.roster,
    changed: true,
    decision,
    submitted: submit
  };
}

export async function runManager({
  settings,
  api,
  cookies,
  getCookies,
  decodeTurboStream,
  extractEditionRouteLoader,
  options = {}
}) {
  const dryRun = Boolean(options.dryRun);
  const submit = options.submit !== false && !dryRun;
  const allowTransfers = options.allowTransfers === true;
  const onLog = typeof options.onLog === "function" ? options.onLog : () => {};
  const activeCookies = resolveCookiesAccessor({ cookies, getCookies });

  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || "";
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is required for AI management");
  }

  const autoBuildRoster = options.autoBuildRoster !== false;

  let context = await buildManagerContext(
    api,
    activeCookies(),
    decodeTurboStream,
    extractEditionRouteLoader
  );

  if (!context.match) {
    throw new Error("No upcoming match found for this edition");
  }

  if (!rosterIsComplete(context.roster, context.gameRules)) {
    if (!autoBuildRoster) {
      throw new Error(
        `Incomplete roster (${context.roster?.length ?? 0}/${getSquadSize(context.gameRules)}). Run \`bun run roster\` first.`
      );
    }

    onLog(
      `Onvolledige ploeg (${context.roster?.length ?? 0}/${getSquadSize(context.gameRules)}) — AI bouwt eerst initiële squad...`
    );

    const rosterResult = await runRosterBuilder({
      settings,
      api,
      getCookies: activeCookies,
      decodeTurboStream,
      extractEditionRouteLoader,
      options: {
        dryRun,
        submit,
        onLog
      }
    });

    context = {
      ...context,
      roster: rosterResult.roster
    };
  }

  const preRaceSquadWindow = isPreRaceSquadWindow(context.gameStatus, context.overview?.edition);
  if (preRaceSquadWindow && rosterIsComplete(context.roster, context.gameRules)) {
    const review = await runPreRaceSquadReview({
      settings,
      api,
      activeCookies,
      context,
      decodeTurboStream,
      extractEditionRouteLoader,
      submit,
      onLog
    });
    if (review.changed) {
      context = { ...context, roster: review.roster };
    }
  }

  onLog(`AI analyseert lineup voor ${context.match.name} (${context.match.terrainType}, ${context.match.matchType})...`);

  let currentLineup = null;
  try {
    currentLineup = await api.fetchMatchLineup(activeCookies(), context.match.id);
  } catch {
    currentLineup = null;
  }

  const decision = await predictLineupDecision(
    apiKey,
    {
      match: context.match,
      roster: context.roster,
      allCyclists: context.allCyclists,
      gameRules: context.gameRules,
      transfersAllowed: areTransfersOpen(context.gameStatus, context.overview?.edition),
      preRaceSquadWindow,
      minutesUntilDeadline: minutesUntilMatch(context.match)
    },
    { onDebug: (msg) => onLog(msg, "debug") }
  );

  if (!decision) {
    throw new Error("AI returned no decision");
  }

  onLog(`AI summary: ${decision.summary}`);
  onLog(`Confidence: ${decision.confidence}${decision.escalated ? " (escalated)" : ""}`);

  const transferState = await api.fetchTransferState(activeCookies());
  const freeRemaining = getFreeTransfersRemaining(transferState, context.gameRules);
  const transfersOpen = areTransfersOpen(context.gameStatus, context.overview?.edition);
  onLog(describeTransferWindow(context.gameStatus, context.overview?.edition));
  onLog(
    `Transfers: ${transferState.usedTransfers} gebruikt (${freeRemaining} gratis resterend)`
  );

  let transferResult = null;
  let rosterForLineup = context.roster;

  if (decision.transfers?.length) {
    const transfer = decision.transfers[0];
    const ridersIn = Array.isArray(transfer?.ridersIn) ? transfer.ridersIn : [];
    const ridersOut = Array.isArray(transfer?.ridersOut) ? transfer.ridersOut : [];

    if (!transfersOpen) {
      onLog(
        "AI transfer genegeerd — vóór rit 1 pas je je ploeg gratis aan met `bun run roster --submit`, niet via transfer.",
        "warn"
      );
    } else {
      transferResult = validateTransfer(
        { ...transfer, ridersIn, ridersOut },
        context.roster,
        context.allCyclists,
        context.gameRules,
        transferState.usedTransfers
      );

      if (!transferResult.valid) {
        onLog(`Transfer skipped: ${transferResult.errors.join("; ")}`, "warn");
        transferResult = null;
      } else {
        const nextNumber = getNextTransferNumber(transferState.usedTransfers);
        onLog(`Transfer voorstel: ${ridersOut.join(",")} → ${ridersIn.join(",")}`);
        onLog(
          formatTransferCostLabel(nextNumber, transferResult.transferCost)
        );
        if (transfer.reasoning) {
          onLog(`  ${transfer.reasoning}`);
        }

        if (submit && !allowTransfers) {
          onLog(
            "Transfer NIET uitgevoerd — voeg `--allow-transfers` toe om een echte transfer te doen. Lineup op huidige ploeg.",
            "warn"
          );
        } else if (submit && allowTransfers) {
          onLog("Transfer indienen...");
          await api.createTransfer(activeCookies(), ridersIn, ridersOut);
          context.roster = transferResult.nextRoster;
          rosterForLineup = transferResult.nextRoster;
          onLog("Transfer uitgevoerd.");
        } else {
          rosterForLineup = transferResult.nextRoster;
          onLog("Dry-run — transfer niet uitgevoerd (lineup wel tegen nieuwe ploeg gevalideerd).");
        }
      }
    }
  }

  const beforeNormalize = JSON.stringify(
    (decision.lineup || []).map((entry) => entry.lineupType)
  );
  decision.lineup = normalizeLineup(decision.lineup, {
    gameRules: context.gameRules,
    roster: rosterForLineup,
    match: context.match
  });
  const afterNormalize = JSON.stringify(
    (decision.lineup || []).map((entry) => entry.lineupType)
  );
  if (beforeNormalize !== afterNormalize) {
    onLog(
      `Lineup genormaliseerd naar ${getStarterCount(context.gameRules)} starters + ${getSubstituteSlots(context.gameRules)} bank.`
    );
  }

  const lineupValidation = validateLineup(decision.lineup, rosterForLineup, context.gameRules);
  if (!lineupValidation.valid) {
    throw new Error(`Invalid lineup: ${lineupValidation.errors.join("; ")}`);
  }

  const { starters, bench } = splitLineupByRole(decision.lineup);
  onLog(`Starters (${starters.length}):`);
  for (const entry of starters) {
    onLog(`  #${entry.cyclistId} ${formatLineupRoleLabel(entry.lineupType)} — ${entry.reasoning}`);
  }
  if (bench.length) {
    onLog(`Bank (${bench.length}):`);
    for (const entry of bench) {
      onLog(`  #${entry.cyclistId} ${formatLineupRoleLabel(entry.lineupType)} — ${entry.reasoning}`);
    }
  }

  const lineupPayload = lineupToApiPayload(decision.lineup);
  if (submit) {
    onLog(`Lineup indienen voor rit ${context.match.id}...`);
    await api.saveLineup(activeCookies(), context.match.id, lineupPayload);
  } else {
    onLog("Dry-run — lineup niet ingediend.");
  }

  return {
    context,
    decision,
    lineupPayload,
    transferResult,
    currentLineup,
    submitted: submit
  };
}

export async function submitRosterFromPreview({
  api,
  getCookies,
  decodeTurboStream,
  extractEditionRouteLoader,
  cyclistIds,
  onLog = () => {}
}) {
  const context = await buildManagerContext(
    api,
    getCookies(),
    decodeTurboStream,
    extractEditionRouteLoader
  );
  const validation = validateRosterIds(cyclistIds, context.allCyclists, context.gameRules);
  if (!validation.valid) {
    throw new Error(`Ongeldige ploeg: ${validation.errors.join("; ")}`);
  }

  onLog("Simulatie indienen — ploeg opslaan bij Sporza...");
  await api.saveRoster(getCookies(), cyclistIds);
}

export async function submitLineupWithOptionalTransfer({
  api,
  getCookies,
  decodeTurboStream,
  extractEditionRouteLoader,
  payload,
  allowTransfers = false,
  onLog = () => {}
}) {
  const context = await buildManagerContext(
    api,
    getCookies(),
    decodeTurboStream,
    extractEditionRouteLoader
  );

  let roster = context.roster ?? [];
  const transferState = await api.fetchTransferState(getCookies());
  const transfersOpen = areTransfersOpen(context.gameStatus, context.overview?.edition);

  if (payload.transfer && transfersOpen) {
    if (!allowTransfers) {
      onLog("Transfer uit simulatie overgeslagen — niet ingeschakeld.", "warn");
    } else {
      const transferResult = validateTransfer(
        payload.transfer,
        roster,
        context.allCyclists,
        context.gameRules,
        transferState.usedTransfers
      );
      if (!transferResult.valid) {
        throw new Error(`Transfer ongeldig: ${transferResult.errors.join("; ")}`);
      }
      onLog("Transfer uit simulatie indienen...");
      await api.createTransfer(getCookies(), payload.transfer.ridersIn, payload.transfer.ridersOut);
      roster = transferResult.nextRoster;
      onLog("Transfer uitgevoerd.");
    }
  }

  const lineupValidation = validateLineup(payload.lineup, roster, context.gameRules);
  if (!lineupValidation.valid) {
    throw new Error(`Ongeldige lineup: ${lineupValidation.errors.join("; ")}`);
  }

  onLog(`Simulatie indienen — lineup opslaan voor ${payload.matchName ?? payload.matchId}...`);
  await api.saveLineup(getCookies(), payload.matchId, lineupToApiPayload(payload.lineup));
}
