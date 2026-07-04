import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runRosterJob } from '$lib/server/jobs';

export const POST: RequestHandler = async ({ url }) => {
	const dryRun = url.searchParams.get('dryRun') === '1';
	const force = url.searchParams.get('force') === '1';

	try {
		await runRosterJob({ dryRun, submit: !dryRun, force });
		return json({ status: 'ok' });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};
