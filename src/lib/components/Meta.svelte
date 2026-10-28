<!-- lib/components/Meta.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import { page } from "$app/state";
  import { accentColour, mainSiteUrl, siteDomain, siteUrl } from "#lib/site.ts";

  let {
    title,
    description,
  }: {
    title: string;
    description: string;
  } = $props();

  const pageUrl = $derived(siteUrl + page.url.pathname);

  // Link buttons: open the reviewer, plus the main site
  const buttons = $derived([
    {
      type: 2,
      style: 5,
      label: "Open reviewer",
      url: siteUrl + "/",
    },
    {
      type: 2,
      style: 5,
      label: "doughmination.gay",
      url: mainSiteUrl + "/",
    },
  ]);

  // Discord component embed: one Container, max 3,000 bytes, Open Graph tags are the fallback
  const componentEmbed = $derived({
    component: {
      type: 17,
      accent_color: accentColour,
      components: [
        {
          type: 9,
          components: [
            {
              type: 10,
              content: `## ${title}`,
            },
            {
              type: 10,
              content: description,
            },
          ],
          accessory: {
            type: 11,
            media: { url: siteUrl + "/favicon.png" },
          },
        },
        { type: 14 },
        {
          type: 1,
          components: buttons,
        },
        {
          type: 10,
          content: `-# ${siteDomain}`,
        },
      ],
    },
  });

  // Escape '<' so the JSON can't close the script tag early
  const toJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

  // Split closing tag so it doesn't end this script block
  const closingTag = "</" + "script>";
  const embedTag = $derived(
    `<script id='discord:component-embed' type='application/json'>${toJson(componentEmbed)}${closingTag}`,
  );
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={pageUrl} />

  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={pageUrl} />

  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />

  <!-- Built from page props, '<' escaped -->
  {@html embedTag}
</svelte:head>
