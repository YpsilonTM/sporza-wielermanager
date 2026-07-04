import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { getCookiesCachePath, getDataPath, getSettings, ensureDataDir } from './config.js';
import { getDatabaseUrl, prisma } from './db';
import { pinoLogger } from './logger';

const LEGACY_META_ID = 'legacy';
const DEFAULT_LOG_FILENAME = '.manager_log.jsonl';

interface LegacyLogEntry {
	loggedAt?: string;
	matchId?: number;
	matchName?: string;
	type?: string;
	summary?: string;
	confidence?: number;
	reasoning?: string;
	submitted?: boolean;
}

function getLegacyManagerLogPath(): string {
	const settings = getSettings();
	const file = settings.managerLogFile?.trim() || DEFAULT_LOG_FILENAME;
	if (path.isAbsolute(file)) {
		return file;
	}
	return getDataPath(path.basename(file));
}

function getLegacyManagerLogBackupPath(): string {
	return `${getLegacyManagerLogPath()}.bak`;
}

async function readLegacyManagerLogLines(): Promise<LegacyLogEntry[]> {
	const logPath = getLegacyManagerLogPath();
	let raw: string;

	try {
		raw = await fs.readFile(logPath, 'utf8');
	} catch {
		return [];
	}

	const entries: LegacyLogEntry[] = [];
	const lines = raw.trim().split('\n').filter(Boolean);

	for (let index = 0; index < lines.length; index += 1) {
		try {
			entries.push(JSON.parse(lines[index]!) as LegacyLogEntry);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			pinoLogger.warn(`Legacy import: skip invalid JSONL line ${index + 1}: ${message}`);
		}
	}

	return entries;
}

async function importLegacyAuthCookies(): Promise<boolean> {
	const existing = await prisma.authCache.findUnique({ where: { id: 'wielermanager' } });
	if (existing?.cookies) {
		return false;
	}

	const cachePath = getCookiesCachePath(getSettings());
	let raw: string;

	try {
		raw = await fs.readFile(cachePath, 'utf8');
	} catch {
		return false;
	}

	try {
		JSON.parse(raw);
	} catch {
		pinoLogger.warn('Legacy import: invalid auth cache JSON, skipping auth import');
		return false;
	}

	await prisma.authCache.upsert({
		where: { id: 'wielermanager' },
		create: { id: 'wielermanager', cookies: raw },
		update: { cookies: raw }
	});

	return true;
}

async function archiveLegacyManagerLog(): Promise<void> {
	const logPath = getLegacyManagerLogPath();
	const backupPath = getLegacyManagerLogBackupPath();

	try {
		await fs.access(logPath);
	} catch {
		return;
	}

	try {
		await fs.access(backupPath);
		pinoLogger.info(`Legacy import: keeping existing backup at ${backupPath}`);
		return;
	} catch {
		// no backup yet
	}

	await fs.rename(logPath, backupPath);
	pinoLogger.info(`Legacy import: archived ${logPath} -> ${backupPath}`);
}

export async function importLegacyDataIfNeeded(): Promise<void> {
	const existingMeta = await prisma.migrationMeta.findUnique({
		where: { id: LEGACY_META_ID }
	});
	if (existingMeta) {
		return;
	}

	const decisionCount = await prisma.managerDecision.count();
	if (decisionCount > 0) {
		pinoLogger.warn(
			'Legacy import: decisions already in database without migration meta; marking import complete'
		);
		await prisma.migrationMeta.create({
			data: {
				id: LEGACY_META_ID,
				decisionsImported: decisionCount,
				authImported: Boolean(await prisma.authCache.findUnique({ where: { id: 'wielermanager' } }))
			}
		});
		return;
	}

	await ensureDataDir();

	const entries = await readLegacyManagerLogLines();
	let decisionsImported = 0;

	if (entries.length > 0) {
		await prisma.$transaction(
			entries.map((entry) =>
				prisma.managerDecision.create({
					data: {
						matchId: entry.matchId ?? null,
						matchName: entry.matchName ?? null,
						decisionType: entry.type || 'lineup',
						summary: entry.summary || '',
						confidence: entry.confidence ?? null,
						reasoning: entry.reasoning || '',
						submitted: Boolean(entry.submitted),
						submittedAt: entry.loggedAt ? new Date(entry.loggedAt) : new Date()
					}
				})
			)
		);
		decisionsImported = entries.length;
		await archiveLegacyManagerLog();
	}

	const authImported = await importLegacyAuthCookies();

	await prisma.migrationMeta.create({
		data: {
			id: LEGACY_META_ID,
			decisionsImported,
			authImported
		}
	});

	pinoLogger.info(
		`Legacy import: ${decisionsImported} decisions imported${authImported ? ', auth cookies imported' : ''}`
	);
}

export async function runDatabaseMigrations(): Promise<void> {
	const databaseUrl = getDatabaseUrl();

	await new Promise<void>((resolve, reject) => {
		const child = spawn('bunx', ['--bun', 'prisma', 'migrate', 'deploy'], {
			cwd: process.cwd(),
			env: {
				...process.env,
				DATABASE_URL: databaseUrl
			},
			stdio: ['ignore', 'pipe', 'pipe']
		});

		let stderr = '';

		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on('error', (error) => {
			reject(new Error(`Failed to run prisma migrate deploy: ${error.message}`));
		});

		child.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(stderr.trim() || `prisma migrate deploy failed with exit code ${code}`));
				return;
			}
			resolve();
		});
	});
}
