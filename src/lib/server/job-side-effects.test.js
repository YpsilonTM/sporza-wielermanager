import { describe, expect, test } from 'bun:test';
import { formatDecisionReasoning } from './job-side-effects';

describe('formatDecisionReasoning', () => {
	const cyclists = [{ id: 42, firstName: 'Jonas', lastName: 'Vingegaard' }];

	test('formats lineup reasoning with rider name and role', () => {
		const text = formatDecisionReasoning(
			{
				lineup: [{ cyclistId: 42, lineupType: 'CAPTAIN', reasoning: 'Sterke klimmer voor deze etappe.' }]
			},
			cyclists
		);

		expect(text).toBe('• Jonas Vingegaard (Kapitein): Sterke klimmer voor deze etappe.');
	});

	test('includes transfer reasoning on its own line', () => {
		const text = formatDecisionReasoning(
			{
				lineup: [{ cyclistId: 42, lineupType: 'NORMAL', reasoning: 'Behouden op de bank.' }],
				transfers: [{ reasoning: 'Blessure bij uitvallende renner.' }]
			},
			cyclists
		);

		expect(text).toContain('Blessure bij uitvallende renner.');
		expect(text).toContain('\n');
	});

	test('formats roster pick reasoning', () => {
		const text = formatDecisionReasoning(
			{
				picks: [{ cyclistId: 42, reasoning: 'Goede prijs-kwaliteit voor de Tour.' }]
			},
			cyclists
		);

		expect(text).toBe('• Jonas Vingegaard: Goede prijs-kwaliteit voor de Tour.');
	});
});
