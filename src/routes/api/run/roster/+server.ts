import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runRosterJob } from '$lib/server/jobs';
import { getRosterRunning } from '$lib/server/app-state';

export const POST: RequestHandler = async ({ url }) => {
	const dryRun = url.searchParams.get('dryRun') === '1';
	const force = url.searchParams.get('force') === '1';

	if (getRosterRunning()) {
		return json({ status: 'accepted', alreadyRunning: true }, { status: 202 });
	}

	void runRosterJob({ dryRun, submit: !dryRun, force }).catch(() => {
		// errors broadcast via SSE
	});

	return json({ status: 'accepted' }, { status: 202 });
};
