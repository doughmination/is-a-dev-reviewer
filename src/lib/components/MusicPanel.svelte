<!-- lib/components/MusicPanel.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import { music } from "#lib/client/music.svelte.ts";

  let video = $state<HTMLVideoElement | null>(null);
  let dragging = $state(false);
  let picker = $state<HTMLInputElement | null>(null);

  const clock = (seconds: number) => {
    if (!Number.isFinite(seconds)) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${rest}`;
  };

  const progress = $derived(music.duration ? (music.position / music.duration) * 100 : 0);
  const uploads = $derived(Object.entries(music.uploads));

  $effect(() => {
    music.element = video;
    if (video) video.volume = music.volume;
  });

  const togglePlay = () => music.togglePlay();

  function seek(event: MouseEvent) {
    if (!video || !music.duration) return;
    const bar = event.currentTarget as HTMLElement;
    const fraction = (event.clientX - bar.getBoundingClientRect().left) / bar.clientWidth;
    video.currentTime = fraction * music.duration;
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    dragging = false;
    const files = [...(event.dataTransfer?.files ?? [])];
    if (files.length) music.addFiles(files);
  }
</script>

<aside
  class="panel music"
  class:live={music.playing}
  class:dragging
  ondragover={(event) => {
    event.preventDefault();
    dragging = true;
  }}
  ondragleave={() => (dragging = false)}
  ondrop={onDrop}
>
  <div class="mu-heading-row">
    <p class="mu-heading">Music</p>
    <button class="mu-sync" class:on={music.shuffle} onclick={() => music.toggle("shuffle")}>
      Shuffle
    </button>
  </div>

  {#if music.track}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video
      bind:this={video}
      src={music.track.url}
      autoplay
      loop={music.loop}
      onplay={() => (music.playing = true)}
      onpause={() => (music.playing = false)}
      ontimeupdate={() => (music.position = video?.currentTime ?? 0)}
      ondurationchange={() => (music.duration = video?.duration ?? 0)}
      onended={() => music.next()}
      onerror={() => (music.error = `can't play ${music.track?.name}, webkit may lack the codec`)}
      onclick={togglePlay}
    ></video>

    <div class="mu-card">
      <div class="mu-meta">
        <p class="mu-state">
          <span class="mu-eq" aria-hidden="true"><span></span><span></span><span></span><span></span></span>
          {music.playing ? "Now playing" : "Paused"}
        </p>
        <p class="mu-song" title={music.track.title}>{music.track.title}</p>

        <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
        <div class="mu-progress" onclick={seek}>
          <span class="mu-time">{clock(music.position)}</span>
          <div class="mu-bar"><div class="mu-fill" style="width: {progress}%"></div></div>
          <span class="mu-time">{clock(music.duration)}</span>
        </div>

        <div class="controls">
          <button onclick={() => music.next(-1)} aria-label="Previous">⏮</button>
          <button class="primary" onclick={togglePlay}>{music.playing ? "Pause" : "Play"}</button>
          <button onclick={() => music.next(1)} aria-label="Next">⏭</button>
          <button class="mu-sync" class:on={music.loop} onclick={() => music.toggle("loop")}>Loop</button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={music.volume}
            oninput={(event) => music.setVolume(Number(event.currentTarget.value))}
            aria-label="Volume"
          />
        </div>
      </div>
    </div>
  {:else}
    <p class="mu-empty">Drop music videos here (webm, mp4 or audio, up to 100MB each).</p>
  {/if}

  <input
    bind:this={picker}
    type="file"
    accept="video/*,audio/*"
    multiple
    hidden
    onchange={(event) => music.addFiles([...(event.currentTarget.files ?? [])])}
  />

  {#each uploads as [name, state] (name)}
    <p class="upload" class:error={state !== "uploading"}>
      {state === "uploading" ? "Uploading" : "Failed"} {name}{state !== "uploading" ? `: ${state}` : "…"}
    </p>
  {/each}

  {#if music.error}
    <p class="error">{music.error}</p>
  {/if}

  <div class="mu-heading-row">
    <p class="mu-heading">{music.items.length} in your library</p>
    <button class="mu-sync" onclick={() => picker?.click()}>Add files</button>
  </div>

  <ul class="mu-recent">
    {#each music.items as item (item.name)}
      <li class="track">
        <button
          class="mu-recent-item"
          class:playing={item.name === music.current}
          onclick={() => music.play(item.name)}
        >
          <span class="mu-recent-text">
            <span class="mu-recent-name">{item.title}</span>
          </span>
        </button>
        <button class="remove" aria-label="Delete {item.title}" onclick={() => music.remove(item.name)}>✕</button>
      </li>
    {/each}
  </ul>
</aside>

<style>
  .panel {
    overflow-y: auto;
    padding: 12px 16px;
    border-left: 1px solid var(--line);
  }

  .dragging {
    outline: 2px dashed var(--accent);
    outline-offset: -6px;
    background: var(--accent-dim);
  }

  video {
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: 1rem;
    background: #000;
    cursor: pointer;
  }

  .mu-card {
    padding: 1rem;
  }

  .mu-song {
    font-size: 1.05rem;
  }

  .mu-progress {
    cursor: pointer;
  }

  .controls {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-top: 0.8rem;
  }

  .controls input {
    flex: 1;
    min-width: 80px;
    padding: 0;
    accent-color: var(--accent);
  }

  .track {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .remove {
    padding: 0.2rem 0.5rem;
    border: 0;
    background: transparent;
    color: var(--muted);
    opacity: 0;
  }

  .track:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }

  .upload {
    margin: 0;
    overflow: hidden;
    font-size: 0.8rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .mu-recent-item {
    grid-template-columns: 1fr;
    width: 100%;
    border: 0;
    border-radius: 0.75rem;
    background: transparent;
    text-align: left;
  }
</style>
