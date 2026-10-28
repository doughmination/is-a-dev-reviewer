<!-- routes/welcome/+page.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import Meta from "#lib/components/Meta.svelte";

  let { data } = $props();

  const loginHref = $derived(`/auth/login?returnTo=${encodeURIComponent(data.returnTo)}`);
</script>

<Meta
  title="clove-reviewer"
  description="Review queue for is-a.dev and is-a.bot pull requests. Maintainers only."
/>

<main class="gate">
  <p class="eyebrow">Maintainers only</p>
  <h1>clove-reviewer</h1>
  <p class="muted">
    The review queue for <strong>is-a-dev/register</strong> and <strong>free-domains/is-a.bot</strong>.
    Sign in with Doughmination SSO, then link the GitHub account you review with.
  </p>

  <div class="row">
    <a class="button primary" href={loginHref}>Sign in</a>
  </div>
</main>
