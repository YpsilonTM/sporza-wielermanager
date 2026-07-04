export function formatRiderName(
	cyclist: { id?: number; firstName?: string; lastName?: string; price?: number; team?: { name?: string } } | undefined | null,
	options: { fallback?: string; includeId?: boolean; includePrice?: boolean; includeTeam?: boolean } = {}
): string {
	const fallback = options.fallback ?? 'Onbekende renner';
	if (!cyclist) return fallback;

	const trimmedName = `${cyclist.firstName ?? ''} ${cyclist.lastName ?? ''}`.trim();
	const baseName = trimmedName || (cyclist.id != null ? `#${cyclist.id}` : fallback);

	if (options.includePrice || options.includeTeam) {
		const idPrefix = options.includeId !== false && cyclist.id != null ? `#${cyclist.id} ` : '';
		const displayName = trimmedName || `#${cyclist.id ?? '?'}`;
		const pricePart = options.includePrice ? ` (€${cyclist.price}M` : '';
		const teamPart =
			options.includeTeam && options.includePrice
				? `, ${cyclist.team?.name ?? '?'})`
				: options.includePrice
					? ')'
					: '';
		return `${idPrefix}${displayName}${pricePart}${teamPart}`.trim();
	}

	if (options.includeId && cyclist.id != null) {
		return `#${cyclist.id} ${baseName}`;
	}

	return baseName;
}

export function formatRoleLabel(role?: string, locale: 'nl' | 'en' = 'nl'): string {
	if (locale === 'en') {
		if (role === 'CAPTAIN') return 'CAPTAIN';
		if (role === 'SUBSTITUTE') return 'BANK';
		if (role === 'NORMAL') return 'START';
		return role ?? '—';
	}

	if (role === 'CAPTAIN') return 'Kapitein';
	if (role === 'SUBSTITUTE') return 'Bank';
	if (role === 'NORMAL') return 'Starter';
	return '—';
}
