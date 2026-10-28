<!-- routes/+layout.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import "#lib/styles/app.css";

  let { children } = $props();
</script>

<div class="backdrop" aria-hidden="true"></div>

{@render children()}
