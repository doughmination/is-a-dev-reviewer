/* lib/client/music.svelte.ts
 * MIT Licence — (c) Clove Twilight
 */

import type { MusicItem } from "#lib/core/types.ts";
import { api } from "./api.ts";
import { readStored, writeStored } from "./storage.ts";

type Saved = {
  open: boolean;
  current: string | null;
  shuffle: boolean;
  loop: boolean;
  volume: number;
};

const SAVED_DEFAULTS: Saved = {
  open: true,
  current: null,
  shuffle: true,
  loop: false,
  volume: 0.7,
};

class Music {
  items = $state<MusicItem[]>([]);
  // File name -> "uploading" / error text
  uploads = $state<Record<string, string>>({});
  error = $state<string | null>(null);

  open = $state(true);
  current = $state<string | null>(null);
  shuffle = $state(true);
  loop = $state(false);
  volume = $state(0.7);

  playing = $state(false);
  position = $state(0);
  duration = $state(0);

  // The <video> in the panel, for shortcuts
  element: HTMLVideoElement | null = null;

  track = $derived(this.items.find((item) => item.name === this.current) ?? null);

  load() {
    Object.assign(this, readStored("music", SAVED_DEFAULTS));
    this.refresh();
  }

  async refresh() {
    try {
      this.items = await api.musicList();
      if (!this.track && this.items.length) this.current = this.items[0].name;
    } catch (error) {
      this.error = String(error);
    }
  }

  save() {
    writeStored("music", {
      open: this.open,
      current: this.current,
      shuffle: this.shuffle,
      loop: this.loop,
      volume: this.volume,
    });
  }

  play(name: string) {
    this.current = name;
    this.save();
  }

  // Next track: random (never the same one twice) when shuffling, else in order
  next(offset = 1) {
    const list = this.items;
    if (!list.length) return;

    if (this.shuffle && list.length > 1) {
      const others = list.filter((item) => item.name !== this.current);
      this.play(others[Math.floor(Math.random() * others.length)].name);
      return;
    }

    const index = list.findIndex((item) => item.name === this.current);
    this.play(list[(index + offset + list.length) % list.length].name);
  }

  togglePlay() {
    if (!this.element) return;
    if (this.element.paused) this.element.play();
    else this.element.pause();
  }

  toggle(setting: "open" | "shuffle" | "loop") {
    this[setting] = !this[setting];
    this.save();
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    this.save();
  }

  // Dropped files go straight into your folder in the R2 bucket
  async addFiles(files: File[]) {
    this.error = null;

    for (const file of files) {
      this.uploads[file.name] = "uploading";
      try {
        await api.musicUpload(file);
        delete this.uploads[file.name];
      } catch (error: any) {
        this.uploads[file.name] = error.message ?? String(error);
      }
    }

    await this.refresh();
  }

  async remove(name: string) {
    await api.musicDelete(name);
    if (this.current === name) this.next();
    await this.refresh();
  }
}

export const music = new Music();
