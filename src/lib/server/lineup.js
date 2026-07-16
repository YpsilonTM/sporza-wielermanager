import {
  getLineupSize,
  getStarterCount,
  getSubstituteSlots,
  validateLineup
} from "./rules.js";
import { formatRiderName, formatRoleLabel } from "$lib/format.js";

function entryId(entry) {
  return entry.cyclistId ?? entry.id;
}

export function scoreLineupSuitability(cyclist, match) {
  if (!cyclist) {
    return 0;
  }

  const types = (cyclist.riderTypes || []).map((type) => type.toLowerCase());
  const terrain = match?.terrainType ?? "FLAT";
  const matchType = match?.matchType ?? "GENERAL";

  let score = 0;
  if (Number.isFinite(cyclist.uciRanking) && cyclist.uciRanking > 0) {
    score += Math.max(0, 200 - cyclist.uciRanking);
  }
  score += Number(cyclist.totalBasePoints) || 0;

  const hasType = (...needles) => needles.some((needle) => types.some((type) => type.includes(needle)));

  if (matchType === "TTT" || matchType === "ITT") {
    if (hasType("tijd", "time")) score += 60;
    if (hasType("allround")) score += 25;
    if (hasType("ronde")) score += 15;
  }

  if (terrain === "FLAT") {
    if (hasType("sprinter", "sprint")) score += 50;
    if (hasType("eendags")) score += 20;
  }

  if (terrain === "HILLY") {
    if (hasType("allround", "ronde", "klim")) score += 35;
  }

  if (terrain === "MOUNTAIN") {
    if (hasType("klim", "berg", "ronde")) score += 55;
    if (hasType("allround")) score += 20;
  }

  return score;
}

/**
 * Deterministic lineup from roster suitability ranking.
 * Captain = highest suitability; next starters fill; remainder on bench.
 */
export function buildBaselineLineup(roster, match, gameRules) {
  const lineupSize = getLineupSize(gameRules);
  const starterTarget = getStarterCount(gameRules);
  const riders = [...(roster || [])];

  if (riders.length !== lineupSize || starterTarget <= 0) {
    return riders.map((cyclist, index) => ({
      cyclistId: cyclist.id,
      lineupType: index === 0 ? "CAPTAIN" : index < starterTarget ? "NORMAL" : "SUBSTITUTE",
      reasoning: "Baseline fallback"
    }));
  }

  const ranked = riders
    .map((cyclist) => ({
      cyclist,
      suitability: scoreLineupSuitability(cyclist, match)
    }))
    .sort((a, b) => b.suitability - a.suitability);

  const captain = ranked[0];
  const rest = ranked.slice(1);
  const starterOthers = rest.slice(0, Math.max(0, starterTarget - 1));
  const bench = rest.slice(Math.max(0, starterTarget - 1));

  return [
    {
      cyclistId: captain.cyclist.id,
      lineupType: "CAPTAIN",
      reasoning: `Baseline kapitein (suitability ${captain.suitability})`
    },
    ...starterOthers.map((entry) => ({
      cyclistId: entry.cyclist.id,
      lineupType: "NORMAL",
      reasoning: `Baseline starter (suitability ${entry.suitability})`
    })),
    ...bench.map((entry) => ({
      cyclistId: entry.cyclist.id,
      lineupType: "SUBSTITUTE",
      reasoning: `Baseline bank (suitability ${entry.suitability})`
    }))
  ];
}

export function compactBaselineForPrompt(baselineLineup, roster) {
  const byId = new Map((roster || []).map((cyclist) => [cyclist.id, cyclist]));
  return (baselineLineup || []).map((entry) => ({
    cyclistId: entry.cyclistId,
    lineupType: entry.lineupType,
    name: formatRiderName(byId.get(entry.cyclistId))
  }));
}

export function normalizeLineup(lineup, { gameRules, roster, match }) {
  const lineupSize = getLineupSize(gameRules);
  const starterTarget = getStarterCount(gameRules);
  const subTarget = getSubstituteSlots(gameRules);
  const rosterById = new Map((roster || []).map((cyclist) => [cyclist.id, cyclist]));

  const entries = (lineup || []).map((entry) => ({
    ...entry,
    cyclistId: entryId(entry)
  }));

  if (entries.length !== lineupSize || starterTarget <= 0) {
    return entries;
  }

  const existingValidation = validateLineup(entries, roster, gameRules);
  if (existingValidation.valid) {
    return entries;
  }

  const captainEntry =
    entries.find((entry) => entry.lineupType === "CAPTAIN") ??
    [...entries].sort(
      (a, b) =>
        scoreLineupSuitability(rosterById.get(b.cyclistId), match) -
        scoreLineupSuitability(rosterById.get(a.cyclistId), match)
    )[0];

  const captainId = captainEntry.cyclistId;
  const preservedSubs = new Set(
    entries.filter((entry) => entry.lineupType === "SUBSTITUTE").map((entry) => entry.cyclistId)
  );

  const others = entries
    .filter((entry) => entry.cyclistId !== captainId)
    .map((entry) => ({
      ...entry,
      suitability: scoreLineupSuitability(rosterById.get(entry.cyclistId), match),
      preferredBench: preservedSubs.has(entry.cyclistId)
    }))
    .sort((a, b) => {
      if (a.preferredBench !== b.preferredBench) {
        return a.preferredBench ? 1 : -1;
      }
      return b.suitability - a.suitability;
    });

  const starterOthers = others.slice(0, Math.max(0, starterTarget - 1));
  const benchOthers = others.slice(Math.max(0, starterTarget - 1));

  while (starterOthers.length < starterTarget - 1 && benchOthers.length > 0) {
    starterOthers.push(benchOthers.shift());
  }

  while (benchOthers.length < subTarget && starterOthers.length > 0) {
    benchOthers.unshift(starterOthers.pop());
  }

  return [
    { ...captainEntry, lineupType: "CAPTAIN" },
    ...starterOthers.map((entry) => ({ ...entry, lineupType: "NORMAL" })),
    ...benchOthers.map((entry) => ({ ...entry, lineupType: "SUBSTITUTE" }))
  ];
}

export function splitLineupByRole(lineup) {
  const starters = [];
  const bench = [];

  for (const entry of lineup || []) {
    if (entry.lineupType === "SUBSTITUTE") {
      bench.push(entry);
    } else {
      starters.push(entry);
    }
  }

  return { starters, bench };
}

export function formatLineupRoleLabel(lineupType) {
  return formatRoleLabel(lineupType, "en");
}

export function formatCyclistShort(cyclist) {
  return formatRiderName(cyclist, { includeId: true });
}

export function describeLineup(lineup) {
  const riders = lineup?.riders ?? lineup ?? [];
  const { starters, bench } = splitLineupByRole(
    riders.map((cyclist) => ({
      cyclistId: cyclist.id,
      lineupType: cyclist.lineupType
    }))
  );

  return {
    riders,
    starters: starters.map((entry) => {
      const cyclist = riders.find((rider) => rider.id === entry.cyclistId) ?? entry;
      return { ...cyclist, lineupType: entry.lineupType };
    }),
    bench: bench.map((entry) => {
      const cyclist = riders.find((rider) => rider.id === entry.cyclistId) ?? entry;
      return { ...cyclist, lineupType: entry.lineupType };
    })
  };
}
