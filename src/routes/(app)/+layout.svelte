<!-- routes/(app)/+layout.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import { page } from "$app/state";
  import { openExternal } from "#lib/client/api.ts";
  import { music } from "#lib/client/music.svelte.ts";
  import { reviews } from "#lib/client/review.svelte.ts";
  import { toast } from "#lib/client/toast.svelte.ts";
  import MusicPanel from "#lib/components/MusicPanel.svelte";
  import TopBar from "#lib/components/TopBar.svelte";
  import { isProfileId } from "#lib/core/profiles.ts";

  let { data, children } = $props();

  music.load();

  const review = $derived.by(() => {
    const tab = page.params.tab ?? "";
    return isProfileId(tab) ? reviews[tab] : null;
  });

  const SHORTCUTS: Record<string, () => void> = {
    j: () => review?.step(1),
    k: () => review?.step(-1),
    r: () => review?.refresh(),
    o: () => review?.selected && openExternal(review.selected.url),
    A: () => review?.verdict?.canMerge && review.approveAndMerge(),
    i: () => review?.approveRuns(),
    m: () => music.toggle("open"),
    p: () => music.togglePlay(),
    n: () => music.next(),
  };

  function onKey(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target.isContentEditable;
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

    const action = SHORTCUTS[event.key];
    if (!action) return;

    event.preventDefault();
    action();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="app" class:with-music={music.open}>
  <div class="top">
    <TopBar user={data.user} canReviewBot={data.canReviewBot} />
  </div>

  <main class="content">
    {@render children()}
  </main>

  <!-- Always mounted so hiding the panel or switching tabs doesn't stop the song -->
  <MusicPanel />
</div>

{#if toast.message}
  <div class="toast" role="status">{toast.message}</div>
{/if}

<style>
  .app {
    display: grid;
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    height: 100vh;
  }

  .app.with-music {
    grid-template-columns: 1fr 400px;
  }

  .top {
    grid-column: 1 / -1;
  }

  .content {
    display: grid;
    min-height: 0;
    overflow: hidden;
  }

  .app:not(.with-music) :global(.music) {
    display: none;
  }

  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 16px;
    border-radius: 10px;
    background: var(--text);
    color: var(--bg);
  }
</style>
