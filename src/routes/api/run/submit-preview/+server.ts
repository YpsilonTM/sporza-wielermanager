import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { submitPreviewJob } from '$lib/server/jobs';
import type { PreviewSubmitPayload } from '$lib/types/preview';

export const POST: RequestHandler = async ({ request }) => {
	let body: PreviewSubmitPayload & { includeTransfer?: boolean };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Ongeldige JSON-body.' }, { status: 400 });
	}

	const { includeTransfer, ...payload } = body;
	if (!payload.kind) {
		return json({ error: 'Geen preview-type opgegeven.' }, { status: 400 });
	}

	try {
		await submitPreviewJob(payload, { allowTransfers: Boolean(includeTransfer) });
		return json({ status: 'submitted' });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return json({ error: message }, { status: 400 });
	}
};
