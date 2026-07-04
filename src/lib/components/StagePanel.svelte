<script lang="ts">
	import { browser } from '$app/environment';
	import { ClipboardList } from '@lucide/svelte';
	import LineupRiderRow from '$lib/components/LineupRiderRow.svelte';
	import type { EnrichedStage, LineupView } from '$lib/types/overview';

	function formatCountdown(minutes: number): string {
		if (minutes >= 120) {
			const hours = Math.floor(minutes / 60);
			const mins = minutes % 60;
			return mins > 0 ? `${hours}u ${mins}min` : `${hours}u`;
		}
		if (minutes >= 60) return '1 uur';
		if (minutes <= 0) return 'Binnenkort';
		return `${minutes} min`;
	}

	let {
		stage = null,
		lineup = null
	}: {
		stage?: EnrichedStage | null;
		lineup?: LineupView | null;
	} = $props();

	const deadlineLabel = $derived(
		stage
			? new Date(stage.deadline || stage.startTime || Date.now()).toLocaleString('nl-BE', {
					weekday: 'short',
					day: 'numeric',
					month: 'short',
					hour: '2-digit',
					minute: '2-digit'
				})
			: ''
	);

	const stageProfileSrc = $derived(
		browser && stage?.stageProfileUrl
			? `/api/stage-profile?url=${encodeURIComponent(stage.stageProfileUrl)}`
			: null
	);
</script>

{#if stage}
	<section class="card-hero mb-4 overflow-hidden">
		<div class="flex flex-col gap-4 border-t border-zinc-700/50 p-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0 flex-1">
				<p class="label-caps mb-1">Volgende rit</p>
				<h2 class="text-xl font-bold leading-tight text-zinc-50">{stage.name}</h2>
				<p class="mt-1 text-sm text-zinc-400">
					{stage.terrainType ?? '—'} · {stage.matchType ?? 'rit'} · deadline {deadlineLabel}
				</p>
			</div>
			<div
				class="flex shrink-0 flex-col items-start gap-2 rounded-lg bg-zinc-950/50 px-3 py-2 ring-1 ring-zinc-800/80 sm:items-end"
			>
				<span class="text-2xl font-bold tabular-nums text-amber-400">
					{formatCountdown(stage.minutesUntilDeadline)}
				</span>
				{#if stage.autoManageScheduled}
					<span class="chip chip-auto">Auto gepland</span>
				{/if}
			</div>
		</div>
		{#if stageProfileSrc}
			<div class="border-t border-zinc-800/80 bg-zinc-950/50 px-4 py-3">
				<p class="label-caps mb-2">Etappeprofiel</p>
				<div class="surface-nested bg-zinc-900/80 px-3 py-2">
					<img
						src={stageProfileSrc}
						alt="Etappeprofiel {stage.name}"
						class="mx-auto h-auto max-h-32 w-full max-w-xl object-contain"
						loading="lazy"
					/>
				</div>
			</div>
		{/if}
	</section>
{/if}

{#if lineup?.submitted}
	<section class="card">
		<div class="mb-4 flex flex-wrap items-center justify-between gap-2">
			<h3 class="section-title">Ingediende lineup</h3>
			<span class="chip chip-done">Actief bij Sporza</span>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<h4 class="label-caps mb-2">Starters ({lineup.starters.length})</h4>
				<ul class="space-y-1.5">
					{#each lineup.starters as rider (rider.id)}
						<LineupRiderRow {rider} highlightCaptain />
					{/each}
				</ul>
			</div>
			{#if lineup.bench.length > 0}
				<div>
					<h4 class="label-caps mb-2">Bank ({lineup.bench.length})</h4>
					<ul class="space-y-1.5">
						{#each lineup.bench as rider (rider.id)}
							<LineupRiderRow {rider} muted />
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</section>
{:else if stage}
	<section class="card-muted">
		<div class="empty-state !py-4">
			<ClipboardList class="size-8 text-zinc-600" strokeWidth={1.5} />
			<div>
				<h3 class="section-title">Lineup</h3>
				<p class="mt-1 text-sm text-zinc-500">Nog geen lineup ingediend voor deze rit.</p>
			</div>
		</div>
	</section>
{/if}
