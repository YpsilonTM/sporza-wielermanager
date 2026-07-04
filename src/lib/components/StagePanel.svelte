<script lang="ts">
	import { browser } from '$app/environment';
	import RiderAvatar from '$lib/components/RiderAvatar.svelte';
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

	function roleLabel(role?: string): string {
		if (role === 'CAPTAIN') return 'Kapitein';
		if (role === 'SUBSTITUTE') return 'Bank';
		return 'Starter';
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
	<section
		class="card mb-4 overflow-hidden bg-gradient-to-br from-slate-900 to-slate-950 p-0"
	>
		<div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0 flex-1">
				<p class="mb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
					Volgende rit
				</p>
				<h2 class="text-xl font-bold leading-tight text-white">{stage.name}</h2>
				<p class="mt-1 text-sm text-slate-400">
					{stage.terrainType ?? '—'} · {stage.matchType ?? 'rit'} · deadline {deadlineLabel}
				</p>
			</div>
			<div class="flex shrink-0 flex-col items-start gap-2 sm:items-end">
				<span class="text-2xl font-bold tabular-nums text-amber-400">
					{formatCountdown(stage.minutesUntilDeadline)}
				</span>
				{#if stage.autoManageScheduled}
					<span class="chip chip-auto">Auto gepland</span>
				{/if}
			</div>
		</div>
		{#if stageProfileSrc}
			<div class="border-t border-slate-800/80 bg-slate-950/50 px-4 py-3">
				<p class="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-slate-500">
					Etappeprofiel
				</p>
				<div class="rounded-lg bg-slate-900/80 px-3 py-2 ring-1 ring-slate-800">
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
			<h3 class="text-base font-semibold text-slate-100">Ingediende lineup</h3>
			<span class="chip chip-done">Actief bij Sporza</span>
		</div>
		<div class="grid gap-4 sm:grid-cols-2">
			<div>
				<h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
					Starters ({lineup.starters.length})
				</h4>
				<ul class="space-y-1.5">
					{#each lineup.starters as rider (rider.id)}
						<li
							class="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm
								{rider.role === 'CAPTAIN'
								? 'border-emerald-600/60 bg-emerald-950/40'
								: 'border-slate-700 bg-slate-950/60'}"
						>
							<RiderAvatar jerseyUrl={rider.jerseyUrl} name={rider.name} size="sm" />
							<div class="min-w-0 flex-1">
								<p class="truncate font-medium text-slate-100">{rider.name}</p>
								{#if rider.teamShortName || rider.team}
									<p class="truncate text-xs text-slate-500">
										{rider.teamShortName ?? rider.team}
									</p>
								{/if}
							</div>
							<span
								class="shrink-0 text-xs font-semibold
									{rider.role === 'CAPTAIN' ? 'text-emerald-300' : 'text-slate-400'}"
							>
								{roleLabel(rider.role)}
							</span>
						</li>
					{/each}
				</ul>
			</div>
			{#if lineup.bench.length > 0}
				<div>
					<h4 class="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
						Bank ({lineup.bench.length})
					</h4>
					<ul class="space-y-1.5">
						{#each lineup.bench as rider (rider.id)}
							<li
								class="flex items-center gap-3 rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm"
							>
								<RiderAvatar jerseyUrl={rider.jerseyUrl} name={rider.name} size="sm" />
								<div class="min-w-0 flex-1">
									<p class="truncate font-medium text-slate-300">{rider.name}</p>
									{#if rider.teamShortName || rider.team}
										<p class="truncate text-xs text-slate-500">
											{rider.teamShortName ?? rider.team}
										</p>
									{/if}
								</div>
								<span class="shrink-0 text-xs font-semibold text-slate-500">Bank</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</section>
{:else if stage}
	<section class="card border-dashed">
		<h3 class="text-base font-semibold text-slate-100">Lineup</h3>
		<p class="mt-1 text-sm text-slate-400">Nog geen lineup ingediend voor deze rit.</p>
	</section>
{/if}
