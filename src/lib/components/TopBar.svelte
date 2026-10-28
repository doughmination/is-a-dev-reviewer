<!-- lib/components/TopBar.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import { page } from "$app/state";
  import { music } from "#lib/client/music.svelte.ts";
  import { PROFILES } from "#lib/core/profiles.ts";

  type User = {
    login: string;
    avatar: string;
    name: string;
  };

  let { user, canReviewBot }: { user: User; canReviewBot: boolean } = $props();

  const tabs = $derived([
    {
      href: "/register",
      label: PROFILES.register.label,
      enabled: true,
    },
    {
      href: "/bot",
      label: PROFILES.bot.label,
      enabled: canReviewBot,
    },
  ]);
</script>

<header class="bar">
  <strong class="brand">clove-reviewer</strong>

  <nav>
    {#each tabs as tab (tab.href)}
      {#if tab.enabled}
        <a class="tab" class:active={page.url.pathname.startsWith(tab.href)} href={tab.href}>{tab.label}</a>
      {:else}
        <span class="tab disabled" title="Needs free-domains membership and push access to free-domains/is-a.bot">
          {tab.label}
        </span>
      {/if}
    {/each}
  </nav>

  <button class="mu-sync" class:on={music.open} onclick={() => music.toggle("open")}>Music</button>

  <span class="user">
    <img src={user.avatar} alt="" width="28" height="28" />
    @{user.login}
  </span>

  <form method="POST" action="/auth/logout">
    <button type="submit">Sign out</button>
  </form>
</header>

<style>
  .bar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 8px 16px;
    border-bottom: 1px solid var(--line);
    backdrop-filter: blur(8px);
  }

  .brand {
    color: var(--accent);
  }

  nav {
    display: flex;
    gap: 4px;
    margin-right: auto;
  }

  .tab {
    padding: 0.3rem 0.9rem;
    border-radius: 999px;
    white-space: nowrap;
    color: var(--muted);
    text-decoration: none;
  }

  .tab:hover {
    color: var(--text);
  }

  .tab.active {
    background: var(--accent-dim);
    color: var(--accent);
    font-weight: 600;
  }

  .tab.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .user {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .user img {
    border-radius: 50%;
  }

  form {
    margin: 0;
  }
</style>
