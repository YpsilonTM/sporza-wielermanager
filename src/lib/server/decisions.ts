import { prisma } from './db';

/** True when a submitted lineup decision exists for this match (survives restarts). */
export async function wasMatchLineupSubmitted(matchId: number): Promise<boolean> {
	const count = await prisma.managerDecision.count({
		where: {
			matchId,
			decisionType: 'lineup',
			submitted: true
		}
	});
	return count > 0;
}

export async function fetchRecentDecisions(limit = 10) {
	return prisma.managerDecision.findMany({
		orderBy: { submittedAt: 'desc' },
		take: limit
	});
}
