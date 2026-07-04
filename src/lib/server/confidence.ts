const CONFIDENCE_LEVELS: Record<string, number> = {
	high: 0.9,
	medium: 0.6,
	low: 0.3
};

/** Map AI confidence labels to a 0–1 float for Prisma storage. */
export function normalizeConfidence(value: unknown): number | null {
	if (value == null) return null;
	if (typeof value === 'number' && Number.isFinite(value)) return value;
	if (typeof value === 'string') {
		return CONFIDENCE_LEVELS[value.toLowerCase()] ?? null;
	}
	return null;
}
