<script lang="ts">
	import { Check } from '@lucide/svelte';
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
					? 'bg-zinc-700 text-zinc-100'
					: step.active
						? 'bg-zinc-100 text-zinc-950 ring-2 ring-zinc-400/30'
						: 'bg-zinc-800 text-zinc-500'}"
			>
				{#if step.done}
					<Check class="size-3.5" strokeWidth={2.5} />
				{:else}
					{i + 1}
				{/if}
			</span>
			<div class="min-w-0">
				<p class="truncate text-sm font-semibold text-zinc-100">{step.label}</p>
				<p class="truncate meta-text">{step.detail}</p>
			</div>
		</div>
		{#if i < steps.length - 1}
			<div class="h-0.5 w-6 shrink-0 rounded {step.done ? 'bg-zinc-400' : 'bg-zinc-800'}"></div>
		{/if}
	{/each}
</div>

{#if ui.transferWindowLabel}
	<p
		class="mb-4 rounded-lg border border-zinc-700/80 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-300"
	>
		{ui.transferWindowLabel}
	</p>
{/if}
