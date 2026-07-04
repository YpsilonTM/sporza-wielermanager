import { describe, expect, test } from 'bun:test';
import { calculateNextTransferCost } from './transfers.js';

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
