<!-- README.md
     MIT Licence — (c) Clove Twilight -->

# clove-reviewer

review queue for is-a-dev/register and free-domains/is-a.bot prs. sveltekit on cloudflare workers, the web rewrite of isa-review.

## who gets in

1. sign in with your oidc server (it decides who may log in)
2. link github once (oauth app, scopes `read:org public_repo`)
3. **is-a.dev tab**: active member of `is-a-dev`. contributors and outside collaborators are turned away
4. **is-a.bot tab**: active member of `free-domains` and push access to `free-domains/is-a.bot`

membership is checked again every 10 minutes. the github token stays in the worker (kv session), the browser only ever talks to `/api/gh`, which refuses writes outside the repos you review and graphql mutations.

## run locally

```
bun install
cp .dev.vars.example .dev.vars   # fill in secrets
bun run preview                  # build + wrangler dev on :8787
bun test                         # core + proxy rule tests
bun run check                    # svelte-check
```

## deploy

1. bindings

   ```
   bunx wrangler kv namespace create SESSIONS   # paste the id into wrangler.jsonc
   bunx wrangler r2 bucket create reviewer-music
   ```

   browser rendering (screenshots) needs workers paid.

2. oidc client on your auth server: redirect uri `https://review.doughmination.gay/auth/callback`. set `OIDC_ISSUER` and `OIDC_CLIENT_ID` in `wrangler.jsonc`.

3. github oauth app (github settings → developer settings → oauth apps): callback `https://review.doughmination.gay/auth/github/callback`.

4. secrets

   ```
   bunx wrangler secret put OIDC_CLIENT_SECRET
   bunx wrangler secret put GITHUB_CLIENT_ID
   bunx wrangler secret put GITHUB_CLIENT_SECRET
   ```

5. `bun run deploy`

if `is-a-dev` or `free-domains` restrict third party oauth apps, an org owner has to approve the app once, otherwise membership checks fail for everyone.

## layout

| path | what |
| --- | --- |
| `src/lib/core/` | pure ts: github client, verdict, fixes, log parsing, queue rules, repo profiles |
| `src/lib/server/` | worker only: sessions, oidc, github oauth + access, proxy, probe, screenshots, music |
| `src/lib/client/` | browser stores: one review store per tab, music, settings |
| `src/lib/components/` | svelte ui |
| `src/routes/auth/` | sign in, github link, denied, sign out |
| `src/routes/api/` | gh proxy, probe, job logs, screenshots, music |
| `src/hooks.server.ts` | the gate: session, github link, membership, csrf, headers |

## shortcuts

| key | action |
| --- | --- |
| j / k | next / prev pr |
| r | refresh |
| o | open on github |
| shift+a | approve & merge |
| i | approve waiting ci runs |
| m | show / hide music |
| p | play / pause |
| n | next song |

## music

your own folder in r2 (`music/<github id>/`). drop files on the panel or use "add files". webm, mp4 and audio, up to 100mb each (the workers upload limit). grab youtube ones locally with yt-dlp first.

## live site

screenshot (cloudflare browser rendering), live (sandboxed iframe, no autoplay) or a new tab. sites that refuse framing get the new tab button.

## styles

theme, fonts, global and music styles come from `~/projects/web`, wallpaper is `static/background.avif`.

## licence

MIT, see LICENSE.
