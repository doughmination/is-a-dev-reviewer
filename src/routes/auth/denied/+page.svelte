<!-- routes/auth/denied/+page.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  let { data } = $props();
</script>

<main class="gate">
  <p class="eyebrow">No access</p>
  <h1>Members only</h1>

  {#if data.login}
    <p class="muted">
      @{data.login} isn't an active member of the <strong>is-a-dev</strong> organisation.
      Contributors and outside collaborators don't count.
    </p>
  {:else}
    <p class="muted">Sign in and link GitHub first.</p>
  {/if}

  <div class="row">
    <a class="button" href="/auth/github">Link a different GitHub account</a>
    <form method="POST" action="/auth/logout">
      <button type="submit">Sign out</button>
    </form>
  </div>
</main>
