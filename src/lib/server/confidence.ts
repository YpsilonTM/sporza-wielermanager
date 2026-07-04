import { CONFIDENCE_VALUES } from '$lib/confidence';

const CONFIDENCE_LEVELS: Record<string, number> = { ...CONFIDENCE_VALUES };

/** Map AI confidence labels to a 0–1 float for Prisma storage. */
export function normalizeConfidence(value: unknown): number | null {
	if (value == null) return null;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		return CONFIDENCE_LEVELS[value.toLowerCase()] ?? null;
	}
	return null;
}
