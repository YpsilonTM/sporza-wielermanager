/** Client helpers for optional dashboard API key auth. */
export function dashboardFetch(
	dashboardKey: string | null,
	input: RequestInfo | URL,
	init?: RequestInit
): Promise<Response> {
	if (!dashboardKey) {
		return fetch(input, init);
	}

	const headers = new Headers(init?.headers);
	headers.set('x-dashboard-key', dashboardKey);
	return fetch(input, { ...init, headers });
}

export function dashboardLogsUrl(dashboardKey: string | null): string {
	if (!dashboardKey) return '/api/logs';
	return `/api/logs?key=${encodeURIComponent(dashboardKey)}`;
}

export function dashboardDecisionsUrl(dashboardKey: string | null): string {
	if (!dashboardKey) return '/api/decisions/recent';
	return `/api/decisions/recent?key=${encodeURIComponent(dashboardKey)}`;
}
