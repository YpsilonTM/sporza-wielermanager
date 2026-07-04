import type { PageServerLoad } from './$types';
import { getDashboardApiKey, setDashboardAuthCookie } from '$lib/server/dashboard-auth';
import { AUTO_MANAGE_WINDOW_MS } from '$lib/server/config.js';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const dashboardKey = getDashboardApiKey();
	const provided = url.searchParams.get('key')?.trim() ?? null;

	if (dashboardKey && provided === dashboardKey) {
		setDashboardAuthCookie(cookies);
	}

	return {
		dashboardKey,
		autoManageWindowMs: AUTO_MANAGE_WINDOW_MS
	};
};
