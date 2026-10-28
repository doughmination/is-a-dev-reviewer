<!-- lib/components/Review.svelte
     MIT Licence — (c) Clove Twilight -->

<script lang="ts">
  import { api, openExternal } from "#lib/client/api.ts";
  import type { Review } from "#lib/client/review.svelte.ts";
  import { settings } from "#lib/client/settings.svelte.ts";
  import { cannedById } from "#lib/core/canned.ts";
  import { checkKind } from "#lib/core/checks.ts";
  import LiveSite from "./LiveSite.svelte";

  let { review }: { review: Review } = $props();

  const pull = $derived(review.selected);
  const parsed = $derived(review.parsed);
  const verdict = $derived(review.verdict);
  const detail = $derived(review.detail);
  const nested = $derived(detail.files?.some((file) => file.name?.includes(".") && !file.name.startsWith("_")) ?? false);
  const questions = $derived(review.profile.judgeQuestions.filter((question) => !(nested && question.skipNested)));

  let screenshotWait = $state(3500);
  let screenshotFailed = $state(false);

  const replyTitle = (id: string) => cannedById(settings.canned, id)?.title ?? id;

  // Screenshot by default; live is opt in since random sites can pin the cpu
  let previewMode = $state<"shot" | "live">("shot");

  $effect(() => {
    void pull?.number;
    previewMode = "shot";
    screenshotWait = 3500;
    screenshotFailed = false;
  });
</script>

{#if !pull || !parsed || !verdict}
  <section class="review empty">
    <p class="muted">Nothing selected. Queue empty, or press r to refresh.</p>
  </section>
{:else}
  <section class="review">
    <header>
      <h2>
        <span class="number">#{pull.number}</span>
        {pull.title}
      </h2>
      <p class="muted">
        by {pull.author?.login}
        · {pull.files.map((file) => file.path).join(", ")}
      </p>
    </header>

    <div class="verdict tone-{verdict.tone}">
      <strong>{verdict.headline}</strong>

      <ul>
        {#each verdict.issues as issue (issue.id)}
          <li class="issue level-{issue.level}">
            <div>
              <span>{issue.title}</span>
              {#if issue.detail}
                <small class="muted">{issue.detail}</small>
              {/if}
            </div>

            {#if issue.reply}
              <button onclick={() => review.sendReply(issue.reply!)}>
                {replyTitle(issue.reply)}
              </button>
            {/if}

            {#if issue.action === "approveCI"}
              <button onclick={() => review.approveRuns()}>Approve runs</button>
            {/if}
          </li>
        {/each}
      </ul>
    </div>

    <div class="actions">
      <button
        class="primary"
        disabled={!verdict.canMerge}
        onclick={() => review.approveAndMerge()}
      >
        Approve & merge
      </button>
      <button onclick={() => openExternal(pull.url)}>Open on GitHub</button>
      {#if parsed.preview}
        <button onclick={() => openExternal(parsed.preview!)}>Open in browser</button>
      {/if}
    </div>

    <div class="judge">
      {#each questions as question (question.id)}
        <div class="question">
          <span>{question.question}</span>
          <button onclick={() => review.sendReply(question.reply)}>No: {question.no}</button>
        </div>
      {/each}
    </div>

    {#if parsed.preview}
      <div class="preview">
        <div class="preview-bar">
          <p class="eyebrow">Preview</p>
          <button class="mu-sync" class:on={previewMode === "shot"} onclick={() => (previewMode = "shot")}>
            Screenshot
          </button>
          <button class="mu-sync" class:on={previewMode === "live"} onclick={() => (previewMode = "live")}>
            Live (muted)
          </button>
          <button class="mu-sync" onclick={() => openExternal(parsed.preview!)}>New tab</button>
          <span class="muted url">{detail.site?.finalUrl ?? parsed.preview}</span>
        </div>

        {#if previewMode === "live"}
          {#key parsed.preview}
            <LiveSite url={parsed.preview} frameable={detail.probe?.frameable ?? true} />
          {/key}
        {:else if screenshotFailed}
          <p class="muted">No screenshot. Try Live or a new tab.</p>
        {:else}
          <img
            src={api.screenshotUrl(parsed.preview, screenshotWait)}
            alt="Screenshot of {parsed.preview}"
            onerror={() => (screenshotFailed = true)}
          />
          <button class="mu-sync wait" onclick={() => (screenshotWait = 9000)} disabled={screenshotWait === 9000}>
            Wait longer
          </button>
        {/if}
      </div>
    {/if}

    <div class="columns">
      <div>
        <h3>Requirements</h3>
        <ul class="plain">
          {#each parsed.boxes as box (box.key)}
            <li class="box-{box.state}">{box.state === "checked" ? "✓" : "✗"} {box.label}</li>
          {/each}
        </ul>

        <h3>Checks</h3>
        <ul class="plain">
          {#each pull.checks as check (check.name + check.workflow)}
            <li class="check-{checkKind(check)}">{check.name}: {check.conclusion ?? check.status}</li>
          {/each}
        </ul>
      </div>

      <div>
        <h3>Files</h3>
        {#each detail.files ?? [] as file (file.path)}
          <details open>
            <summary>{file.path} <small class="muted">{file.changeType}</small></summary>
            {#if file.content}
              <pre>{file.content}</pre>
            {:else if file.error}
              <p class="error">{file.error}</p>
            {/if}
          </details>
        {:else}
          <p class="muted">Loading files…</p>
        {/each}
      </div>
    </div>
  </section>
{/if}

<style>
  .review {
    display: grid;
    align-content: start;
    gap: 16px;
    overflow-y: auto;
    padding: 16px 24px;
  }

  h2 {
    margin: 0;
  }

  .number {
    color: var(--accent);
  }

  .verdict {
    padding: 12px 16px;
    border-radius: 12px;
    background: var(--raised);
    border-left: 6px solid var(--line);
  }

  .tone-close {
    border-left-color: var(--bad);
  }

  .tone-fix {
    border-left-color: var(--warn);
  }

  .tone-judge,
  .tone-go {
    border-left-color: var(--ok);
  }

  .verdict ul {
    display: grid;
    gap: 6px;
    margin: 8px 0 0;
    padding: 0;
    list-style: none;
  }

  .issue {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .issue div {
    display: grid;
  }

  .level-bad span {
    color: var(--bad);
  }

  .level-warn span {
    color: var(--warn);
  }

  .actions,
  .judge {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .question {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--raised);
  }

  .preview {
    display: grid;
    gap: 8px;
  }

  .preview-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .preview-bar .eyebrow {
    margin-right: 6px;
  }

  .url {
    overflow: hidden;
    font-size: 0.8rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wait {
    justify-self: start;
  }

  .preview img {
    width: 100%;
    max-height: 520px;
    object-fit: cover;
    object-position: top;
    border-radius: 12px;
  }

  .columns {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 24px;
  }

  .plain {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .box-unchecked,
  .box-missing,
  .check-bad {
    color: var(--bad);
  }

  .check-wait {
    color: var(--warn);
  }

  pre {
    max-height: 320px;
    overflow: auto;
    padding: 10px;
    border-radius: 8px;
    background: var(--raised);
  }
</style>
