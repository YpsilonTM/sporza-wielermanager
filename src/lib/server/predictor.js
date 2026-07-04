import { GoogleGenAI } from "@google/genai";

import {
  getLineupSize,
  getSquadSize,
  getBudgetLimit,
  getStarterCount,
  getSubstituteSlots,
  getMaxAthletesFromSameTeam,
  getMinimumAthletePrice
} from "./rules.js";

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

async function repairRosterDecision(ai, malformedText) {
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
          schema: ROSTER_DECISION_SCHEMA
        }
      },
      temperature: 0
    }
  });

  return tryParseDecision(repaired.text);
}

async function repairDecision(ai, malformedText) {
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
          schema: MANAGER_DECISION_SCHEMA
        }
      },
      temperature: 0
    }
  });

  return tryParseDecision(repaired.text);
}

function compactCyclist(cyclist) {
  return {
    id: cyclist.id,
    name: `${cyclist.firstName} ${cyclist.lastName}`.trim(),
    price: cyclist.price,
    team: cyclist.team?.name ?? cyclist.teamId,
    riderTypes: cyclist.riderTypes ?? [],
    totalBasePoints: cyclist.totalBasePoints ?? 0,
    uciRanking: cyclist.uciRanking ?? null,
    participating: cyclist.participating !== false
  };
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
    minutesUntilDeadline
  } = context;
  const lineupSize = getLineupSize(gameRules);
  const starterCount = getStarterCount(gameRules);
  const substituteSlots = getSubstituteSlots(gameRules);
  const squadSize = getSquadSize(gameRules);
  const budgetLimit = getBudgetLimit(gameRules);

  const rosterCompact = (roster || []).map(compactCyclist);
  const available = (allCyclists || [])
    .filter((c) => c.participating !== false)
    .sort((a, b) => (b.totalBasePoints ?? 0) - (a.totalBasePoints ?? 0))
    .slice(0, 80)
    .map(compactCyclist);

  const benchRule =
    substituteSlots > 0
      ? `- Exact ${starterCount} starters (${starterCount - 1} NORMAL + 1 CAPTAIN) + exact ${substituteSlots} SUBSTITUTE op de bank ("De bus")
- Starters scoren punten; bankrenners alleen als ze een starter vervangen`
      : `- Exact ${lineupSize} renners in lineup met 1 CAPTAIN`;

  const transferRule = transfersAllowed
    ? `Optioneel: stel maximaal 1 transfer voor bij bevestigde blessure/uitval (zelfde aantal renners in/uit).
- Transfers 1-3 gratis, daarna +1M kost per transfer (afgetrokken van budget)
- Stel GEEN transfer voor tenzij een renner uit je ploeg bevestigd niet start`
    : preRaceSquadWindow
      ? `Transfers via transfer-API zijn gesloten, maar vóór rit 1 is de ploeg al herzien op gezondheid.
Stel GEEN transfers voor in JSON — focus op lineup. Zieke/gekwetste renners die nog in de ploeg zitten: NOOIT starter of kapitein.`
      : `Transfers zijn NOG NIET open (vóór rit 1). Stel GEEN transfers voor — ploegwijzigingen gaan via gratis ploegbeheer.`;

  const deadlineNote =
    minutesUntilDeadline != null ? `\nDeadline over ~${minutesUntilDeadline} minuten.` : "";

  return `
Je bent een expert fantasy wielermanager voor Sporza Wielermanager (Tour de France 2026).
VANDAAG: ${todayStr} (Europe/Brussels).${deadlineNote}

Doel: kies de beste lineup van ${lineupSize} renners uit mijn vaste ploeg (${squadSize} renners) voor de komende rit.
${transferRule}

GEZONDHEID (KRITISCH — altijd eerst checken via Google Search):
- Zoek actueel nieuws per renner: blessures, maag-/maag-darmproblemen, ziekte, vermoeidheid, DNS-risico
- Renners met gezondheidsproblemen: NOOIT CAPTAIN, NOOIT starter — alleen SUBSTITUTE (bank) als ze nog in de ploeg zitten
- Bij twijfel over fitness: bank, niet starten
- Kapitein = renner met hoogste verwachte punten die GEZOND is en past bij het ritprofiel

RIT:
- id: ${match.id}
- naam: ${match.name}
- type: ${match.matchType ?? "GENERAL"}
- terrein: ${match.terrainType ?? "UNKNOWN"}
- deadline: ${match.deadline ?? match.startTime}
- route: ${match.startLocation ?? "?"} → ${match.finishLocation ?? "?"}

REGELS:
- Exact ${lineupSize} renners in lineup (iedereen uit mijn ploeg moet voorkomen)
${benchRule}
- CAPTAIN moet een starter zijn, nooit op de bank
- Kies starters op basis van ritprofiel (TTT/ITT/bergen/vlak); zet minder geschikte renners op de bank
- Alleen renners uit MIJN ROSTER in lineup${transfersAllowed ? " (tenzij je transfer voorstelt)" : ""}

Gebruik Google Search voor recente vorm, blessures, gezondheidsupdates en etappeverwachting vandaag.

MIJN ROSTER:
${JSON.stringify(rosterCompact, null, 2)}

TOP BESCHIKBARE RENNERS (referentie${transfersAllowed ? " voor transfers" : ""}):
${JSON.stringify(available.slice(0, 40), null, 2)}

Return ALLEEN JSON met: lineup (cyclistId, lineupType, reasoning), transfers (optioneel), confidence (high/medium/low), summary.
`.trim();
}

