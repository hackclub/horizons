<script lang="ts">
    import CircleIn from "$lib/components/anim/CircleIn.svelte";
    import BG from "$lib/components/BG.svelte";

    let disableAnimations = false;
</script>

<CircleIn />

<BG class="flex flex-col overflow-hidden" {disableAnimations}>
</BG>