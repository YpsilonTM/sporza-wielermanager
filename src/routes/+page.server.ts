import type { PageServerLoad } from './$types';
import { getDashboardApiKey, setDashboardAuthCookie } from '$lib/server/dashboard-auth';

export const load: PageServerLoad = async ({ url, cookies }) => {
	const dashboardKey = getDashboardApiKey();
	const provided = url.searchParams.get('key')?.trim() ?? null;

	if (dashboardKey && provided === dashboardKey) {
		setDashboardAuthCookie(cookies);
	}

	return {
		dashboardKey
	};
};
