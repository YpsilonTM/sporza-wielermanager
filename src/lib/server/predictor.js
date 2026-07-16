import { GoogleGenAI } from "@google/genai";

import { formatRiderName } from "$lib/format.js";

import {
  getLineupSize,
  getSquadSize,
  getBudgetLimit,
  getStarterCount,
  getSubstituteSlots,
  getMaxAthletesFromSameTeam,
  getMinimumAthletePrice,
  getFreeTransfers
} from "./rules.js";
import { formatScoringRulesForPrompt } from "./scoring-rules.js";
import { scoreLineupSuitability, compactBaselineForPrompt } from "./lineup.js";
import { formatPostMortemsForPrompt } from "./post-mortem.js";

const REPAIR_MODEL = "gemini-3.1-flash-lite";

const ROSTER_DECISION_SCHEMA = {
  type: "object",
  properties: {
    cyclistIds: {
      type: "array",
      items: { type: "integer" }
    },
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cyclistId: { type: "integer" },
          reasoning: { type: "string" }
        },
        required: ["cyclistId", "reasoning"]
      }
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    summary: { type: "string" }
  },
  required: ["cyclistIds", "confidence", "summary"],
  additionalProperties: false
};

const MANAGER_DECISION_SCHEMA = {
  type: "object",
  properties: {
    lineup: {
      type: "array",
      items: {
        type: "object",
        properties: {
          cyclistId: { type: "integer" },
          lineupType: { type: "string", enum: ["CAPTAIN", "NORMAL", "SUBSTITUTE"] },
          reasoning: { type: "string" }
        },
        required: ["cyclistId", "lineupType", "reasoning"]
      }
    },
    transfers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ridersIn: { type: "array", items: { type: "integer" } },
          ridersOut: { type: "array", items: { type: "integer" } },
          reasoning: { type: "string" }
        },
        required: ["ridersIn", "ridersOut", "reasoning"]
      }
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    summary: { type: "string" }
  },
  required: ["lineup", "confidence", "summary"],
  additionalProperties: false
};

function tryParseDecision(rawText) {
  const raw = String(rawText || "").trim();
  const json = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  try {
    return JSON.parse(json);
  } catch {
    const start = json.indexOf("{");
    const end = json.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      return JSON.parse(json.slice(start, end + 1));
    }
    throw new Error("Gemini returned malformed JSON.");
  }
}

async function repairJsonDecision(ai, malformedText, schema) {
  const repairPrompt = `
Fix this output into valid JSON matching the required schema exactly.
Return only JSON object text, no markdown.

Malformed output:
${malformedText}
`.trim();

  const repaired = await ai.models.generateContent({
    model: REPAIR_MODEL,
    contents: repairPrompt,
    config: {
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema
        }
      },
      temperature: 0
    }
  });

  return tryParseDecision(repaired.text);
}

async function repairRosterDecision(ai, malformedText) {
  return repairJsonDecision(ai, malformedText, ROSTER_DECISION_SCHEMA);
}

async function repairDecision(ai, malformedText) {
  return repairJsonDecision(ai, malformedText, MANAGER_DECISION_SCHEMA);
}

function compactCyclist(cyclist) {
  return {
    id: cyclist.id,
    name: formatRiderName(cyclist),
    price: cyclist.price,
    team: cyclist.team?.name ?? cyclist.teamId,
    riderTypes: cyclist.riderTypes ?? [],
    totalBasePoints: cyclist.totalBasePoints ?? 0,
    uciRanking: cyclist.uciRanking ?? null,
    participating: cyclist.participating !== false
  };
}

/** Riders not in roster who are scoring well — candidates for form-based transfers. */
export function pickHotTransferTargets(allCyclists, roster, match, limit = 25) {
  const rosterIds = new Set((roster || []).map((c) => c.id));
  const rosterPoints = (roster || []).map((c) => Number(c.totalBasePoints) || 0);
  const rosterMedian =
    rosterPoints.length > 0
      ? [...rosterPoints].sort((a, b) => a - b)[Math.floor(rosterPoints.length / 2)]
      : 0;

  return (allCyclists || [])
    .filter(
      (c) =>
        c.participating !== false &&
        !rosterIds.has(c.id) &&
        (Number(c.totalBasePoints) || 0) > 0
    )
    .sort((a, b) => {
      const pointsDiff = (Number(b.totalBasePoints) || 0) - (Number(a.totalBasePoints) || 0);
      if (pointsDiff !== 0) return pointsDiff;
      return scoreLineupSuitability(b, match) - scoreLineupSuitability(a, match);
    })
    .filter((c) => (Number(c.totalBasePoints) || 0) >= Math.max(rosterMedian * 0.8, 20))
    .slice(0, limit)
    .map(compactCyclist);
}

