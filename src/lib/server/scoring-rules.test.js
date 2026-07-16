import { describe, expect, test } from 'bun:test';
import {
	CAPTAIN_BONUS,
	CAPTAIN_TTT_BONUS,
	JERSEY_BONUS,
	STAGE_FINISH_POINTS,
	TTT_TEAM_POINTS,
	formatScoringRulesForPrompt
} from './scoring-rules.ts';

describe('scoring-rules', () => {
	test('stage finish table matches official top places', () => {
		expect(STAGE_FINISH_POINTS[1]).toBe(100);
		expect(STAGE_FINISH_POINTS[2]).toBe(80);
		expect(STAGE_FINISH_POINTS[6]).toBe(44);
		expect(STAGE_FINISH_POINTS[30]).toBe(1);
	});

	test('TTT and captain bonuses match official tables', () => {
		expect(TTT_TEAM_POINTS[1]).toBe(50);
		expect(TTT_TEAM_POINTS[2]).toBe(40);
		expect(CAPTAIN_BONUS[1]).toBe(30);
		expect(CAPTAIN_BONUS[6]).toBe(5);
		expect(CAPTAIN_TTT_BONUS[1]).toBe(15);
	});

	test('jersey bonuses', () => {
		expect(JERSEY_BONUS.GENERAL).toBe(20);
		expect(JERSEY_BONUS.POINTS).toBe(10);
		expect(JERSEY_BONUS.MOUNTAIN).toBe(10);
		expect(JERSEY_BONUS.YOUTH).toBe(5);
	});

	test('prompt summary mentions jersey and captain rules', () => {
		const text = formatScoringRulesForPrompt('GENERAL');
		expect(text).toContain('Kopman-bonus');
		expect(text).toContain('GEEN 2×');
		expect(text).toContain('+20');
		expect(formatScoringRulesForPrompt('TTT')).toContain('TTT');
	});
});
