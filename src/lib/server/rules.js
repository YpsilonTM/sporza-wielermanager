export const RULES = {
  squadSize: 16,
  lineupSize: 12,
  budgetMillion: 100,
  freeTransfersBeforeCost: 4,
  transferCostIncreasePerTransfer: 1
};

export function getLineupSize(gameRules) {
  return gameRules?.lineup?.requiredNumberOfAthletes ?? RULES.lineupSize;
}

export function getSubstituteSlots(gameRules) {
  return gameRules?.lineup?.substituteSlots ?? 0;
}

export function getStarterCount(gameRules) {
  return getLineupSize(gameRules) - getSubstituteSlots(gameRules);
}

export function getSquadSize(gameRules) {
  return (
    gameRules?.roster?.requiredNumberOfAthletes ??
    gameRules?.lineup?.requiredNumberOfAthletes ??
    RULES.squadSize
  );
}

export function getBudgetLimit(gameRules) {
  const budget = gameRules?.roster?.budget ?? gameRules?.budget;
  if (typeof budget === "number") {
    return budget;
  }
  return RULES.budgetMillion;
}

export function getMaxAthletesFromSameTeam(gameRules) {
  return (
    gameRules?.roster?.maxAthletesFromSameTeam ??
    gameRules?.lineup?.maxAthletesFromSameTeam ??
    4
  );
}

export function getMinimumAthletePrice(gameRules) {
  return gameRules?.minimumAthletePrice ?? gameRules?.roster?.minimumAthletePrice ?? 2;
}

export function rosterIsComplete(roster, gameRules) {
  const squadSize = getSquadSize(gameRules);
  if (!Array.isArray(roster) || roster.length !== squadSize) {
    return false;
  }
  return validateRoster(roster, null, gameRules).valid;
}

export function rosterIdsToCyclists(cyclistIds, allCyclists) {
  const cyclistById = new Map((allCyclists || []).map((c) => [c.id, c]));
  return cyclistIds.map((id) => cyclistById.get(id)).filter(Boolean);
}

export function rosterBudget(roster) {
  return (roster || []).reduce((sum, cyclist) => sum + (Number(cyclist.price) || 0), 0);
}

export function validateRoster(roster, allCyclists, gameRules) {
  const errors = [];
  const squadSize = getSquadSize(gameRules);
  const budgetLimit = getBudgetLimit(gameRules);
  const maxPerTeam = getMaxAthletesFromSameTeam(gameRules);
  const minPrice = getMinimumAthletePrice(gameRules);
  const cyclistById = new Map((allCyclists || []).map((c) => [c.id, c]));

  if (!Array.isArray(roster) || roster.length !== squadSize) {
    errors.push(`Roster must contain exactly ${squadSize} cyclists.`);
  }

  const ids = new Set();
  const teamCounts = new Map();
  for (const cyclist of roster || []) {
    const id = cyclist.id ?? cyclist;
    if (ids.has(id)) {
      errors.push(`Duplicate cyclist id ${id}.`);
    }
    ids.add(id);

    const meta = cyclistById.get(id) || cyclist;
    if (meta.participating === false) {
      errors.push(`Cyclist ${id} is not participating.`);
    }

    const price = Number(meta.price ?? cyclist.price);
    if (Number.isFinite(price) && price < minPrice) {
      errors.push(`Cyclist ${id} below minimum price ${minPrice}M.`);
    }

    const teamId = meta.teamId ?? meta.team?.id ?? cyclist.teamId ?? cyclist.team?.id;
    if (teamId != null) {
      const count = (teamCounts.get(teamId) ?? 0) + 1;
      teamCounts.set(teamId, count);
      if (count > maxPerTeam) {
        errors.push(`Team ${teamId} exceeds max ${maxPerTeam} riders.`);
      }
    }
  }

  const total = rosterBudget(roster);
  if (total > budgetLimit) {
    errors.push(`Roster budget ${total}M exceeds limit ${budgetLimit}M.`);
  }

  return { valid: errors.length === 0, errors, totalBudget: total };
}

export function validateRosterIds(cyclistIds, allCyclists, gameRules) {
  const roster = rosterIdsToCyclists(cyclistIds, allCyclists);
  if (roster.length !== cyclistIds.length) {
    const found = new Set(roster.map((c) => c.id));
    const missing = cyclistIds.filter((id) => !found.has(id));
    return {
      valid: false,
      errors: [`Unknown cyclist ids: ${missing.join(", ")}.`],
      roster,
      totalBudget: rosterBudget(roster)
    };
  }

  const result = validateRoster(roster, allCyclists, gameRules);
  return { ...result, roster };
}

export function validateLineup(lineup, roster, gameRules) {
  const errors = [];
  const lineupSize = getLineupSize(gameRules);
  const starterCount = getStarterCount(gameRules);
  const substituteSlots = getSubstituteSlots(gameRules);
  const rosterIds = new Set((roster || []).map((c) => c.id));

  if (!Array.isArray(lineup) || lineup.length !== lineupSize) {
    errors.push(`Lineup must contain exactly ${lineupSize} cyclists.`);
  }

  const starters = (lineup || []).filter((entry) => entry.lineupType !== "SUBSTITUTE");
  const substitutes = (lineup || []).filter((entry) => entry.lineupType === "SUBSTITUTE");
  const captains = (lineup || []).filter((entry) => entry.lineupType === "CAPTAIN");

  if (substituteSlots > 0 && starters.length !== starterCount) {
    errors.push(`Lineup must have exactly ${starterCount} starters and ${substituteSlots} on the bench.`);
  }

  if (substituteSlots > 0 && substitutes.length !== substituteSlots) {
    errors.push(`Lineup must have exactly ${substituteSlots} substitutes on the bench.`);
  }

  if (captains.length !== 1) {
    errors.push("Lineup must have exactly one CAPTAIN.");
  }

  const ids = new Set();
  for (const entry of lineup || []) {
    const id = entry.cyclistId ?? entry.id;
    if (!rosterIds.has(id)) {
      errors.push(`Cyclist ${id} is not in your roster.`);
    }
    if (ids.has(id)) {
      errors.push(`Duplicate lineup cyclist ${id}.`);
    }
    ids.add(id);

    if (!["CAPTAIN", "NORMAL", "SUBSTITUTE"].includes(entry.lineupType)) {
      errors.push(`Invalid lineupType for cyclist ${id}.`);
    }
  }

  return { valid: errors.length === 0, errors, starters, substitutes };
}

export function getFreeTransfers(gameRules, transferSummary) {
  const candidates = [
    transferSummary?.numberOfFreeTransfers,
    gameRules?.transfer?.freeTransfers,
    gameRules?.transfer?.numberOfFreeTransfers,
    gameRules?.transfers?.freeTransfers,
    gameRules?.transfers?.numberOfFreeTransfers,
    gameRules?.numberOfFreeTransfers
  ];

  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return RULES.freeTransfersBeforeCost;
}

export function getFreeTransfersRemaining(transferSummary, gameRules) {
  const remainingCandidates = [
    transferSummary?.remainingFreeTransfers,
    transferSummary?.freeTransfersRemaining,
    transferSummary?.freeTransfers
  ];

  for (const value of remainingCandidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  const usedTransfers = Number(transferSummary?.usedTransfers) || 0;
  return Math.max(0, getFreeTransfers(gameRules, transferSummary) - usedTransfers);
}

export function lineupToApiPayload(lineup) {
  return lineup.map((entry) => ({
    id: entry.cyclistId ?? entry.id,
    lineupType: entry.lineupType
  }));
}
