import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRecentDecisions } from '$lib/server/decisions';

export const GET: RequestHandler = async () => {
	const decisions = await fetchRecentDecisions(10);
	return json(
		decisions.map((decision) => ({
			...decision,
			submittedAt: decision.submittedAt.toISOString()
		}))
	);
};
