import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Rules } from "./safety-guard";
import { REDACTED, isOwnText, itemsFromEvent, judge, parseRef, refFromEvent, report, run, takeDown, type Api, type Item } from "./text-guard";

// Samples are assembled at run time, so this file never trips the guard itself.
const j = (...p: string[]) => p.join("");
const email = j("someone", "@", "personal-domain.io");
const home = j("/Us", "ers/", "somebody/project");

const rules: Rules = {
  words: [],
  hashedWords: [createHash("sha256").update("hushword").digest("hex")],
  allowEmails: ["noreply@*"],
  allowHomeNames: [],
  allowIps: [],
  skip: [],
};

const user = (type = "User") => ({ login: "someone", type });
const item = (over: Partial<Item> = {}): Item => ({
  url: "https://github.com/o/r/issues/1#issuecomment-9",
  login: "someone",
  userType: "User",
  association: "OWNER",
  body: "fine text",
  target: { type: "issue-comment", id: 9 },
  ...over,
});

/** Records API calls instead of sending them. */
function recorder(): { api: Api; calls: [string, string, unknown][] } {
  const calls: [string, string, unknown][] = [];
  return { calls, api: async (m, p, b) => (calls.push([m, p, b]), {}) };
}

describe("own text", () => {
  test("the maintainers and bots are own text, everyone else is external", () => {
    expect(isOwnText({ userType: "User", association: "OWNER" })).toBe(true);
    expect(isOwnText({ userType: "User", association: "MEMBER" })).toBe(true);
    expect(isOwnText({ userType: "Bot", association: "NONE" })).toBe(true);
    for (const a of ["COLLABORATOR", "CONTRIBUTOR", "FIRST_TIME_CONTRIBUTOR", "NONE"]) {
      expect(isOwnText({ userType: "User", association: a })).toBe(false);
    }
  });
});

describe("events", () => {
  test("each event yields its text and where to take it down", () => {
    const issue = { number: 3, title: "t", body: "b", html_url: "u", user: user(), author_association: "OWNER" };
    expect(itemsFromEvent("issues", { issue })[0]).toMatchObject({ title: "t", body: "b", target: { type: "issue", number: 3 } });
    const comment = { id: 7, node_id: "DC_x", body: "c", html_url: "u", user: user("Bot"), author_association: "NONE" };
    expect(itemsFromEvent("issue_comment", { comment })[0]).toMatchObject({ body: "c", userType: "Bot", target: { type: "issue-comment", id: 7 } });
    expect(itemsFromEvent("pull_request_review_comment", { comment })[0]!.target).toEqual({ type: "review-comment", id: 7 });
    expect(itemsFromEvent("discussion_comment", { comment })[0]!.target).toEqual({ type: "discussion-comment", nodeId: "DC_x" });
    expect(itemsFromEvent("pull_request", { pull_request: { ...issue, number: 4 } })[0]!.target).toEqual({ type: "pull", number: 4 });
    expect(itemsFromEvent("discussion", { discussion: { ...issue, node_id: "D_x" } })[0]!.target).toEqual({ type: "discussion", nodeId: "D_x" });
    const review = { id: 11, body: "r", html_url: "u", user: user(), author_association: "OWNER" };
    expect(itemsFromEvent("pull_request_review", { pull_request: { number: 4 }, review })[0]!.target).toEqual({ type: "review", number: 4, id: 11 });
  });

  test("a null body is empty text, a review without a summary is skipped", () => {
    expect(itemsFromEvent("issue_comment", { comment: { id: 1, body: null, user: user() } })[0]!.body).toBe("");
    expect(itemsFromEvent("pull_request_review", { pull_request: { number: 1 }, review: { id: 1, body: null, user: user() } })).toEqual([]);
    expect(itemsFromEvent("push", {})).toEqual([]);
  });
});

describe("judge", () => {
  test("clean text has no findings", () => {
    expect(judge(item(), rules)).toMatchObject({ findings: { title: [], body: [] }, takeDown: false });
  });

  test("own text with findings is taken down, external text is not", () => {
    const body = `see ${email} and ${home}`;
    expect(judge(item({ body }), rules)).toMatchObject({ findings: { body: ["email", "home-path"] }, takeDown: true });
    expect(judge(item({ body, association: "NONE" }), rules).takeDown).toBe(false);
  });

  test("private words count in titles and bodies", () => {
    const v = judge(item({ title: "about HushWord", body: "ok" }), rules);
    expect(v.findings).toEqual({ title: ["denied-word"], body: [] });
  });

  test("the report names the types and the URL, never the text", () => {
    const line = report(judge(item({ title: "the hushword", body: `${email} ${home}` }), rules));
    expect(line).toContain("https://github.com/o/r/issues/1#issuecomment-9");
    expect(line).toContain("denied-word");
    for (const leak of ["hushword", "someone", "somebody", "personal-domain"]) expect(line.toLowerCase()).not.toContain(leak);
  });
});

