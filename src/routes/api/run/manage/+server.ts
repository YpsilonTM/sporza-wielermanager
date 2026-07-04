import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runManageJob } from '$lib/server/jobs';
import { isManageInFlight } from '$lib/server/app-state';

export const POST: RequestHandler = async ({ url }) => {
	const dryRun = url.searchParams.get('dryRun') === '1';
	const allowTransfers = url.searchParams.get('allowTransfers') === '1';
	const matchIdParam = url.searchParams.get('matchId');
	const matchId = matchIdParam ? Number(matchIdParam) : undefined;

	if (matchId && isManageInFlight(matchId)) {
		return json({ status: 'accepted', matchId, alreadyRunning: true }, { status: 202 });
	}

	void runManageJob({ dryRun, submit: !dryRun, allowTransfers, matchId }).catch(() => {
		// errors broadcast via SSE
	});

	return json({ status: 'accepted', matchId }, { status: 202 });
};
