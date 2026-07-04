import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitPreviewJob } from '$lib/server/jobs';
import type { PreviewSubmitPayload } from '$lib/types/preview';

export const POST: RequestHandler = async ({ request, url }) => {
	const allowTransfers = url.searchParams.get('allowTransfers') === '1';

	let payload: PreviewSubmitPayload;
	try {
		payload = (await request.json()) as PreviewSubmitPayload;
	} catch {
		return json({ error: 'Ongeldige payload' }, { status: 400 });
	}

	if (!payload?.kind) {
		return json({ error: 'Ontbrekende submit payload' }, { status: 400 });
	}

	try {
		await submitPreviewJob(payload, { allowTransfers });
		return json({ status: 'ok' });
	} catch (error) {
		return json(
			{ error: error instanceof Error ? error.message : String(error) },
			{ status: 500 }
		);
	}
};
