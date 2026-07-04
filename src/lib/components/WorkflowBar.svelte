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

<div class="workflow-bar">
	{#each steps as step, i (step.id)}
		<div class="workflow-step" class:done={step.done} class:active={step.active}>
			<span class="workflow-icon">{step.done ? '✓' : i + 1}</span>
			<div class="workflow-text">
				<span class="workflow-label">{step.label}</span>
				<span class="workflow-detail">{step.detail}</span>
			</div>
		</div>
		{#if i < steps.length - 1}
			<div class="workflow-connector" class:done={step.done}></div>
		{/if}
	{/each}
</div>

{#if ui.transferWindowLabel}
	<p class="context-banner">{ui.transferWindowLabel}</p>
{/if}