function needsEscalation(decision) {
  if (decision.confidence === "low") {
    return true;
  }
  if (!Array.isArray(decision.lineup) || decision.lineup.length === 0) {
    return true;
  }
  const combined = `${decision.summary} ${decision.lineup.map((l) => l.reasoning).join(" ")}`.toLowerCase();
  return /onduidelijk|onbekend|moeilijk|twijfel|uncertain|unclear/.test(combined);
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
  return /onduidelijk|onbekend|moeilijk|twijfel|uncertain|unclear/.test(combined);
}

async function generateDecision(ai, model, prompt, debug) {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: MANAGER_DECISION_SCHEMA
        }
      },
      temperature: 0.2
    }
  });
  debug(`Gemini raw (${model}): ${String(response.text || "").slice(0, 400)}`);
  return response.text;
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
  let model = defaultModel;

  try {
    let rawText = await generateRosterDecision(ai, model, prompt, onDebug);
    let decision;
    try {
      decision = normalizeRosterDecision(tryParseDecision(rawText));
    } catch {
      decision = normalizeRosterDecision(await repairRosterDecision(ai, rawText));
    }

    if (needsRosterEscalation(decision, context.gameRules)) {
      onDebug(`Escalating roster to ${escalationModel}`);
      model = escalationModel;
      const escalationPrompt = `${prompt}

Extra: vorige poging was onvolledig of onzeker. Lever exact ${getSquadSize(context.gameRules)} geldige cyclistIds die alle regels respecteren.`;
      rawText = await generateRosterDecision(ai, model, escalationPrompt, onDebug);
      try {
        decision = normalizeRosterDecision(tryParseDecision(rawText));
      } catch {
        decision = normalizeRosterDecision(await repairRosterDecision(ai, rawText));
      }
      decision.escalated = true;
    }

    decision.model = model;
    return normalizeRosterDecision(decision);
  } catch (error) {
    onDebug(`Roster prediction failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function generateRosterDecision(ai, model, prompt, debug) {
  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseFormat: {
        text: {
          mimeType: "application/json",
          schema: ROSTER_DECISION_SCHEMA
        }
      },
      temperature: 0.3
    }
  });
  debug(`Gemini roster raw (${model}): ${String(response.text || "").slice(0, 400)}`);
  return response.text;
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
  let model = defaultModel;

  try {
    let rawText = await generateDecision(ai, model, prompt, onDebug);
    let decision;
    try {
      decision = tryParseDecision(rawText);
    } catch {
      decision = await repairDecision(ai, rawText);
    }

    if (needsEscalation(decision)) {
      onDebug(`Escalating to ${escalationModel}`);
      model = escalationModel;
      const escalationPrompt = `${prompt}

Extra: vorige analyse was te onzeker. Wees grondiger en kies de meest waarschijnlijke lineup voor dit ritprofiel.`;
      rawText = await generateDecision(ai, model, escalationPrompt, onDebug);
      try {
        decision = tryParseDecision(rawText);
      } catch {
        decision = await repairDecision(ai, rawText);
      }
      decision.escalated = true;
    }

    decision.model = model;
    return decision;
  } catch (error) {
    onDebug(`Prediction failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}
