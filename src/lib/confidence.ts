/** Stored confidence values (matches server normalization). */
export const CONFIDENCE_VALUES = {
	high: 0.9,
	medium: 0.6,
	low: 0.3
} as const;

/** Display thresholds aligned with stored values. */
export const CONFIDENCE_DISPLAY_THRESHOLDS = {
	high: CONFIDENCE_VALUES.high,
	medium: CONFIDENCE_VALUES.medium
} as const;

export function confidenceDisplayLabel(value: number | null): string {
	if (value == null) return '—';
	if (value >= CONFIDENCE_DISPLAY_THRESHOLDS.high) return 'Hoog';
	if (value >= CONFIDENCE_DISPLAY_THRESHOLDS.medium) return 'Medium';
	return 'Laag';
}
