export function lineupChangeClass(change: string): string {
	if (change === 'removed') return 'text-red-300';
	if (change === 'added' || change === 'starter') return 'text-emerald-400';
	if (change === 'bench') return 'text-amber-300';
	return 'text-sky-300';
}

export function lineupChangeLabel(change: string): string {
	if (change === 'removed') return 'eruit';
	if (change === 'added') return 'nieuw';
	if (change === 'starter') return 'starter';
	if (change === 'bench') return 'bank';
	return 'wijziging';
}
