import { Cron } from 'croner';
import { pinoLogger } from './logger';
import { runAutoManage } from './jobs';

const SCHEDULER_KEY = '__sporzaWielermanagerSchedulerStarted';

type SchedulerGlobal = typeof globalThis & {
	[SCHEDULER_KEY]?: boolean;
};

export function startScheduler(): void {
	const globalState = globalThis as SchedulerGlobal;
	if (globalState[SCHEDULER_KEY]) {
		return;
	}
	globalState[SCHEDULER_KEY] = true;

	const minutes = Number(process.env.CRON_CHECK_MINUTES || 15);
	pinoLogger.info(`🕐 Auto-manage check elke ${minutes} minuten.`);
	new Cron(`*/${minutes} * * * *`, async () => {
		try {
			await runAutoManage();
		} catch (err) {
			pinoLogger.error(
				`❌ Fout tijdens automatische run: ${err instanceof Error ? err.message : String(err)}`
			);
		}
	});
}
