<script lang="ts">
	import wasdSvg from '$lib/assets/prompts/wasd.svg';
	import wsSvg from '$lib/assets/prompts/ws.svg';
	import adSvg from '$lib/assets/prompts/ad.svg';
	import escSvg from '$lib/assets/prompts/esc.svg';
	import enterSvg from '$lib/assets/prompts/enter.svg';
	import mouseSvg from '$lib/assets/prompts/mouse.svg';
	import mouseScrollSvg from '$lib/assets/prompts/mouse-scroll.svg';
	import clickSvg from '$lib/assets/prompts/click.svg';
	import type { InputPromptType } from '$lib/input';

    type InputPromptProps = {
        type: InputPromptType
    };

    const { type }: InputPromptProps = $props();
</script>

<div class="h-12 shrink-0">
	{#if type == 'WASD'}
		<img src={wasdSvg} alt="WASD keys" class="h-full" />
	{:else if type == 'WS'}
		<img src={wsSvg} alt="WS keys" class="h-full" />
	{:else if type == 'AD'}
		<img src={adSvg} alt="AD keys" class="h-full" />
	{:else if type == 'ESC'}
		<img src={escSvg} alt="Escape key" class="h-full" />
	{:else if type == 'Enter'}
		<img src={enterSvg} alt="Enter key" class="h-full" />		
	{:else if type == 'mouse'}
		<img src={mouseSvg} alt="mouse" class="h-full" />
	{:else if type == 'click'}
		<img src={clickSvg} alt="mouse" class="h-full" />
	{:else if type == 'mouse-scroll'}
		<img src={mouseScrollSvg} alt="mouse scroll" class="h-full" />
	{/if}
</div>