function buildRosterPrompt(context) {
  const { editionName, allCyclists, gameRules, todayStr, currentRoster, match, minutesUntilDeadline } =
    context;
  const squadSize = getSquadSize(gameRules);
  const budgetLimit = getBudgetLimit(gameRules);
  const maxPerTeam = getMaxAthletesFromSameTeam(gameRules);
  const minPrice = getMinimumAthletePrice(gameRules);
  const isPreRaceReview = Array.isArray(currentRoster) && currentRoster.length === squadSize;

  const available = (allCyclists || [])
    .filter((c) => c.participating !== false && Number(c.price) >= minPrice)
    .sort((a, b) => {
      const rankA = a.uciRanking ?? 9999;
      const rankB = b.uciRanking ?? 9999;
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      return (b.totalBasePoints ?? 0) - (a.totalBasePoints ?? 0);
    })
    .slice(0, 120)
    .map(compactCyclist);

  if (isPreRaceReview) {
    const currentIds = new Set(currentRoster.map((c) => c.id));
    const replacements = available.filter((c) => !currentIds.has(c.id)).slice(0, 60);

    return `
Je bent een expert fantasy wielermanager voor Sporza Wielermanager.
VANDAAG: ${todayStr} (Europe/Brussels).

Doel: herzie mijn BESTAANDE ploeg vóór rit 1. Tot de deadline mag ik GRATIS en ONBEPERKT renners wisselen in mijn squad.
${minutesUntilDeadline != null ? `Deadline over ~${minutesUntilDeadline} minuten.` : ""}
${match ? `Eerste rit: ${match.name} (${match.terrainType ?? "?"}, ${match.matchType ?? "?"})` : ""}

ZOEK ACTUEEL (Google Search) per renner in MIJN PLOEG:
- blessures, ziekte, maag-/maag-darmproblemen, griep, vermoeidheid
- DNS/DNF-risico, twijfel over start of volledige etappe

BESLISREGELS:
- Vervang renners met bevestigde of waarschijnlijke uitval door passende vervangers
- Behoud gezonde kernrenners — alleen noodzakelijke wijzigingen
- Geen transferkosten; dit is gratis ploegbeheer vóór rit 1
- Exact ${squadSize} unieke cyclistIds, budget max ${budgetLimit}M, max ${maxPerTeam} per team

HUIDIGE PLOEG (${squadSize} renners):
${JSON.stringify(currentRoster.map(compactCyclist), null, 2)}

MOGELIJKE VERVANGERS (niet in huidige ploeg):
${JSON.stringify(replacements, null, 2)}

Return ALLEEN JSON met cyclistIds (${squadSize} integers), picks (reasoning per renner), confidence, summary (vermeld expliciet wie eruit gaat en waarom).
`.trim();
  }

  return `
Je bent een expert fantasy wielermanager voor Sporza Wielermanager.
VANDAAG: ${todayStr} (Europe/Brussels).

Doel: stel een COMPLETE ploeg samen van exact ${squadSize} renners voor ${editionName ?? "deze editie"}.
Dit is de initiële squad-selectie voor een nieuw seizoen — geen lineup voor één rit.

HARde REGELS (moeten kloppen):
- Exact ${squadSize} unieke cyclistIds
- Totaal budget max ${budgetLimit}M (som van prijzen)
- Minimumprijs per renner: ${minPrice}M
- Max ${maxPerTeam} renners per WorldTour-team
- Alleen deelnemende renners (participating=true)

STRATEGIE:
- Balans voor een meerweekse ronde: ronderenners/GC, sprinters, klimmers, tijdrijders, knechten
- Mix prijs/kwaliteit zodat budget optimaal benut wordt (niet te veel budget ongebruikt laten)
- Gebruik Google Search voor startlijst, favorieten, blessurenieuws en actuele gezondheidsupdates
- Sluit renners uit met bevestigde blessure, ziekte of maagproblemen

BESCHIKBARE RENNERS (subset — kies alleen ids uit deze lijst of de volledige deelnemerslijst):
${JSON.stringify(available, null, 2)}

Return ALLEEN JSON met:
- cyclistIds: array van ${squadSize} integers
- picks: optioneel per renner korte reasoning
- confidence: high/medium/low
- summary: korte NL samenvatting van de ploegopbouw
`.trim();
}

