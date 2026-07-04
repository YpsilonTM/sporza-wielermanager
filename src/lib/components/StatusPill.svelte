<script lang="ts">
	import type { ConnectionStatus } from '$lib/types/connection';
	import { CONNECTION_LABELS } from '$lib/types/connection';

	let { status = 'connecting' }: { status?: ConnectionStatus } = $props();

	const dotClass = $derived(
		status === 'connected'
			? 'status-dot-connected'
			: status === 'disconnected'
				? 'status-dot-disconnected'
				: 'status-dot-connecting'
	);
</script>

<span class="status-pill">
	<span class="status-dot {dotClass}" aria-hidden="true"></span>
	{CONNECTION_LABELS[status]}
</span>
