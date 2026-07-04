import { json, type RequestEvent } from '@sveltejs/kit';

type JobRouteOptions = {
	guard?: (event: RequestEvent) => Response | null | Promise<Response | null>;
	run: (event: RequestEvent) => void | Promise<void>;
	buildResponse?: (event: RequestEvent) => Record<string, unknown>;
};

export function createJobRoute({ guard, run, buildResponse }: JobRouteOptions) {
	return async (event: RequestEvent) => {
		if (guard) {
			const blocked = await guard(event);
			if (blocked) return blocked;
		}

		void Promise.resolve(run(event)).catch(() => {
			// errors broadcast via SSE
		});

		return json(buildResponse?.(event) ?? { status: 'accepted' }, { status: 202 });
	};
}
