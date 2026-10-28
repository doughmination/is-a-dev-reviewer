/* lib/client/toast.svelte.ts
 * MIT Licence — (c) Clove Twilight
 */

const SHOW_MS = 4000;

class Toast {
  message = $state<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  show(message: string) {
    this.message = message;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.message = null), SHOW_MS);
  }
}

export const toast = new Toast();
