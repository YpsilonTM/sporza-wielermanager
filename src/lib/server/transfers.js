import {
  getBudgetLimit,
  getFreeTransfers,
  rosterBudget,
  validateRoster
} from "./rules.js";

export function areTransfersOpen(gameStatus, edition) {
  if (gameStatus?.lastMatch?.match) {
    return true;
  }

  const teamType = gameStatus?.gameTeam?.teamType;
  if (teamType === "LOCKED") {
    return true;
  }

  const upcoming =
    edition?.upcomingCyclingMatch ?? gameStatus?.nextMatch?.match ?? null;

  if (!upcoming) {
    return false;
  }

  // Until the first race starts you can edit the squad freely via "Mijn Ploeg".
  if ((upcoming.matchNumber ?? 1) === 1 && upcoming.status === "NOT_STARTED") {
    return false;
  }

  return upcoming.status !== "NOT_STARTED";
}

/** True while rit 1 has not started — unlimited free squad edits via saveRoster. */
export function isPreRaceSquadWindow(gameStatus, edition) {
  const upcoming =
    edition?.upcomingCyclingMatch ?? gameStatus?.nextMatch?.match ?? null;

  if (!upcoming) {
    return false;
  }

  return (upcoming.matchNumber ?? 1) === 1 && upcoming.status === "NOT_STARTED";
}

export function minutesUntilMatch(match) {
  if (!match) {
    return null;
  }
  const deadline = new Date(match.deadline || match.startTime);
  const ms = deadline.getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 60_000));
}

export function describeTransferWindow(gameStatus, edition) {
  if (isPreRaceSquadWindow(gameStatus, edition)) {
    const upcoming =
      edition?.upcomingCyclingMatch ?? gameStatus?.nextMatch?.match ?? null;
    const mins = minutesUntilMatch(upcoming);
    const countdown = mins != null ? ` (~${mins} min tot deadline)` : "";
    return `Vóór rit 1${countdown} — ploeg GRATIS onbeperkt aanpassen (geen transferkosten).`;
  }

  if (areTransfersOpen(gameStatus, edition)) {
    return "Transfers open — wissels via transfer (niet via gratis ploegbeheer).";
  }

  return "Vóór rit 1 — ploeg gratis aanpassen via `bun run roster`, geen transfers.";
}

export function calculateNextTransferCost(usedTransfers, gameRules) {
  const freeTransfers = getFreeTransfers(gameRules);
  if (usedTransfers < freeTransfers) {
    return 0;
  }

  // Transfer 4 = 1M, 5 = 2M, 6 = 3M, ...
  return usedTransfers - freeTransfers + 1;
}

export function getTransferBudgetAvailable(transfer, roster, allCyclists, gameRules, transferCost) {
  const budgetLimit = getBudgetLimit(gameRules);
  const cyclistById = new Map((allCyclists || []).map((cyclist) => [cyclist.id, cyclist]));
  const { ridersIn = [], ridersOut = [] } = transfer;

  const remainingBudget = budgetLimit - rosterBudget(roster);
  const outValue = ridersOut.reduce(
    (sum, id) => sum + (Number(cyclistById.get(id)?.price) || 0),
    0
  );
  const inValue = ridersIn.reduce(
    (sum, id) => sum + (Number(cyclistById.get(id)?.price) || 0),
    0
  );

  return remainingBudget + outValue - inValue - transferCost;
}

export function formatTransferCostLabel(transferNumber, cost) {
  if (cost <= 0) {
    return `transfer ${transferNumber} = gratis`;
  }
  return `transfer ${transferNumber} = ${cost}M`;
}

export function getNextTransferNumber(usedTransfers) {
  return usedTransfers + 1;
}

export function validateTransfer(transfer, roster, allCyclists, gameRules, usedTransfers = 0) {
  const errors = [];
  const { ridersIn = [], ridersOut = [] } = transfer;

  if (ridersIn.length !== ridersOut.length) {
    errors.push("Transfers must swap the same number of riders in and out.");
  }

  const rosterIds = new Set((roster || []).map((c) => c.id));
  const cyclistById = new Map((allCyclists || []).map((c) => [c.id, c]));

  for (const id of ridersOut) {
    if (!rosterIds.has(id)) {
      errors.push(`Cannot transfer out cyclist ${id} — not in roster.`);
    }
  }

  for (const id of ridersIn) {
    if (rosterIds.has(id)) {
      errors.push(`Cyclist ${id} is already in roster.`);
    }
    const meta = cyclistById.get(id);
    if (meta?.participating === false) {
      errors.push(`Cyclist ${id} is not participating.`);
    }
  }

  const nextRoster = (roster || [])
    .filter((c) => !ridersOut.includes(c.id))
    .concat(ridersIn.map((id) => cyclistById.get(id)).filter(Boolean));

  const rosterCheck = validateRoster(nextRoster, allCyclists, gameRules);
  errors.push(...rosterCheck.errors);

  const cost = calculateNextTransferCost(usedTransfers, gameRules);
  const budgetAfter = getTransferBudgetAvailable(transfer, roster, allCyclists, gameRules, cost);
  if (budgetAfter < 0) {
    errors.push(
      `Transfer exceeds available budget (short ${Math.abs(budgetAfter)}M after transfer cost).`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    transferCost: cost,
    nextRoster,
    nextTransferNumber: usedTransfers + 1,
    budgetAfterTransfer: budgetAfter
  };
}
