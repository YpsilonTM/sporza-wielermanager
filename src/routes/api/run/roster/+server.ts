import type { RequestHandler } from './$types';
import { runRosterJob } from '$lib/server/jobs';
import { getRosterRunning } from '$lib/server/app-state';
import { createJobRoute } from '$lib/server/job-route';
import { json } from '@sveltejs/kit';

export const POST: RequestHandler = createJobRoute({
	guard: async () => {
		if (getRosterRunning()) {
			return json({ status: 'accepted', alreadyRunning: true }, { status: 202 });
		}
		return null;
	},
	run: ({ url }) => {
		const dryRun = url.searchParams.get('dryRun') === '1';
		const force = url.searchParams.get('force') === '1';
		void runRosterJob({ dryRun, submit: !dryRun, force });
	}
});
