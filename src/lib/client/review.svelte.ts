/* lib/client/review.svelte.ts
 * MIT Licence — (c) Clove Twilight
 */

import { cannedById, fillTemplate } from "#lib/core/canned.ts";
import { checkKind, jobId, parseLog, reasonFor, type Failure } from "#lib/core/checks.ts";
import { Github } from "#lib/core/github.ts";
import { PROFILES, type ProfileId, type RepoProfile } from "#lib/core/profiles.ts";
import { splitQueue } from "#lib/core/queue.ts";
import { explainFailures, replyVars, type ReplyContext } from "#lib/core/replies.ts";
import { siteInfoFrom, type SiteInfo } from "#lib/core/site.ts";
import { analyzeDomainFile } from "#lib/core/template.ts";
import type { Probe, PullRequest } from "#lib/core/types.ts";
import { verdict, type FileInfo, type Verdict } from "#lib/core/verdict.ts";
import { api } from "./api.ts";
import { settings } from "./settings.svelte.ts";
import { toast } from "./toast.svelte.ts";

export type Detail = {
  files: FileInfo[] | null;
  site: SiteInfo | null;
  probe: Probe | null;
  probing: boolean;
  pendingRuns: number;
  failures: Failure[];
};

const emptyDetail = (): Detail => ({
  files: null,
  site: null,
  probe: null,
  probing: false,
  pendingRuns: 0,
  failures: [],
});

// One per tab: is-a.dev and is-a.bot each keep their own queue and selection
export class Review {
  readonly profile: RepoProfile;
  readonly github: Github;

  pulls = $state<PullRequest[]>([]);
  total = $state(0);
  loading = $state(false);
  loaded = $state(false);
  error = $state<string | null>(null);
  selectedNumber = $state<number | null>(null);
  detail = $state<Detail>(emptyDetail());
  trusted = $state<Set<number>>(new Set());

  queue = $derived(splitQueue(this.pulls, settings));
  selected = $derived(this.pulls.find((pull) => pull.number === this.selectedNumber) ?? null);
  parsed = $derived.by(() => (this.selected ? this.profile.parseBody(this.selected.body) : null));

  verdict = $derived.by((): Verdict | null => {
    if (!this.selected || !this.parsed) return null;
    return verdict({
      pull: this.selected,
      boxes: this.parsed.boxes,
      hasTemplate: this.parsed.hasTemplate,
      preview: this.parsed.preview,
      files: this.detail.files,
      site: this.detail.site,
      probing: this.detail.probing,
      pendingRuns: this.detail.pendingRuns,
      failures: this.detail.failures,
      reason: reasonFor(this.detail.failures),
      queue: this.queue.visible,
      trusted: this.trusted,
      service: this.profile.service,
    });
  });

  constructor(profileId: ProfileId) {
    this.profile = PROFILES[profileId];
    // The worker adds the token, the browser never sees it
    this.github = new Github({
      repo: this.profile.repo,
      apiBase: "/api/gh",
    });
  }

  // First visit to the tab loads it, later visits keep what's there
  ensureLoaded() {
    if (this.loaded || this.loading) return;
    this.github.trusted().then((users) => (this.trusted = new Set(users.map((user) => user.id))));
    this.refresh();
  }

  async refresh() {
    this.loading = true;
    this.error = null;

    try {
      const page = await this.github.listPulls(settings.extraQuery, null);
      this.pulls = page.pulls;
      this.total = page.total;
      this.loaded = true;

      const stillThere = this.queue.visible.some((pull) => pull.number === this.selectedNumber);
      if (!stillThere) this.select(this.queue.visible[0]?.number ?? null);
    } catch (error) {
      this.error = String(error);
    } finally {
      this.loading = false;
    }
  }

  select(number: number | null) {
    this.selectedNumber = number;
    this.detail = emptyDetail();
    if (number !== null) this.loadDetail(number);
  }

  step(offset: number) {
    const list = this.queue.visible;
    const index = list.findIndex((pull) => pull.number === this.selectedNumber);
    const next = list[Math.max(0, Math.min(list.length - 1, index + offset))];
    if (next) this.select(next.number);
  }

