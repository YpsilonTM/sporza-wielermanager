<script lang="ts">
	import RiderAvatar from '$lib/components/RiderAvatar.svelte';
	import { formatRoleLabel } from '$lib/format';
	import type { LineupRiderView } from '$lib/types/overview';

	let {
		rider,
		highlightCaptain = false,
		muted = false
	}: {
		rider: LineupRiderView;
		highlightCaptain?: boolean;
		muted?: boolean;
	} = $props();

	const isCaptain = $derived(rider.role === 'CAPTAIN');
</script>

<li
	class="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm
		{highlightCaptain && isCaptain
		? 'border-emerald-600/60 bg-emerald-950/40'
		: 'border-slate-700 bg-slate-950/60'}"
>
	<RiderAvatar jerseyUrl={rider.jerseyUrl} name={rider.name} size="sm" />
	<div class="min-w-0 flex-1">
		<p class="truncate font-medium {muted ? 'text-slate-300' : 'text-slate-100'}">{rider.name}</p>
		{#if rider.teamShortName || rider.team}
			<p class="truncate text-xs text-slate-500">{rider.teamShortName ?? rider.team}</p>
		{/if}
	</div>
	<span
		class="shrink-0 text-xs font-semibold
			{isCaptain ? 'text-emerald-300' : muted ? 'text-slate-500' : 'text-slate-400'}"
	>
		{formatRoleLabel(rider.role)}
	</span>
</li>
