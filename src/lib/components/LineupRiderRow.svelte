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
		? 'border-l-2 border-l-zinc-300 border-zinc-700 bg-zinc-900/80'
		: 'surface-nested'}"
>
	<RiderAvatar jerseyUrl={rider.jerseyUrl} name={rider.name} size="sm" />
	<div class="min-w-0 flex-1">
		<p class="truncate font-medium {muted ? 'text-zinc-400' : 'text-zinc-100'}">{rider.name}</p>
		{#if rider.teamShortName || rider.team}
			<p class="truncate meta-text">{rider.teamShortName ?? rider.team}</p>
		{/if}
	</div>
	<span
		class="shrink-0 text-xs font-semibold
			{isCaptain ? 'text-zinc-200' : muted ? 'text-zinc-500' : 'text-zinc-400'}"
	>
		{formatRoleLabel(rider.role)}
	</span>
</li>
