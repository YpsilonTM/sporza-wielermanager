/** Official Sporza Wielermanager Tour 2026 puntentelling (tour-m-26/rules). */

export const STAGE_FINISH_POINTS: Record<number, number> = {
	1: 100,
	2: 80,
	3: 65,
	4: 55,
	5: 48,
	6: 44,
	7: 40,
	8: 36,
	9: 32,
	10: 30,
	11: 27,
	12: 24,
	13: 22,
	14: 20,
	15: 18,
	16: 16,
	17: 14,
	18: 12,
	19: 10,
	20: 9,
	21: 8,
	22: 7,
	23: 6,
	24: 5,
	25: 4,
	26: 3,
	27: 2,
	28: 2,
	29: 1,
	30: 1
};

/** TTT: each finishing rider scores based on their team's place. */
export const TTT_TEAM_POINTS: Record<number, number> = {
	1: 50,
	2: 40,
	3: 33,
	4: 28,
	5: 23,
	6: 18,
	7: 15,
	8: 13,
	9: 10,
	10: 9,
	11: 8,
	12: 7,
	13: 7,
	14: 6,
	15: 6,
	16: 5,
	17: 5,
	18: 4,
	19: 4,
	20: 3,
	21: 3,
	22: 2,
	23: 1
};

/** Captain (kopman) bonus when finishing top 6 — not a 2× multiplier. */
export const CAPTAIN_BONUS: Record<number, number> = {
	1: 30,
	2: 25,
	3: 20,
	4: 15,
	5: 10,
	6: 5
};

export const CAPTAIN_TTT_BONUS: Record<number, number> = {
	1: 15,
	2: 12,
	3: 10,
	4: 7,
	5: 5,
	6: 2
};

export const JERSEY_BONUS = {
	GENERAL: 20,
	POINTS: 10,
	MOUNTAIN: 10,
	YOUTH: 5
} as const;

export const TEAMMATE_STAGE_WINNER_BONUS = 10;
export const COMBATIVITY_BONUS = 10;
export const SUPER_COMBATIVITY_BONUS = 50;

/** Compact NL summary for Gemini prompts. */
export function formatScoringRulesForPrompt(matchType?: string): string {
	const isTtt = matchType === 'TTT';
	const finishHint = isTtt
		? 'TTT: elke uitrijdende renner scoort volgens de ploegplaats (1e=50 … 23e=1), niet individuele finish.'
		: 'Weg/ITT: finishplaats 1–30 → 100/80/65/55/48/44/40/36/32/30/27/24/22/20/18/16/14/12/10/9/8/7/6/5/4/3/2/2/1/1.';

	const captainHint = isTtt
		? 'Kopman-bonus TTT top 6: +15/+12/+10/+7/+5/+2 (op basis van ploegplaats).'
		: 'Kopman-bonus top 6: +30/+25/+20/+15/+10/+5. Kapitein is GEEN 2× multiplier.';

	return `
PUNTENTELLING (officieel Sporza):
- Alleen de 12 starters scoren; bank ("de bus") scoort 0 (behalve eindbonus na slotrit).
- ${finishHint}
- ${captainHint}
- Truien bij start van de rit (starters): geel/GC +20, groen/punten +10, bolletjes/berg +10, wit/jongeren +5.
- Ploegmaats van ritwinnaar: +10 elk (NIET bij ITT/TTT).
- Strijdlustigste renner: +10.
- Zoek wie de specialtruien draagt en start hen indien gezond — gratis bonuspunten.
`.trim();
}