  // Everything the verdict needs beyond the list query, each part fills in as it lands
  private loadDetail(number: number) {
    const pull = this.pulls.find((item) => item.number === number);
    if (!pull) return;

    const isCurrent = () => this.selectedNumber === number;
    const preview = this.profile.parseBody(pull.body).preview;

    this.loadFiles(pull).then((files) => isCurrent() && (this.detail.files = files));
    this.loadFailures(pull).then((failures) => isCurrent() && (this.detail.failures = failures));

    this.github.pendingRuns(pull.headOid)
      .then((runs) => isCurrent() && (this.detail.pendingRuns = runs.length))
      .catch(() => {});

    if (!preview) return;

    this.detail.probing = true;
    api.probeSite(preview)
      .then((probe) => {
        if (!isCurrent()) return;
        this.detail.probe = probe;
        this.detail.site = siteInfoFrom(preview, probe, this.profile.service);
      })
      .catch(() => isCurrent() && (this.detail.site = siteInfoFrom(preview, null, this.profile.service)))
      .finally(() => isCurrent() && (this.detail.probing = false));
  }

  private loadFiles(pull: PullRequest): Promise<FileInfo[]> {
    const author = pull.author?.login;

    return Promise.all(pull.files.map(async (file): Promise<FileInfo> => {
      const info: FileInfo = { path: file.path, changeType: file.changeType };
      if (!file.path.endsWith(".json")) return info;

      try {
        if (file.changeType !== "ADDED") {
          const onMain = await this.github.fileOnMain(file.path);
          if (onMain) info.before = JSON.parse(onMain);
        }
        if (file.changeType === "DELETED") return info;

        const content = await this.github.fileAt(file.path, pull.headOid);
        const analysis = analyzeDomainFile(file.path, content, author);
        return {
          ...info,
          name: analysis.name,
          json: analysis.json,
          content,
          hints: analysis.hints,
        };
      } catch (error) {
        return { ...info, error: String(error) };
      }
    }));
  }

  private async loadFailures(pull: PullRequest): Promise<Failure[]> {
    const failed = pull.checks.filter((check) => checkKind(check) === "bad");

    const logs = await Promise.all(failed.map(async (check) => {
      const id = jobId(check);
      if (!id) return [];
      try {
        return parseLog(await api.jobLog(this.profile.repo, id));
      } catch {
        return [];
      }
    }));

    return logs.flat();
  }

  private replyContext(pull: PullRequest): ReplyContext {
    return {
      pull,
      preview: this.parsed?.preview ?? null,
      files: this.detail.files ?? [],
      site: this.detail.site,
      failures: this.detail.failures,
      queue: this.queue.visible,
      service: this.profile.service,
    };
  }

  // Post a canned reply as me, add its labels, close if the reply says so
  async sendReply(replyId: string) {
    const pull = this.selected;
    const reply = cannedById(settings.canned, replyId);
    if (!pull || !reply) return;

    const context = this.replyContext(pull);
    const fixes = explainFailures(context);
    const body = fillTemplate(reply.body, replyVars(context, fixes));
    // Failing tests with clear fixes go out as a review with commit-able suggestions
    const asReview = replyId === "tests" && fixes.suggestions.length > 0;
    const extraLabels = this.verdict?.issues.find((issue) => issue.reply === replyId)?.labels ?? [];
    const labels = [...new Set([...reply.labels, ...extraLabels])];

    await this.act(`${reply.title} on #${pull.number}`, async () => {
      await this.github.preflight(pull.number, { sha: pull.headOid, body });
      if (asReview) await this.github.requestChanges(pull.number, body, pull.headOid, fixes.suggestions);
      else await this.github.comment(pull.number, body);
      if (labels.length) await this.github.addLabels(pull.number, labels);
      if (reply.close) await this.github.close(pull.number);
    });
  }

  async approveAndMerge() {
    const pull = this.selected;
    if (!pull) return;
    await this.act(`merged #${pull.number}`, () => this.github.approveAndMerge(pull.number, pull.headOid, true));
  }

  async approveRuns() {
    const pull = this.selected;
    if (!pull) return;

    await this.act(`approved checks on #${pull.number}`, async () => {
      const runs = await this.github.pendingRuns(pull.headOid);
      await Promise.all(runs.map((run) => this.github.approveRun(run.id)));
    }, false);
  }

  // Runs an action, moves on right away when it finishes the pr
  private async act(done: string, work: () => Promise<unknown>, finishesPull = true) {
    const number = this.selectedNumber;
    if (finishesPull) this.step(1);

    try {
      await work();
      toast.show(done);
      if (finishesPull) this.pulls = this.pulls.filter((pull) => pull.number !== number);
    } catch (error: any) {
      toast.show(`#${number}: ${error.message ?? error}`);
      if (finishesPull && number !== null) this.select(number);
    }
  }
}

export const reviews: Record<ProfileId, Review> = {
  register: new Review("register"),
  bot: new Review("bot"),
};
