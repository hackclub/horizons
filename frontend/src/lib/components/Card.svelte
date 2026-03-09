<script lang="ts">
    interface Props {
        title?: string;
        highlighted?: boolean;
        selected?: boolean;
        class?: string;
    }

    let { title = '', highlighted = false, selected = false, class: className = '' }: Props = $props();
</script>

<div class="card {className}" class:highlighted class:selected>
    {#if title}
        <p class="title">{title}</p>
    {/if}
    <slot />
</div>

<style>
    .card {
        background-color: #f3e8d8;
        border: 4px solid black;
        border-radius: 20px;
        padding: 36px;
        box-shadow: 4px 4px 0px 0px black;
        display: flex;
        flex-direction: column;
        align-items: center;
        overflow: hidden;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    

    .title {
        font-family: var(--font-cook);
        font-size: 20px;
        font-weight: 600;
        text-align: center;
        color: black;
        margin: 0;
    }

    .card.highlighted .title {
        font-size: 32px;
    }

    .card.selected {
        transform: translateY(-8px);
        box-shadow: 8px 8px 0px 0px black;
        border-color: #ffa936;
    }
</style>
