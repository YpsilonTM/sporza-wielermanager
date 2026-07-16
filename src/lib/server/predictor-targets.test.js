import { describe, expect, test } from 'bun:test';
import { pickHotTransferTargets } from './predictor.js';

describe('pickHotTransferTargets', () => {
	test('returns high-scoring riders not already in roster', () => {
		const roster = [
			{ id: 1, totalBasePoints: 50 },
			{ id: 2, totalBasePoints: 40 }
		];
		const all = [
			{ id: 1, totalBasePoints: 50, price: 10, firstName: 'A', lastName: 'In' },
			{ id: 3, totalBasePoints: 200, price: 12, firstName: 'Hot', lastName: 'Rider', participating: true },
			{ id: 4, totalBasePoints: 5, price: 4, firstName: 'Weak', lastName: 'Out' },
			{ id: 5, totalBasePoints: 90, price: 8, firstName: 'Good', lastName: 'Out' }
		];
		const targets = pickHotTransferTargets(all, roster, { terrainType: 'FLAT' }, 10);
		const ids = targets.map((t) => t.id);
		expect(ids).toContain(3);
		expect(ids).toContain(5);
		expect(ids).not.toContain(1);
		expect(ids[0]).toBe(3);
	});
});
