import { Cron } from 'croner';
import { pinoLogger } from './logger';
import { runAutoManage } from './jobs';

let started = false;

export function startScheduler(): void {
	if (started) {
		return;
	}
	started = true;

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
