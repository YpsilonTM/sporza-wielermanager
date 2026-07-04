import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prisma } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	const decisions = await prisma.managerDecision.findMany({
		orderBy: { submittedAt: 'desc' },
		take: 10
	});
	return json(decisions);
};
