/* lib/core/canned.ts
 * MIT Licence — (c) Clove Twilight
 */

export type Canned = {
  id: string;
  title: string;
  body: string;
  labels: string[];
  close: boolean;
  bot?: boolean;
};

export const CANNED_VERSION = 6;

// every reply posts my own comment. status: denied / status: invalid are left out on purpose: reviewbot
// comments (and closes) as soon as it sees them, even on prs I already closed
export const DEFAULT_CANNED: Canned[] = [
  {
    id: "needs-preview",
    title: "Needs preview",
    body: "Hey @{author}, please add a link to your website in the **Website Preview** section of the PR description (where it's hosted right now, e.g. `https://you.github.io`). I can't review it without one.",
    labels: ["status: needs preview", "status: awaiting user response"],
    close: false,
  },
  {
    id: "checkboxes",
    title: "Incomplete template",
    body: "Closing this since the PR template isn't complete. All the requirements have to be read and ticked. Feel free to open a new PR with the full template filled in.",
    labels: ["reason: incomplete pr"],
    close: true,
  },
  {
    id: "unreachable",
    title: "Site down / 404",
    body: "Closing this since your website ({preview}) isn't reachable (got {status}). Feel free to open a new PR once it's online.",
    labels: ["reason: inaccessible website"],
    close: true,
  },
  {
    id: "tests",
    title: "Tests failing",
    body: "Hey @{author}, the checks on this PR failed. Here's what to fix:\n\n{failing}\n\n{suggested}Push the fix to this branch and the checks will rerun on their own.",
    labels: ["status: awaiting user response"],
    close: false,
  },
  {
    id: "isadev-preview",
    title: "Preview is the requested domain",
    body: "Closing this since the preview link goes to {service} ({final}) instead of your actual website. Put the link to where your site is hosted right now (e.g. `https://you.github.io` or `https://you.vercel.app`) in the **Website Preview** section, then reopen this PR (or open a new one if GitHub doesn't let you).",
    labels: ["reason: incomplete pr"],
    close: true,
  },
  {
    id: "locked",
    title: "Site needs login",
    body: "Closing this since your website ({final}) asks for a Vercel login / access request, so nobody else can see it. Turn off Vercel Authentication (Project Settings, Deployment Protection) or use the public production URL, then reopen this PR (or open a new one if GitHub doesn't let you).",
    labels: ["reason: inaccessible website"],
    close: true,
  },
  {
    id: "custom-domain",
    title: "Custom domain set",
    body: "Hey @{author}, your preview link ({preview}) already redirects to {final}, which won't work until this PR is merged, so I can't see your site. Please remove the custom domain for now (GitHub Pages: repo Settings, Pages, Custom domain, Remove) so the link shows the site, and add it back after the merge.",
    labels: ["status: awaiting user response"],
    close: false,
  },
  {
    id: "vercel-deploy",
    title: "Vercel deploy link",
    body: "Hey @{author}, {preview} is a link to a single Vercel deployment, and those always ask for a Vercel login, so I can't see the site. Please put your production URL in the **Website Preview** section instead{prod}. You can find it under Domains in your Vercel project.",
    labels: ["status: awaiting user response"],
    close: false,
  },
  {
    id: "incomplete",
    title: "Incomplete site",
    body: "Closing this for now since the website isn't finished yet (placeholder / template content). Open a new PR once there's real content on it and I'll take another look.",
    labels: ["reason: incomplete website"],
    close: true,
  },
  {
    id: "not-dev",
    title: "Not dev related",
    body: "Closing this since the website isn't related to software development, which is required for is-a.dev subdomains. See https://is-a.dev/terms",
    labels: ["reason: not dev related"],
    close: true,
  },
  {
    id: "commercial",
    title: "Commercial",
    body: "Closing this since {service} subdomains can't be used for commercial purposes. See https://is-a.dev/terms",
    labels: ["reason: commercial usage"],
    close: true,
  },
  {
    id: "invalid-records",
    title: "Invalid records",
    body: "Hey @{author}, some of the records in your file aren't valid or can't be combined like this. Please check https://docs.is-a.dev and fix them, then I'll review again.",
    labels: ["reason: invalid records", "status: awaiting user response"],
    close: false,
  },
  {
    id: "not-use-case",
    title: "Not a use case",
    body: "Closing this since this kind of site isn't something {service} supports (see the prohibited uses in https://is-a.dev/terms).",
    labels: ["reason: not a use case"],
    close: true,
  },
  {
    id: "tos",
    title: "TOS",
    body: "Closing this since it goes against the {service} terms of service: https://is-a.dev/terms",
    labels: ["reason: tos non-compliant"],
    close: true,
  },
  {
    id: "ai",
    title: "AI generated",
    body: "Closing this since it looks like the PR was generated by an AI tool. AI built websites are fine, but the PR itself has to be made by you.",
    labels: ["reason: ai generated pr"],
    close: true,
  },
  {
    id: "unauthorized",
    title: "Not their domain",
    body: "Hey @{author}, the owner in this file doesn't match your account, so you can't make changes to it. If this is your domain, please open the PR from the account listed as owner.",
    labels: ["reason: unauthorized", "status: awaiting user response"],
    close: false,
  },
  {
    id: "wrong-owner",
    title: "Wrong owner name",
    body: "Hey @{author}, `owner.username` in your file has to be your own GitHub username, `{author}`. Please change it and push to this branch.",
    labels: ["status: awaiting user response"],
    close: false,
  },
  {
    id: "renamed",
    title: "Old owner gone",
    body: "Hey @{author}, this domain is registered to an account that doesn't exist anymore. If that was your old GitHub username (you renamed the account), can you confirm that here? Linking something that shows it (an old repo, a profile, the site itself) helps.",
    labels: ["status: awaiting user response"],
    close: false,
  },
  {
    id: "duplicate",
    title: "Duplicate",
    body: "Closing this one since you already have another PR open for the same thing ({dup}). Please keep it to one PR.",
    labels: ["duplicate"],
    close: true,
  },
  {
    id: "lgtm",
    title: "LGTM",
    body: "Looks good, thanks @{author}! {domain} should be live shortly after merge.",
    labels: [],
    close: false,
  },
];

export function fillTemplate(
  template: string,
  vars: Record<string, string>,
) {
  return template.replace(
    /\{(\w+)\}/g,
    (match, key) => vars[key] ?? match,
  );
}

export function cannedById(
  saved: Canned[],
  id: string,
) {
  return saved.find((reply) => reply.id === id)
    ?? DEFAULT_CANNED.find((reply) => reply.id === id);
}