function buildPrompt(context) {
  const {
    match,
    roster,
    allCyclists,
    gameRules,
    todayStr,
    transfersAllowed,
    preRaceSquadWindow,
    minutesUntilDeadline,
    editionName,
    baselineLineup,
    postMortems
  } = context;
  const lineupSize = getLineupSize(gameRules);
  const starterCount = getStarterCount(gameRules);
  const substituteSlots = getSubstituteSlots(gameRules);
  const squadSize = getSquadSize(gameRules);

  const rosterCompact = (roster || []).map(compactCyclist);
  const available = (allCyclists || [])
    .filter((c) => c.participating !== false)
    .sort(
      (a, b) =>
        scoreLineupSuitability(b, match) - scoreLineupSuitability(a, match)
    )
    .slice(0, 80)
    .map(compactCyclist);
  const hotTargets = transfersAllowed
    ? pickHotTransferTargets(allCyclists, roster, match, 25)
    : [];

  const benchRule =
    substituteSlots > 0
      ? `- Exact ${starterCount} starters (${starterCount - 1} NORMAL + 1 CAPTAIN) + exact ${substituteSlots} SUBSTITUTE op de bank ("De bus")
- Starters scoren punten; bankrenners alleen als ze een starter vervangen`
      : `- Exact ${lineupSize} renners in lineup met 1 CAPTAIN`;

  const transferRule = transfersAllowed
    ? `Optioneel: stel maximaal 1 transfer voor (zelfde aantal renners in/uit).
- Transfers 1-${getFreeTransfers(gameRules)} gratis, daarna +1M kost per transfer (afgetrokken van budget)
- Prioriteit 1 — MUST: bevestigde blessure/DNS/uitval in MIJN PLOEG → transfer die renner eruit
- Prioriteit 2 — MAY: een renner BUITEN mijn ploeg scoort duidelijk beter (hoge totalBasePoints / recente vorm / trui) dan mijn zwakste of minst passende renner → transfer voorstel
- Alleen vorm-transfer als het verschil groot is (niet voor marginale upgrades) en budget/teamlimiet klopt
- Gebruik Google Search voor recente etappeuitslagen en wie in vorm is
- Geen transfer? Laat transfers weglaten of leeg.`
    : preRaceSquadWindow
      ? `Transfers via transfer-API zijn gesloten, maar vóór rit 1 is de ploeg al herzien op gezondheid.
Stel GEEN transfers voor in JSON — focus op lineup. Zieke/gekwetste renners die nog in de ploeg zitten: NOOIT starter of kapitein.`
      : `Transfers zijn NOG NIET open (vóór rit 1). Stel GEEN transfers voor — ploegwijzigingen gaan via gratis ploegbeheer.`;

  const deadlineNote =
    minutesUntilDeadline != null ? `\nDeadline over ~${minutesUntilDeadline} minuten.` : "";

  const baselineBlock =
    Array.isArray(baselineLineup) && baselineLineup.length
      ? `
VOORGESTELDE BASELINE (deterministisch op ritgeschiktheid):
${JSON.stringify(compactBaselineForPrompt(baselineLineup, roster), null, 2)}
Wijk alleen af met duidelijke reden (vorm, gezondheid, trui, etappefavoriet). Kapitein = beste top-6 EV die gezond is — niet automatisch de sterkste GC-renner.
`
      : "";

  const postMortemBlock = formatPostMortemsForPrompt(postMortems || [], roster);
  const editionLabel = editionName || "Sporza Wielermanager";

  return `
Je bent een expert fantasy wielermanager voor ${editionLabel}.
VANDAAG: ${todayStr} (Europe/Brussels).${deadlineNote}

Doel: kies de beste lineup van ${lineupSize} renners uit mijn vaste ploeg (${squadSize} renners) voor de komende rit.
${transferRule}

${formatScoringRulesForPrompt(match?.matchType)}
${postMortemBlock ? `\n${postMortemBlock}\n` : ""}
GEZONDHEID (KRITISCH — altijd eerst checken via Google Search):
- Zoek actueel nieuws per renner: blessures, maag-/maag-darmproblemen, ziekte, vermoeidheid, DNS-risico
- Renners met gezondheidsproblemen: NOOIT CAPTAIN, NOOIT starter — alleen SUBSTITUTE (bank) als ze nog in de ploeg zitten
- Bij twijfel over fitness: bank, niet starten
- Zoek wie geel/groen/bolletjes/wit draagt en start hen indien gezond (trui-bonussen)
- Kapitein = renner met hoogste verwachte punten + kapitein-bonus (top 6) die GEZOND is en past bij het ritprofiel

RIT:
- id: ${match.id}
- naam: ${match.name}
- nummer: ${match.matchNumber ?? "?"}
- type: ${match.matchType ?? "GENERAL"}
- terrein: ${match.terrainType ?? "UNKNOWN"}
- afstand: ${match.distance != null ? `${match.distance} km` : "?"}
- deadline: ${match.deadline ?? match.startTime}
- route: ${match.startLocation ?? "?"} → ${match.finishLocation ?? "?"}
- profiel: ${match.stageProfileUrl ?? "n.v.t."}

REGELS:
- Exact ${lineupSize} renners in lineup (iedereen uit mijn ploeg moet voorkomen)
${benchRule}
- CAPTAIN moet een starter zijn, nooit op de bank
- Kies starters op basis van ritprofiel (TTT/ITT/bergen/vlak); zet minder geschikte renners op de bank
- Alleen renners uit MIJN ROSTER in lineup${transfersAllowed ? " (tenzij je transfer voorstelt)" : ""}
${baselineBlock}
Gebruik Google Search voor recente vorm, blessures, gezondheidsupdates, truiendragers en etappeverwachting vandaag.

MIJN ROSTER:
${JSON.stringify(rosterCompact, null, 2)}

${
  hotTargets.length
    ? `HOT TRANSFER TARGETS (niet in mijn ploeg, hoog scorend — overweeg als upgrade):
${JSON.stringify(hotTargets, null, 2)}
`
    : ""
}TOP BESCHIKBARE RENNERS (referentie${transfersAllowed ? " voor transfers — gesorteerd op ritgeschiktheid" : ""}):
${JSON.stringify(available.slice(0, 40), null, 2)}

Return ALLEEN JSON met: lineup (cyclistId, lineupType, reasoning), transfers (optioneel), confidence (high/medium/low), summary.
`.trim();
}

