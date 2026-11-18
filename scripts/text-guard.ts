#!/usr/bin/env bun
// Text guard for what people write on GitHub: issue, pull request and discussion titles and
// bodies, comments and reviews. It runs the safety guard's text scanner (secrets, home paths,
// e-mails, public IPs, denylisted and private words) over the text of one webhook event.
//
// On a finding the run fails. Text by the maintainers (OWNER or MEMBER) or by a bot, which is
// where our agents post, is also taken down: a comment is deleted, a body or title is replaced.
// Text by anyone else is left alone, because they can't know the private word list and a false
// positive must not destroy their words.
//
// The log is public: it names only the finding types and the URL, never the text.
//
// Usage:
//   bun scripts/text-guard.ts --event NAME --payload FILE [--apply]   scan one webhook payload
//   bun scripts/text-guard.ts --ref FILE [--apply]                    re-fetch a deferred item
//   bun scripts/text-guard.ts --event NAME --payload FILE --write-ref FILE
//                                                    write the ids of a fork's event for later
// --apply takes the text down; without it the guard only reports. GITHUB_TOKEN and
// GITHUB_REPOSITORY come from the environment, private words from SAFETY_GUARD_WORDS.
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadRules, scanText, type Rules } from "./safety-guard";

export const REDACTED = "[redacted by the safety guard, see the maintainer]";

/** Where a piece of text lives, and how to take it down. */
export type Target =
  | { type: "issue-comment"; id: number }
  | { type: "issue"; number: number }
  | { type: "pull"; number: number }
  | { type: "review-comment"; id: number }
  | { type: "review"; number: number; id: number }
  | { type: "discussion"; nodeId: string }
  | { type: "discussion-comment"; nodeId: string };

export interface Item {
  url: string;
  login: string;
  /** "Bot" for GitHub Apps and the actions bot. */
  userType: string;
  association: string;
  title?: string;
  body: string;
  target: Target;
}

export interface Verdict {
  item: Item;
  /** Distinct finding types per field, e.g. { body: ["email"] }. */
  findings: { title: string[]; body: string[] };
  takeDown: boolean;
}

/** The maintainers' own accounts and bots: the only authors whose text is taken down. */
export function isOwnText(item: Pick<Item, "userType" | "association">): boolean {
  return item.userType === "Bot" || item.association === "OWNER" || item.association === "MEMBER";
}

type Json = Record<string, any>;

const who = (o: Json) => ({ login: String(o?.user?.login ?? ""), userType: String(o?.user?.type ?? ""), association: String(o?.author_association ?? "") });

/** The text one webhook event carries, or nothing for events the guard ignores. */
export function itemsFromEvent(event: string, p: Json): Item[] {
  switch (event) {
    case "issues":
      return [{ ...who(p.issue), url: p.issue.html_url, title: p.issue.title ?? "", body: p.issue.body ?? "", target: { type: "issue", number: p.issue.number } }];
    case "issue_comment":
      return [{ ...who(p.comment), url: p.comment.html_url, body: p.comment.body ?? "", target: { type: "issue-comment", id: p.comment.id } }];
    case "pull_request":
    case "pull_request_target":
      return [{ ...who(p.pull_request), url: p.pull_request.html_url, title: p.pull_request.title ?? "", body: p.pull_request.body ?? "", target: { type: "pull", number: p.pull_request.number } }];
    case "pull_request_review_comment":
      return [{ ...who(p.comment), url: p.comment.html_url, body: p.comment.body ?? "", target: { type: "review-comment", id: p.comment.id } }];
    case "pull_request_review":
      // A review without a summary (only inline comments) has a null body: nothing to scan.
      if (!p.review.body) return [];
      return [{ ...who(p.review), url: p.review.html_url, body: p.review.body, target: { type: "review", number: p.pull_request.number, id: p.review.id } }];
    case "discussion":
      return [{ ...who(p.discussion), url: p.discussion.html_url, title: p.discussion.title ?? "", body: p.discussion.body ?? "", target: { type: "discussion", nodeId: p.discussion.node_id } }];
    case "discussion_comment":
      return [{ ...who(p.comment), url: p.comment.html_url, body: p.comment.body ?? "", target: { type: "discussion-comment", nodeId: p.comment.node_id } }];
    default:
      return [];
  }
}

