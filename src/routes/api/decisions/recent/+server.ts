import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { fetchRecentDecisions, mapDecisionToView } from '$lib/server/decisions';

export const GET: RequestHandler = async () => {
	const decisions = await fetchRecentDecisions(10);
	return json(decisions.map(mapDecisionToView));
};
