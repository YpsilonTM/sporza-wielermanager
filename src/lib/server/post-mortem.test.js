import { describe, expect, test } from 'bun:test';
import { buildPostMortemSummary, formatPostMortemsForPrompt } from './post-mortem.ts';

describe('post-mortem', () => {
	test('buildPostMortemSummary includes score and captain', () => {
		const summary = buildPostMortemSummary({
			matchName: 'Rit 3',
			matchScore: 120,
			confidence: 0.7,
			summary: 'Sprinters gestart',
			captainName: 'Philipsen',
			recentAverage: 180,
			source: 'ai'
		});
		expect(summary).toContain('120 pt');
		expect(summary).toContain('Philipsen');
		expect(summary).toContain('onder recent gemiddelde');
	});

	test('formatPostMortemsForPrompt lists recent stages', () => {
		const text = formatPostMortemsForPrompt([
			{
				matchId: 1,
				matchName: 'Rit 1',
				matchScore: 200,
				recentAverage: null,
				captainName: 'Pogacar',
				captainId: 9,
				confidence: 0.8,
				source: 'ai',
				summary: 'Goede TTT',
				updatedAt: new Date().toISOString()
			}
		]);
		expect(text).toContain('RECENTE RITRESULTATEN');
		expect(text).toContain('Rit 1');
		expect(text).toContain('Pogacar');
	});
});