const kinds = (text: string, rules: Rules) => [...new Set(scanText(text, "", rules).map((f) => f.rule))].sort();

export function judge(item: Item, rules: Rules): Verdict {
  const findings = { title: item.title ? kinds(item.title, rules) : [], body: kinds(item.body, rules) };
  const found = findings.title.length + findings.body.length > 0;
  return { item, findings, takeDown: found && isOwnText(item) };
}

/** One line per verdict with findings, safe for a public log: types and URL, never text. */
export function report(v: Verdict): string {
  const parts = (["title", "body"] as const).filter((f) => v.findings[f].length).map((f) => `${f}: ${v.findings[f].join(", ")}`);
  return `${v.item.url}  ${parts.join("; ")}  (${v.takeDown ? "taken down" : "left as is, external author"})`;
}

// ---- GitHub API -------------------------------------------------------------------------

export type Api = (method: string, path: string, body?: unknown) => Promise<Json>;

export function githubApi(token: string, fetchImpl: typeof fetch = fetch): Api {
  return async (method, path, body) => {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Only the status goes to the log: an error body could echo the text back.
    if (!res.ok) throw new Error(`${method} ${path.replace(/\/\d+(?=\/|$)/g, "/:id")}: HTTP ${res.status}`);
    return res.status === 204 ? {} : ((await res.json()) as Json);
  };
}

const graphql = (api: Api, query: string, variables: Json) => api("POST", "/graphql", { query, variables }).then((r) => {
  if (r.errors?.length) throw new Error(`graphql: ${r.errors.length} error(s)`);
  return r;
});

/** Deletes a comment, or replaces a body (and a title with findings) with the redaction note. */
export async function takeDown(v: Verdict, repo: string, api: Api): Promise<string> {
  const t = v.item.target;
  const title = v.findings.title.length ? { title: "[redacted by the safety guard]" } : {};
  switch (t.type) {
    case "issue-comment":
      await api("DELETE", `/repos/${repo}/issues/comments/${t.id}`);
      return "comment deleted";
    case "review-comment":
      await api("DELETE", `/repos/${repo}/pulls/comments/${t.id}`);
      return "review comment deleted";
    case "issue":
      await api("PATCH", `/repos/${repo}/issues/${t.number}`, { body: REDACTED, ...title });
      return "issue body replaced";
    case "pull":
      await api("PATCH", `/repos/${repo}/pulls/${t.number}`, { body: REDACTED, ...title });
      return "pull request body replaced";
    case "review":
      // A submitted review can't be deleted, only its summary rewritten.
      await api("PUT", `/repos/${repo}/pulls/${t.number}/reviews/${t.id}`, { body: REDACTED });
      return "review summary replaced";
    case "discussion-comment":
      await graphql(api, "mutation($id: ID!) { deleteDiscussionComment(input: {id: $id}) { clientMutationId } }", { id: t.nodeId });
      return "discussion comment deleted";
    case "discussion":
      await graphql(api, "mutation($id: ID!, $body: String!, $title: String) { updateDiscussion(input: {discussionId: $id, body: $body, title: $title}) { clientMutationId } }", { id: t.nodeId, body: REDACTED, ...title });
      return "discussion body replaced";
  }
}

// ---- Fork events ------------------------------------------------------------------------
// A pull request event from a fork runs without secrets and with a read-only token, so it
// can't see the private words or take anything down. It only records which item to look at;
// a workflow_run job on the default branch reads that record, fetches the item itself from
// the API (the record is untrusted, so only validated ids are used) and judges it.

export type Ref = { kind: "pull" | "review-comment"; id: number } | { kind: "review"; number: number; id: number };

export function refFromEvent(event: string, p: Json): Ref | undefined {
  if (event === "pull_request") return { kind: "pull", id: p.pull_request.number };
  if (event === "pull_request_review_comment") return { kind: "review-comment", id: p.comment.id };
  if (event === "pull_request_review") return p.review.body ? { kind: "review", number: p.pull_request.number, id: p.review.id } : undefined;
  return undefined;
}

