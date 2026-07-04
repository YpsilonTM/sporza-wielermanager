import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchOverviewData } from '$lib/server/jobs';

export const GET: RequestHandler = async () => {
	try {
		const data = await fetchOverviewData();
		return json(data);
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};
