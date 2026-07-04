import { describe, expect, test } from 'bun:test';
import { calculateNextTransferCost, validateTransfer } from './transfers.js';

describe('calculateNextTransferCost', () => {
	const gameRulesFourFree = { transfer: { freeTransfers: 4 } };
	const gameRulesThreeFree = { transfer: { freeTransfers: 3 } };

	test('first four transfers are free when allowance is 4', () => {
		expect(calculateNextTransferCost(0, gameRulesFourFree)).toBe(0);
		expect(calculateNextTransferCost(3, gameRulesFourFree)).toBe(0);
	});

	test('fifth transfer costs 1M when allowance is 4', () => {
		expect(calculateNextTransferCost(4, gameRulesFourFree)).toBe(1);
		expect(calculateNextTransferCost(5, gameRulesFourFree)).toBe(2);
	});

	test('fourth transfer costs 1M when allowance is 3', () => {
		expect(calculateNextTransferCost(3, gameRulesThreeFree)).toBe(1);
	});
});

describe('validateTransfer', () => {
	const cyclist = (id, teamId = 1, price = 5) => ({
		id,
		firstName: 'Test',
		lastName: `Rider${id}`,
		price,
		participating: true,
		teamId,
		team: { id: teamId }
	});

	const roster = [cyclist(1), cyclist(2), cyclist(3), cyclist(4)];
	const allCyclists = [...roster, cyclist(99, 2)];

	test('rejects transfer without rider ids', () => {
		const result = validateTransfer({ reasoning: 'injury swap' }, roster, allCyclists, {
			roster: { requiredNumberOfAthletes: 4, budget: 100, maxAthletesFromSameTeam: 4 },
			lineup: { requiredNumberOfAthletes: 4, substituteSlots: 0 }
		});
		expect(result.valid).toBe(false);
		expect(result.errors.some((e) => e.includes('at least one rider'))).toBe(true);
	});
});
