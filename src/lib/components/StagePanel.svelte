<script lang="ts">
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
</script>

{#if stage}
	<section class="stage-hero">
		<div class="stage-hero-main">
			<p class="stage-kicker">Volgende rit</p>
			<h2 class="stage-title">{stage.name}</h2>
			<p class="stage-meta">
				{stage.terrainType ?? '—'} · {stage.matchType ?? 'rit'} · deadline {deadlineLabel}
			</p>
		</div>
		<div class="stage-hero-aside">
			<span class="countdown-pill">{formatCountdown(stage.minutesUntilDeadline)}</span>
			{#if stage.autoManageScheduled}
				<span class="chip chip-auto">Auto ~{formatCountdown(stage.minutesUntilDeadline)}</span>
			{/if}
		</div>
	</section>
{/if}

{#if lineup?.submitted}
	<section class="lineup-panel">
		<div class="lineup-panel-header">
			<h3>Ingediende lineup</h3>
			<span class="chip chip-done">Actief bij Sporza</span>
		</div>
		<div class="lineup-columns">
			<div class="lineup-column">
				<h4>Starters ({lineup.starters.length})</h4>
				<ul class="rider-list">
					{#each lineup.starters as rider (rider.id)}
						<li class="rider-row" class:captain={rider.role === 'CAPTAIN'}>
							<span class="rider-name">{rider.name}</span>
							<span class="rider-role">{roleLabel(rider.role)}</span>
						</li>
					{/each}
				</ul>
			</div>
			{#if lineup.bench.length > 0}
				<div class="lineup-column">
					<h4>Bank ({lineup.bench.length})</h4>
					<ul class="rider-list">
						{#each lineup.bench as rider (rider.id)}
							<li class="rider-row">
								<span class="rider-name">{rider.name}</span>
								<span class="rider-role muted">Bank</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	</section>
{:else if stage}
	<section class="lineup-panel empty">
		<h3>Lineup</h3>
		<p>Nog geen lineup ingediend voor deze rit.</p>
	</section>
{/if}
