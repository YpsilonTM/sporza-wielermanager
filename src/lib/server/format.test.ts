import { describe, expect, test } from 'bun:test';
import { getUpcomingMatch, isMatchOpenForLineup } from './format';

const rit1 = {
	id: 1,
	name: 'Rit 1',
	matchNumber: 1,
	status: 'STARTED',
	deadline: '2026-07-04T15:05:00.000Z',
	startTime: '2026-07-04T15:05:00.000Z'
};

const rit2 = {
	id: 2,
	name: 'Rit 2',
	matchNumber: 2,
	status: 'NOT_STARTED',
	deadline: '2026-07-05T15:05:00.000Z',
	startTime: '2026-07-05T15:05:00.000Z'
};

describe('isMatchOpenForLineup', () => {
	test('returns false when status is not NOT_STARTED', () => {
		expect(isMatchOpenForLineup(rit1)).toBe(false);
	});

	test('returns false when deadline is in the past', () => {
		expect(
			isMatchOpenForLineup({
				id: 1,
				status: 'NOT_STARTED',
				deadline: '2020-01-01T12:00:00.000Z'
			})
		).toBe(false);
	});

	test('returns true for a future NOT_STARTED stage', () => {
		expect(
			isMatchOpenForLineup({
				id: 2,
				status: 'NOT_STARTED',
				deadline: '2099-01-01T12:00:00.000Z'
			})
		).toBe(true);
	});
});

describe('getUpcomingMatch', () => {
	test('prefers edition upcoming while its deadline is still open', () => {
		const openRit1 = {
			...rit1,
			status: 'NOT_STARTED',
			deadline: '2099-01-01T12:00:00.000Z'
		};

		expect(
			getUpcomingMatch({
				edition: { upcomingCyclingMatch: openRit1 },
				gameStatus: { nextMatch: { match: rit2 } }
			})
		).toEqual(openRit1);
	});

	test('skips a started stage and returns nextMatch', () => {
		expect(
			getUpcomingMatch({
				edition: { upcomingCyclingMatch: rit1 },
				gameStatus: { nextMatch: { match: rit2 } }
			})
		).toEqual(rit2);
	});

	test('falls back to edition upcoming when no next match exists', () => {
		expect(
			getUpcomingMatch({
				edition: { upcomingCyclingMatch: rit1 },
				gameStatus: { nextMatch: { match: null } }
			})
		).toEqual(rit1);
	});
});
