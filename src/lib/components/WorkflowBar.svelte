<script lang="ts">
	import type { OverviewUiState } from '$lib/types/overview';

	let { ui }: { ui: OverviewUiState } = $props();

	const steps = $derived([
		{
			id: 'squad',
			label: 'Ploeg',
			done: ui.rosterComplete,
			active: ui.phase === 'build_squad',
			detail: `${ui.rosterCount}/${ui.squadSize} renners`
		},
		{
			id: 'lineup',
			label: 'Lineup',
			done: ui.lineupSubmitted,
			active: ui.phase === 'needs_lineup' || ui.phase === 'pre_race',
			detail: ui.lineupSubmitted ? 'ingediend' : 'open'
		}
	]);
</script>

<div class="card mb-3 flex items-center gap-3">
	{#each steps as step, i (step.id)}
		<div class="flex min-w-0 flex-1 items-center gap-2.5">
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold
					{step.done
					? 'bg-emerald-900 text-emerald-300'
					: step.active
						? 'bg-emerald-600 text-white ring-2 ring-emerald-500/30'
						: 'bg-slate-700 text-slate-400'}"
			>
				{step.done ? '✓' : i + 1}
			</span>
			<div class="min-w-0">
				<p class="truncate text-sm font-semibold text-slate-100">{step.label}</p>
				<p class="truncate text-xs text-slate-400">{step.detail}</p>
			</div>
		</div>
		{#if i < steps.length - 1}
			<div class="h-0.5 w-6 shrink-0 rounded {step.done ? 'bg-emerald-500' : 'bg-slate-700'}"></div>
		{/if}
	{/each}
</div>

{#if ui.transferWindowLabel}
	<p
		class="mb-4 rounded-lg border border-emerald-800/60 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-200"
	>
		{ui.transferWindowLabel}
	</p>
{/if}
