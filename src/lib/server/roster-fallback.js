import {
  getBudgetLimit,
  getMaxAthletesFromSameTeam,
  getMinimumAthletePrice,
  getSquadSize,
  rosterBudget,
  validateRoster
} from "./rules.js";

function cyclistTeamId(cyclist) {
  return cyclist.teamId ?? cyclist.team?.id ?? null;
}

function cyclistSortScore(cyclist) {
  const rank = cyclist.uciRanking;
  if (Number.isFinite(rank) && rank > 0) {
    return 10_000 - rank;
  }
  return cyclist.totalBasePoints ?? 0;
}

export function buildFallbackRoster(allCyclists, gameRules) {
  const squadSize = getSquadSize(gameRules);
  const budgetLimit = getBudgetLimit(gameRules);
  const maxPerTeam = getMaxAthletesFromSameTeam(gameRules);
  const minPrice = getMinimumAthletePrice(gameRules);

  const pool = (allCyclists || [])
    .filter((c) => c.participating !== false && Number(c.price) >= minPrice)
    .sort((a, b) => cyclistSortScore(b) - cyclistSortScore(a));

  const selected = [];
  const teamCounts = new Map();

  function canAfford(candidate) {
    const nextBudget = rosterBudget(selected) + Number(candidate.price);
    if (nextBudget > budgetLimit) {
      return false;
    }

    const remainingSlots = squadSize - selected.length - 1;
    if (remainingSlots > 0 && nextBudget + remainingSlots * minPrice > budgetLimit) {
      return false;
    }

    return true;
  }

  function fitsTeamLimit(candidate) {
    const teamId = cyclistTeamId(candidate);
    if (teamId == null) {
      return true;
    }
    return (teamCounts.get(teamId) ?? 0) < maxPerTeam;
  }

  function addCandidate(candidate) {
    selected.push(candidate);
    const teamId = cyclistTeamId(candidate);
    if (teamId != null) {
      teamCounts.set(teamId, (teamCounts.get(teamId) ?? 0) + 1);
    }
  }

  for (const candidate of pool) {
    if (selected.length >= squadSize) {
      break;
    }
    if (!fitsTeamLimit(candidate) || !canAfford(candidate)) {
      continue;
    }
    addCandidate(candidate);
  }

  if (selected.length < squadSize) {
    const cheapPool = [...pool].sort((a, b) => Number(a.price) - Number(b.price));
    for (const candidate of cheapPool) {
      if (selected.some((c) => c.id === candidate.id)) {
        continue;
      }
      if (selected.length >= squadSize) {
        break;
      }
      if (!fitsTeamLimit(candidate) || !canAfford(candidate)) {
        continue;
      }
      addCandidate(candidate);
    }
  }

  const validation = validateRoster(selected, allCyclists, gameRules);
  if (!validation.valid) {
    throw new Error(`Fallback roster invalid: ${validation.errors.join("; ")}`);
  }

  return {
    cyclistIds: selected.map((c) => c.id),
    roster: selected,
    summary: "Fallback roster op basis van UCI-ranking, budget en teamlimieten.",
    confidence: "medium",
    source: "fallback"
  };
}
