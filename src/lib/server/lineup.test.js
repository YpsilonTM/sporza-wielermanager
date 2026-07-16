import { describe, expect, test } from 'bun:test';
import { buildBaselineLineup, scoreLineupSuitability } from './lineup.js';

const gameRules = {
	lineup: { requiredNumberOfAthletes: 4, substituteSlots: 1 }
};

function rider(id, overrides = {}) {
	return {
		id,
		firstName: `R${id}`,
		lastName: 'Test',
		uciRanking: overrides.uciRanking ?? id * 10,
		totalBasePoints: overrides.totalBasePoints ?? 100 - id,
		riderTypes: overrides.riderTypes ?? ['sprinter']
	};
}

describe('buildBaselineLineup', () => {
	test('picks highest suitability as captain and benches lowest', () => {
		const roster = [
			rider(1, { uciRanking: 50, totalBasePoints: 10, riderTypes: ['klimmer'] }),
			rider(2, { uciRanking: 5, totalBasePoints: 200, riderTypes: ['sprinter'] }),
			rider(3, { uciRanking: 80, totalBasePoints: 5, riderTypes: ['knecht'] }),
			rider(4, { uciRanking: 20, totalBasePoints: 80, riderTypes: ['sprinter'] })
		];
		const match = { terrainType: 'FLAT', matchType: 'GENERAL' };
		const lineup = buildBaselineLineup(roster, match, gameRules);

		expect(lineup).toHaveLength(4);
		expect(lineup.filter((e) => e.lineupType === 'CAPTAIN')).toHaveLength(1);
		expect(lineup.filter((e) => e.lineupType === 'SUBSTITUTE')).toHaveLength(1);

		const captainId = lineup.find((e) => e.lineupType === 'CAPTAIN').cyclistId;
		const scores = Object.fromEntries(
			roster.map((c) => [c.id, scoreLineupSuitability(c, match)])
		);
		const bestId = roster.sort((a, b) => scores[b.id] - scores[a.id])[0].id;
		expect(captainId).toBe(bestId);
	});
});
