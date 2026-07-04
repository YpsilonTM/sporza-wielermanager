import type { RequestHandler } from './$types';
import { runAuthRefreshJob } from '$lib/server/jobs';

export const POST: RequestHandler = async () => {
	void runAuthRefreshJob();
	return new Response('ok');
};
