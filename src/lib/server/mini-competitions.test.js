import { describe, expect, test } from 'bun:test';
import { mapMiniCompetitions } from './mini-competitions';

describe('mapMiniCompetitions', () => {
	test('maps joined minicompetition with my team in top rankings', () => {
		const result = mapMiniCompetitions([
			{
				slug: 'abc123',
				name: 'Acrylzuur',
				owner: false,
				memberCount: 19,
				topRankings: [
					{ rank: 1, points: 2638, teamName: 'Leader', isMyTeam: false },
					{ rank: 10, points: 2236, teamName: 'Team Hackl', userName: 'Yuri Hackl', isMyTeam: true }
				]
			}
		]);

		expect(result).toHaveLength(1);
		expect(result[0]?.name).toBe('Acrylzuur');
		expect(result[0]?.myRank).toBe(10);
		expect(result[0]?.myPoints).toBe(2236);
		expect(result[0]?.standings).toHaveLength(2);
		expect(result[0]?.standings.find((entry) => entry.isMyTeam)?.teamName).toBe('Team Hackl');
	});

	test('returns empty array for invalid input', () => {
		expect(mapMiniCompetitions(null)).toEqual([]);
		expect(mapMiniCompetitions([{ name: 'Missing slug' }])).toEqual([]);
	});
});
