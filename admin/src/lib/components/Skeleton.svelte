<script lang="ts">
	type Props = {
		class?: string;
	};

	let { class: className = '' }: Props = $props();
</script>

<div class="animate-pulse rounded-md bg-rv-surface2 {className}"></div>
