<!-- routes/(app)/[tab=profile]/+page.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import { reviews } from "#lib/client/review.svelte.ts";
  import Queue from "#lib/components/Queue.svelte";
  import Review from "#lib/components/Review.svelte";

  let { data } = $props();

  const review = $derived(reviews[data.tab]);

  $effect(() => review.ensureLoaded());
</script>

<svelte:head>
  <title>{review.profile.label} · clove-reviewer</title>
</svelte:head>

{#if review.error}
  <p class="error banner">{review.error}</p>
{/if}

<div class="panes">
  <Queue {review} />
  <Review {review} />
</div>

<style>
  .panes {
    display: grid;
    grid-template-columns: 340px 1fr;
    min-height: 0;
  }

  .banner {
    margin: 0;
    padding: 8px 16px;
  }
</style>
