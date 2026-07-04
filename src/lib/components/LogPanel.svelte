<script lang="ts">
	import { onMount } from 'svelte';
	import type { SseEvent } from '$lib/types/sse';

	const BACKGROUND_NOISE_PATTERNS = [
		/no upcoming match/i,
		/skipping overlapping auto-manage/i,
		/not in auto window yet/i,
		/already auto-managed in this session/i,
		/lineup already submitted for this match/i,
		/session valid \(\d+ cookies\)/i,
		/cookie cache:/i,
		/wielermanager_cookie_header:/i,
		/: connected$/i,
		/: heartbeat$/i
	];

	interface LogLine {
		id: number;
		message: string;
		level: number;
		backgroundNoise: boolean;
	}

	let {
		logsUrl = '/api/logs',
		connectionStatus = $bindable('Verbinden met log stream...'),
		onManage = () => {},
		onRoster = () => {},
		onManageFailed = () => {},
		onRosterFailed = () => {},
		onOverviewRefresh = () => {}
	}: {
		logsUrl?: string;
		connectionStatus?: string;
		onManage?: (data: Extract<SseEvent, { type: 'manage' }>) => void;
		onRoster?: (data: Extract<SseEvent, { type: 'roster' }>) => void;
		onManageFailed?: (data: Extract<SseEvent, { type: 'manage-failed' }>) => void;
		onRosterFailed?: (data: Extract<SseEvent, { type: 'roster-failed' }>) => void;
		onOverviewRefresh?: () => void;
	} = $props();

	let hideBackgroundNoise = $state(true);
	let lines = $state<LogLine[]>([]);
	let nextId = $state(0);
	let logBox: HTMLDivElement | undefined = $state();
	let expanded = $state(false);

	function isBackgroundNoise(message: string): boolean {
		return BACKGROUND_NOISE_PATTERNS.some((pattern) => pattern.test(message));
	}

	function appendLogLine(message: string, level = 30) {
		const backgroundNoise = isBackgroundNoise(message);
		lines = [...lines, { id: nextId++, message, level, backgroundNoise }];
		if (!backgroundNoise && level >= 30) {
			expanded = true;
		}
		queueMicrotask(() => {
			if (logBox) logBox.scrollTop = logBox.scrollHeight;
		});
	}

	function clearLogs() {
		lines = [];
	}

	export function addLog(message: string, level = 30) {
		appendLogLine(message, level);
	}

	const visibleCount = $derived(
		lines.filter((line) => !(hideBackgroundNoise && line.backgroundNoise)).length
	);

	onMount(() => {
		const es = new EventSource(logsUrl);

		es.onopen = () => {
			connectionStatus = '🟢 Verbonden';
		};
		es.onerror = () => {
			connectionStatus = '🔴 Verbinding verbroken';
		};
		es.onmessage = (e) => {
			let data: SseEvent;
			try {
				data = JSON.parse(e.data) as SseEvent;
			} catch {
				appendLogLine(e.data, 30);
				return;
			}

			if (data.type === 'log') {
				appendLogLine(data.message, data.level ?? 30);
				if (/auto-manage voltooid|roster bijgewerkt/i.test(data.message)) {
					onOverviewRefresh();
				}
				return;
			}

			if (data.type === 'manage') {
				expanded = true;
				onManage(data);
				onOverviewRefresh();
				return;
			}

			if (data.type === 'roster') {
				expanded = true;
				onRoster(data);
				onOverviewRefresh();
				return;
			}

			if (data.type === 'manage-failed') {
				expanded = true;
				onManageFailed(data);
				return;
			}

			if (data.type === 'roster-failed') {
				expanded = true;
				onRosterFailed(data);
			}
		};

		return () => es.close();
	});
</script>

<details class="card mb-5 overflow-hidden p-0" bind:open={expanded}>
	<summary
		class="flex cursor-pointer select-none items-center justify-between gap-3 px-4 py-3 hover:bg-slate-800/40"
	>
		<span class="text-sm font-semibold text-slate-200">Live logs</span>
		<span class="text-xs text-slate-500">
			{visibleCount} {visibleCount === 1 ? 'regel' : 'regels'}
		</span>
	</summary>

	<div class="border-t border-slate-700/80 px-4 pb-4 pt-3">
		<div class="mb-2 flex flex-wrap items-center justify-end gap-3">
			<label class="flex cursor-pointer items-center gap-2 text-xs text-slate-400">
				<input class="accent-emerald-500" type="checkbox" bind:checked={hideBackgroundNoise} />
				Verberg achtergrondruis
			</label>
			<button class="btn-ghost !py-1 text-xs" type="button" onclick={clearLogs}>Wissen</button>
		</div>
		<div
			class="max-h-56 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950/80 p-3 font-mono text-xs leading-relaxed"
			bind:this={logBox}
		>
			{#each lines as line (line.id)}
				<div
					class="break-words py-0.5 {line.level === 20 ? 'text-slate-500' : 'text-slate-300'} {hideBackgroundNoise &&
					line.backgroundNoise
						? 'hidden'
						: ''}"
				>
					{line.message}
				</div>
			{:else}
				<p class="font-sans text-sm text-slate-500">
					Nog geen logs — ze verschijnen bij AI-acties of fouten.
				</p>
			{/each}
		</div>
	</div>
</details>
