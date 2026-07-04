import { describe, expect, test } from 'bun:test';
import {
	getFreeTransfers,
	getLineupSize,
	getSquadSize,
	getStarterCount,
	getSubstituteSlots,
	lineupToApiPayload,
	rosterIsComplete,
	validateLineup,
	validateRoster,
	validateRosterIds
} from './rules.js';

const gameRules = {
	roster: { requiredNumberOfAthletes: 4, budget: 20, maxAthletesFromSameTeam: 2 },
	lineup: { requiredNumberOfAthletes: 4, substituteSlots: 1 },
	minimumAthletePrice: 2
};

function cyclist(id, teamId = 1, price = 5) {
	return {
		id,
		firstName: 'Test',
		lastName: `Rider${id}`,
		price,
		participating: true,
		teamId,
		team: { id: teamId, name: `Team ${teamId}` }
	};
}

function validRoster() {
	return [cyclist(1, 1), cyclist(2, 1), cyclist(3, 2), cyclist(4, 2)];
}

function validLineup() {
	return [
		{ cyclistId: 1, lineupType: 'CAPTAIN' },
		{ cyclistId: 2, lineupType: 'NORMAL' },
		{ cyclistId: 3, lineupType: 'NORMAL' },
		{ cyclistId: 4, lineupType: 'SUBSTITUTE' }
	];
}

describe('rules sizing helpers', () => {
	test('reads squad and lineup sizes from game rules', () => {
		expect(getSquadSize(gameRules)).toBe(4);
		expect(getLineupSize(gameRules)).toBe(4);
		expect(getSubstituteSlots(gameRules)).toBe(1);
		expect(getStarterCount(gameRules)).toBe(3);
	});
});

describe('validateRoster', () => {
	test('accepts a valid roster', () => {
		const roster = validRoster();
		const result = validateRoster(roster, roster, gameRules);
		expect(result.valid).toBe(true);
		expect(result.errors).toHaveLength(0);
	});

	test('rejects wrong roster size', () => {
		const roster = validRoster().slice(0, 3);
		const result = validateRoster(roster, roster, gameRules);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('exactly 4'))).toBe(true);
	});

	test('rejects duplicate cyclist ids', () => {
		const roster = [cyclist(1), cyclist(1), cyclist(3), cyclist(4)];
		const result = validateRoster(roster, roster, gameRules);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Duplicate'))).toBe(true);
	});

	test('rejects budget overflow', () => {
		const roster = [cyclist(1, 1, 8), cyclist(2, 1, 8), cyclist(3, 2, 8), cyclist(4, 2, 8)];
		const result = validateRoster(roster, roster, gameRules);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('budget'))).toBe(true);
	});

	test('rejects too many riders from same team', () => {
		const roster = [cyclist(1, 1), cyclist(2, 1), cyclist(3, 1), cyclist(4, 2)];
		const result = validateRoster(roster, roster, gameRules);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('max 2'))).toBe(true);
	});
});

describe('validateRosterIds', () => {
	test('maps ids to cyclists and validates', () => {
		const all = validRoster();
		const result = validateRosterIds([1, 2, 3, 4], all, gameRules);
		expect(result.valid).toBe(true);
		expect(result.roster).toHaveLength(4);
	});

	test('rejects unknown cyclist ids', () => {
		const all = validRoster();
		const result = validateRosterIds([1, 2, 3, 99], all, gameRules);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('Unknown cyclist ids'))).toBe(true);
	});
});

describe('validateLineup', () => {
	test('accepts a valid lineup', () => {
		const roster = validRoster();
		const result = validateLineup(validLineup(), roster, gameRules);
		expect(result.valid).toBe(true);
		expect(result.starters).toHaveLength(3);
		expect(result.substitutes).toHaveLength(1);
	});

	test('requires exactly one captain', () => {
		const roster = validRoster();
		const lineup = validLineup().map((entry) =>
			entry.lineupType === 'CAPTAIN' ? { ...entry, lineupType: 'NORMAL' } : entry
		);
		const result = validateLineup(lineup, roster, gameRules);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('CAPTAIN'))).toBe(true);
	});

	test('rejects cyclists outside roster', () => {
		const roster = validRoster();
		const lineup = validLineup().map((entry, index) =>
			index === 0 ? { cyclistId: 99, lineupType: 'CAPTAIN' } : entry
		);
		const result = validateLineup(lineup, roster, gameRules);
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('not in your roster'))).toBe(true);
	});
});

describe('rosterIsComplete', () => {
	test('returns true for valid full roster', () => {
		expect(rosterIsComplete(validRoster(), gameRules)).toBe(true);
	});

	test('returns false for incomplete roster', () => {
		expect(rosterIsComplete(validRoster().slice(0, 2), gameRules)).toBe(false);
	});
});

describe('getFreeTransfers', () => {
	test('prefers API gameRules value over default', () => {
		expect(getFreeTransfers({ transfer: { freeTransfers: 3 } })).toBe(3);
		expect(getFreeTransfers({ transfer: { freeTransfers: 4 } })).toBe(4);
	});

	test('prefers transfer summary from Sporza API', () => {
		expect(getFreeTransfers({}, { numberOfFreeTransfers: 4 })).toBe(4);
	});

	test('defaults to 4 free transfers', () => {
		expect(getFreeTransfers({})).toBe(4);
	});
});

describe('lineupToApiPayload', () => {
	test('maps lineup entries to API shape', () => {
		expect(lineupToApiPayload(validLineup())).toEqual([
			{ id: 1, lineupType: 'CAPTAIN' },
			{ id: 2, lineupType: 'NORMAL' },
			{ id: 3, lineupType: 'NORMAL' },
			{ id: 4, lineupType: 'SUBSTITUTE' }
		]);
	});
});
