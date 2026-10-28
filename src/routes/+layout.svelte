<!-- routes/+layout.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import "#lib/styles/app.css";
  import { siteName, siteUrl } from "#lib/site.ts";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href="/favicon.ico" sizes="32x32" />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <link rel="apple-touch-icon" href="/favicon.png" />
  <meta name="theme-color" content="#eb459e" />

  <meta property="og:site_name" content={siteName} />
  <meta property="og:type" content="website" />
  <meta property="og:locale" content="en_GB" />
  <meta property="og:image" content="{siteUrl}/favicon.png" />
  <meta property="og:image:width" content="512" />
  <meta property="og:image:height" content="512" />
  <meta property="og:image:alt" content="Clove Twilight's site icon" />
  <meta name="twitter:card" content="summary" />
  <meta name="twitter:site" content="@DoughminCEO" />
</svelte:head>

<div class="backdrop" aria-hidden="true"></div>

{@render children()}
