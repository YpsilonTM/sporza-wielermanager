import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitPreviewJob } from '$lib/server/jobs';
import type { PreviewSubmitPayload } from '$lib/types/preview';

type SubmitPreviewRequest = PreviewSubmitPayload & { includeTransfer?: boolean };

export const POST: RequestHandler = async ({ request, url }) => {
	let body: SubmitPreviewRequest;
	try {
		body = (await request.json()) as SubmitPreviewRequest;
	} catch {
		return json({ error: 'Ongeldige payload' }, { status: 400 });
	}

	const { includeTransfer, ...payload } = body;

	if (!payload?.kind) {
		return json({ error: 'Ontbrekende submit payload' }, { status: 400 });
	}

	const allowTransfers =
		includeTransfer === true || (includeTransfer === undefined && url.searchParams.get('allowTransfers') === '1');

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