describe("take down", () => {
  const found = (target: Item["target"], title?: string) => judge(item({ target, title, body: email }), rules);

  test("comments are deleted", async () => {
    const r = recorder();
    await takeDown(found({ type: "issue-comment", id: 5 }), "o/r", r.api);
    await takeDown(found({ type: "review-comment", id: 6 }), "o/r", r.api);
    expect(r.calls).toEqual([["DELETE", "/repos/o/r/issues/comments/5", undefined], ["DELETE", "/repos/o/r/pulls/comments/6", undefined]]);
  });

  test("bodies are replaced, and a title only when it has findings", async () => {
    const r = recorder();
    await takeDown(found({ type: "issue", number: 2 }, "fine title"), "o/r", r.api);
    await takeDown(found({ type: "pull", number: 3 }, "the hushword"), "o/r", r.api);
    await takeDown(found({ type: "review", number: 3, id: 8 }), "o/r", r.api);
    expect(r.calls).toEqual([
      ["PATCH", "/repos/o/r/issues/2", { body: REDACTED }],
      ["PATCH", "/repos/o/r/pulls/3", { body: REDACTED, title: "[redacted by the safety guard]" }],
      ["PUT", "/repos/o/r/pulls/3/reviews/8", { body: REDACTED }],
    ]);
  });

  test("discussions go through GraphQL", async () => {
    const r = recorder();
    await takeDown(found({ type: "discussion-comment", nodeId: "DC_1" }), "o/r", r.api);
    await takeDown(found({ type: "discussion", nodeId: "D_1" }), "o/r", r.api);
    expect(r.calls.map((c) => [c[0], c[1], (c[2] as any).variables])).toEqual([
      ["POST", "/graphql", { id: "DC_1" }],
      ["POST", "/graphql", { id: "D_1", body: REDACTED }],
    ]);
  });
});

describe("fork refs", () => {
  test("only ids are recorded and read back", () => {
    expect(refFromEvent("pull_request", { pull_request: { number: 4, body: "x" } })).toEqual({ kind: "pull", id: 4 });
    expect(refFromEvent("pull_request_review", { pull_request: { number: 4 }, review: { id: 2, body: "x" } })).toEqual({ kind: "review", number: 4, id: 2 });
    expect(refFromEvent("pull_request_review", { pull_request: { number: 4 }, review: { id: 2, body: null } })).toBeUndefined();
    expect(parseRef('{"kind":"review-comment","id":5}')).toEqual({ kind: "review-comment", id: 5 });
  });

  test("an untrusted record with anything but positive integer ids is refused", () => {
    expect(() => parseRef('{"kind":"pull","id":"1/../../x"}')).toThrow();
    expect(() => parseRef('{"kind":"pull","id":-1}')).toThrow();
    expect(() => parseRef('{"kind":"delete-everything","id":1}')).toThrow();
  });
});

describe("cli", () => {
  const dir = mkdtempSync(join(tmpdir(), "text-guard-"));
  const payload = (body: string, association: string) => {
    const p = join(dir, `${association}.json`);
    writeFileSync(p, JSON.stringify({ comment: { id: 9, body, html_url: "https://github.com/o/r/issues/1#c", user: user(), author_association: association } }));
    return p;
  };
  const env = { GITHUB_REPOSITORY: "o/r", SAFETY_GUARD_WORDS: "hushword", GITHUB_STEP_SUMMARY: join(dir, "summary.md") };

  test("clean text passes and calls nothing", async () => {
    const r = recorder();
    expect(await run(["--event", "issue_comment", "--payload", payload("all good", "OWNER"), "--apply"], env, r.api)).toBe(0);
    expect(r.calls).toEqual([]);
  });

  test("own text with a private word fails, is deleted, and the summary says how to purge history", async () => {
    const r = recorder();
    expect(await run(["--event", "issue_comment", "--payload", payload("the HUSHWORD here", "OWNER"), "--apply"], env, r.api)).toBe(1);
    expect(r.calls).toEqual([["DELETE", "/repos/o/r/issues/comments/9", undefined]]);
    const summary = readFileSync(env.GITHUB_STEP_SUMMARY, "utf8");
    expect(summary).toContain("revision");
    expect(summary.toLowerCase()).not.toContain("hushword");
  });

  test("external text fails but is never changed", async () => {
    const r = recorder();
    expect(await run(["--event", "issue_comment", "--payload", payload("the hushword", "NONE"), "--apply"], env, r.api)).toBe(1);
    expect(r.calls).toEqual([]);
  });

  test("without --apply nothing is changed", async () => {
    const r = recorder();
    expect(await run(["--event", "issue_comment", "--payload", payload("the hushword", "MEMBER")], env, r.api)).toBe(1);
    expect(r.calls).toEqual([]);
  });

  test("a fork's event is recorded as ids, then fetched and judged", async () => {
    const pr = join(dir, "pr.json");
    writeFileSync(pr, JSON.stringify({ pull_request: { number: 12, title: "x", body: "the hushword" } }));
    const ref = join(dir, "ref.json");
    expect(await run(["--event", "pull_request", "--payload", pr, "--write-ref", ref], env)).toBe(0);
    expect(JSON.parse(readFileSync(ref, "utf8"))).toEqual({ kind: "pull", id: 12 });

    const calls: [string, string, unknown][] = [];
    const api: Api = async (m, p, b) => {
      calls.push([m, p, b]);
      return m === "GET" ? { number: 12, title: "x", body: "the hushword", html_url: "u", user: user(), author_association: "OWNER" } : {};
    };
    expect(await run(["--ref", ref, "--apply"], env, api)).toBe(1);
    expect(calls).toEqual([["GET", "/repos/o/r/pulls/12", undefined], ["PATCH", "/repos/o/r/pulls/12", { body: REDACTED }]]);
  });
});
