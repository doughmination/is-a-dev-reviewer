<!-- lib/components/LiveSite.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import { openExternal } from "#lib/client/api.ts";

  let { url, frameable }: { url: string; frameable: boolean } = $props();

  let loaded = $state(false);
</script>

<div class="live">
  {#if frameable}
    <!-- Sandboxed: scripts run in the site's own origin, it can't navigate this page or open popups -->
    <iframe
      src={url}
      title="Live preview of {url}"
      sandbox="allow-scripts allow-same-origin allow-forms"
      allow="autoplay 'none'; camera 'none'; microphone 'none'; geolocation 'none'"
      referrerpolicy="no-referrer"
      loading="lazy"
      onload={() => (loaded = true)}
    ></iframe>
    {#if !loaded}
      <p class="muted status">Loading {url}…</p>
    {/if}
  {:else}
    <div class="blocked">
      <p>This site refuses to be shown inside other pages.</p>
      <button class="primary" onclick={() => openExternal(url)}>Open in a new tab</button>
    </div>
  {/if}
</div>

<style>
  .live {
    position: relative;
  }

  iframe,
  .blocked {
    width: 100%;
    height: 640px;
    border: 1px solid var(--line);
    border-radius: 1rem;
    background: #fff;
  }

  .blocked {
    display: grid;
    gap: 12px;
    place-content: center;
    justify-items: center;
    background: var(--raised);
  }

  .status {
    position: absolute;
    top: 12px;
    left: 16px;
    margin: 0;
  }
</style>
