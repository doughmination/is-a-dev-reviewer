<!-- lib/components/Queue.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import type { Review } from "#lib/client/review.svelte.ts";
  import { ago } from "#lib/core/time.ts";

  let { review }: { review: Review } = $props();

  let showHidden = $state(false);
</script>

<aside class="queue">
  <header>
    <strong>{review.queue.visible.length} to review</strong>
    <span class="muted">of {review.total} open</span>
    <button onclick={() => review.refresh()} disabled={review.loading}>
      {review.loading ? "…" : "Refresh"}
    </button>
  </header>

  <ul>
    {#each review.queue.visible as pull (pull.number)}
      <li>
        <button
          class="card"
          class:active={pull.number === review.selectedNumber}
          onclick={() => review.select(pull.number)}
        >
          <span class="number">#{pull.number}</span>
          <span class="title">{pull.title}</span>
          <span class="muted">{pull.author?.login} · {ago(pull.createdAt)}</span>
        </button>
      </li>
    {/each}
  </ul>

  {#if review.queue.hidden.length}
    <button class="chip" onclick={() => (showHidden = !showHidden)}>
      {review.queue.hidden.length} hidden
    </button>

    {#if showHidden}
      <ul class="hidden-list">
        {#each review.queue.hidden as entry (entry.pull.number)}
          <li>
            <button class="card" onclick={() => review.select(entry.pull.number)}>
              <span class="number">#{entry.pull.number}</span>
              <span class="title">{entry.pull.title}</span>
              <span class="muted">{entry.reason}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</aside>

<style>
  .queue {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    padding: 12px;
    border-right: 1px solid var(--line);
  }

  header {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  header button {
    margin-left: auto;
  }

  ul {
    display: grid;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .card {
    display: grid;
    width: 100%;
    gap: 2px;
    padding: 8px 10px;
    text-align: left;
    background: transparent;
    border-color: transparent;
  }

  .card.active {
    background: var(--raised);
    border-color: var(--accent);
  }

  .number {
    color: var(--accent);
    font-weight: 600;
  }

  .title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hidden-list {
    opacity: 0.7;
  }
</style>