const UNCERTAINTY_PATTERN = /onduidelijk|onbekend|moeilijk|twijfel|uncertain|unclear/;

function needsEscalation(decision) {
  if (decision.confidence === "low") {
    return true;
  }
  if (!Array.isArray(decision.lineup) || decision.lineup.length === 0) {
    return true;
  }
  const combined = `${decision.summary} ${decision.lineup.map((l) => l.reasoning).join(" ")}`.toLowerCase();
  return UNCERTAINTY_PATTERN.test(combined);
}

function asPickList(picks) {
  return Array.isArray(picks) ? picks : [];
}

function normalizeRosterDecision(decision) {
  if (!decision || typeof decision !== "object") {
    return decision;
  }
  decision.picks = asPickList(decision.picks);
  return decision;
}

function needsRosterEscalation(decision, gameRules) {
  if (decision.confidence === "low") {
    return true;
  }
  const squadSize = getSquadSize(gameRules);
  if (!Array.isArray(decision.cyclistIds) || decision.cyclistIds.length !== squadSize) {
    return true;
  }
  const combined = `${decision.summary} ${asPickList(decision.picks).map((p) => p.reasoning).join(" ")}`.toLowerCase();
  return UNCERTAINTY_PATTERN.test(combined);
}

async function generateStructuredDecision(ai, model, prompt, schema, debug, { temperature = 0.2, logLabel = "Gemini" } = {}) {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema
        }
      },
      temperature
    }
  });
  debug(`${logLabel} raw (${model}): ${String(response.text || "").slice(0, 400)}`);
  return response.text;
}