const posInt = (n: unknown): number => {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n <= 0) throw new Error("ref: bad id");
  return n;
};

export function parseRef(raw: string): Ref {
  const r = JSON.parse(raw) as Json;
  if (r.kind === "pull" || r.kind === "review-comment") return { kind: r.kind, id: posInt(r.id) };
  if (r.kind === "review") return { kind: "review", number: posInt(r.number), id: posInt(r.id) };
  throw new Error("ref: unknown kind");
}

export async function fetchItem(ref: Ref, repo: string, api: Api): Promise<Item[]> {
  switch (ref.kind) {
    case "pull":
      return itemsFromEvent("pull_request", { pull_request: await api("GET", `/repos/${repo}/pulls/${ref.id}`) });
    case "review-comment":
      return itemsFromEvent("pull_request_review_comment", { comment: await api("GET", `/repos/${repo}/pulls/comments/${ref.id}`) });
    case "review":
      return itemsFromEvent("pull_request_review", { pull_request: { number: ref.number }, review: await api("GET", `/repos/${repo}/pulls/${ref.number}/reviews/${ref.id}`) });
  }
}

// ---- CLI --------------------------------------------------------------------------------

const SUMMARY_NOTE = `
**What to do now**

- GitHub keeps every earlier revision of an edited body or comment. Open the item, use the
  *edited* menu and delete each revision that holds the text.
- People watching the repo were already e-mailed the original text. Rotate any secret that was
  in it.
- Text by external authors was left as is. Ask the author to edit it, or edit or hide it
  yourself if it really leaks something.
`;

export async function run(argv: string[], env: Record<string, string | undefined>, api?: Api): Promise<number> {
  const arg = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const repo = env.GITHUB_REPOSITORY ?? "";
  const apply = argv.includes("--apply");
  const event = arg("--event");
  const payloadPath = arg("--payload");
  const refPath = arg("--ref");

  const writeRef = arg("--write-ref");
  if (writeRef) {
    const ref = refFromEvent(event ?? "", JSON.parse(readFileSync(payloadPath!, "utf8")));
    if (ref) writeFileSync(writeRef, JSON.stringify(ref));
    console.log(ref ? "text-guard: fork event recorded for the follow-up check" : "text-guard: nothing to record");
    return 0;
  }

  const client = api ?? (env.GITHUB_TOKEN ? githubApi(env.GITHUB_TOKEN) : undefined);
  let items: Item[];
  if (refPath) {
    if (!client) throw new Error("GITHUB_TOKEN is required with --ref");
    items = await fetchItem(parseRef(readFileSync(refPath, "utf8")), repo, client);
  } else {
    items = itemsFromEvent(event ?? "", JSON.parse(readFileSync(payloadPath!, "utf8")));
  }

  const root = join(dirname(import.meta.path), "..");
  const rules = loadRules(root, env);
  const verdicts = items.map((i) => judge(i, rules)).filter((v) => v.findings.title.length + v.findings.body.length);
  if (!verdicts.length) {
    console.log(`text-guard: clean (${items.length} item(s))`);
    return 0;
  }

  const lines: string[] = [];
  for (const v of verdicts) {
    let line = report(v);
    if (v.takeDown && apply) {
      if (!client) throw new Error("GITHUB_TOKEN is required with --apply");
      try {
        line += `, ${await takeDown(v, repo, client)}`;
      } catch (e) {
        line += `, TAKE-DOWN FAILED: ${(e as Error).message}`;
      }
    } else if (v.takeDown) {
      line += ", dry run: nothing changed";
    }
    lines.push(line);
    console.error(line);
  }
  if (env.GITHUB_STEP_SUMMARY) {
    appendFileSync(env.GITHUB_STEP_SUMMARY, `## Safety guard: private or secret text on GitHub\n\n${lines.map((l) => `- ${l}`).join("\n")}\n${SUMMARY_NOTE}`);
  }
  console.error(`\ntext-guard: ${verdicts.length} item(s) with findings. Only finding types are logged.`);
  return 1;
}

if (import.meta.main) {
  process.exit(await run(process.argv.slice(2), process.env));
}