async function generateDecision(ai, model, prompt, debug) {
  return generateStructuredDecision(ai, model, prompt, MANAGER_DECISION_SCHEMA, debug);
}

async function generateRosterDecision(ai, model, prompt, debug) {
  return generateStructuredDecision(ai, model, prompt, ROSTER_DECISION_SCHEMA, debug, {
    temperature: 0.3,
    logLabel: "Gemini roster"
  });
}

async function predictWithEscalation({
  ai,
  defaultModel,
  escalationModel,
  prompt,
  schema,
  repairFn,
  generateFn,
  needsEscalationFn,
  normalizeFn,
  escalationSuffix,
  onDebug
}) {
  let model = defaultModel;
  let rawText = await generateFn(ai, model, prompt, onDebug);
  let decision;
  try {
    decision = normalizeFn(tryParseDecision(rawText));
  } catch {
    decision = normalizeFn(await repairFn(ai, rawText));
  }

  if (needsEscalationFn(decision)) {
    onDebug(`Escalating to ${escalationModel}`);
    model = escalationModel;
    const escalationPrompt = `${prompt}\n\n${escalationSuffix}`;
    rawText = await generateFn(ai, model, escalationPrompt, onDebug);
    try {
      decision = normalizeFn(tryParseDecision(rawText));
    } catch {
      decision = normalizeFn(await repairFn(ai, rawText));
    }
    decision.escalated = true;
  }

  decision.model = model;
  return normalizeFn(decision);
}

export async function predictRosterDecision(apiKey, context, options = {}) {
  const ai = new GoogleGenAI({ apiKey });
  const onDebug = typeof options.onDebug === "function" ? options.onDebug : () => {};
  const defaultModel = options.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const escalationModel = options.escalationModel || process.env.GEMINI_ESCALATION_MODEL || "gemini-2.5-pro";

  const todayStr = new Date().toLocaleDateString("nl-BE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Brussels"
  });

  const prompt = buildRosterPrompt({ ...context, todayStr });
  try {
    return await predictWithEscalation({
      ai,
      defaultModel,
      escalationModel,
      prompt,
      schema: ROSTER_DECISION_SCHEMA,
      repairFn: repairRosterDecision,
      generateFn: generateRosterDecision,
      needsEscalationFn: (decision) => needsRosterEscalation(decision, context.gameRules),
      normalizeFn: normalizeRosterDecision,
      escalationSuffix: `Extra: vorige poging was onvolledig of onzeker. Lever exact ${getSquadSize(context.gameRules)} geldige cyclistIds die alle regels respecteren.`,
      onDebug
    });
  } catch (error) {
    onDebug(`Roster prediction failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

export async function predictLineupDecision(apiKey, context, options = {}) {
  const ai = new GoogleGenAI({ apiKey });
  const onDebug = typeof options.onDebug === "function" ? options.onDebug : () => {};
  const defaultModel = options.model || process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const escalationModel = options.escalationModel || process.env.GEMINI_ESCALATION_MODEL || "gemini-2.5-pro";

  const todayStr = new Date().toLocaleDateString("nl-BE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Europe/Brussels"
  });

  const prompt = buildPrompt({ ...context, todayStr });
  try {
    return await predictWithEscalation({
      ai,
      defaultModel,
      escalationModel,
      prompt,
      schema: MANAGER_DECISION_SCHEMA,
      repairFn: repairDecision,
      generateFn: generateDecision,
      needsEscalationFn: needsEscalation,
      normalizeFn: (decision) => decision,
      escalationSuffix:
        "Extra: vorige analyse was te onzeker. Wees grondiger en kies de meest waarschijnlijke lineup voor dit ritprofiel.",
      onDebug
    });
  } catch (error) {
    onDebug(`Prediction failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
