import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { changedImages, historyImages, isScanned, scanImages, svgDataImages, type Ocr } from "./image-guard";
import { scanText, type Rules } from "./safety-guard";

// Samples are assembled at run time, so this file never trips the guard itself.
const j = (...p: string[]) => p.join("");

const rules: Rules = {
  words: [],
  hashedWords: [createHash("sha256").update("hushword").digest("hex")],
  allowEmails: [],
  allowHomeNames: [],
  allowIps: [],
  skip: [],
};

/** Fake OCR: the "image" bytes are the text it shows. */
const fakeOcr: Ocr = (file) => require("node:fs").readFileSync(file, "utf8");

function repo(): string {
  const dir = mkdtempSync(join(tmpdir(), "image-guard-"));
  const git = (...a: string[]) => Bun.spawnSync(["git", "-C", dir, ...a], { stdout: "pipe", stderr: "pipe" });
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  git("config", "commit.gpgsign", "false");
  return dir;
}
const commit = (dir: string, files: Record<string, string>) => {
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(join(dir, p, ".."), { recursive: true });
    writeFileSync(join(dir, p), c);
  }
  Bun.spawnSync(["git", "-C", dir, "add", "-A"]);
  Bun.spawnSync(["git", "-C", dir, "commit", "-qm", "c"]);
  return Bun.spawnSync(["git", "-C", dir, "rev-parse", "HEAD"], { stdout: "pipe" }).stdout.toString().trim();
};

test("which files are read", () => {
  for (const f of ["a.png", "b.JPG", "c.jpeg", "d.gif", "e.webp", "f.svg"]) expect(isScanned(f)).toBe(true);
  for (const f of ["a.ts", "b.md", "png", "c.png.txt"]) expect(isScanned(f)).toBe(false);
});

describe("scanImages", () => {
  test("text read from an image is scanned; findings carry the path and types only", () => {
    const blobs = [
      { where: "docs/shot.png", ext: ".png", data: Buffer.from(`open ${j("/Us", "ers/", "somebody")} and the HushWord`) },
      { where: "docs/clean.png", ext: ".png", data: Buffer.from("Inbox Sessions Missions") },
    ];
    expect(scanImages(blobs, rules, fakeOcr)).toEqual([{ where: "docs/shot.png", rules: ["denied-word", "home-path"] }]);
  });

  test("images inlined in an SVG are read too", () => {
    const inner = Buffer.from("mail me at x hushword").toString("base64");
    const svg = `<svg><image href="data:image/png;base64,${inner}"/></svg>`;
    expect(svgDataImages(svg)).toHaveLength(1);
    expect(scanImages([{ where: "logo.svg", ext: ".svg", data: Buffer.from(svg) }], rules, fakeOcr)).toEqual([{ where: "logo.svg", rules: ["denied-word"] }]);
    expect(scanImages([{ where: "plain.svg", ext: ".svg", data: Buffer.from("<svg/>") }], rules, fakeOcr)).toEqual([]);
  });
});

describe("svg markup is covered by the text scanner", () => {
  test("words in a one-line SVG longer than 2000 characters are still found", () => {
    const path = `<path d="${"M1 2 L3 4 ".repeat(300)}"/>`;
    const svg = `<svg>${path}<text>hushword</text></svg>`;
    expect(svg.length).toBeGreaterThan(2000);
    expect(scanText(svg, "f.svg", rules).map((f) => f.rule)).toEqual(["denied-word"]);
  });

  test("inlined base64 data on a long line does not count as words", () => {
    const blob = "QUJD".repeat(1000);
    expect(scanText(`<svg><image href="data:image/png;base64,${blob}"/></svg>`, "f.svg", rules)).toEqual([]);
  });
});

describe("git", () => {
  test("changed images: added and modified ones from the head side, deleted and non-images ignored", () => {
    const dir = repo();
    const base = commit(dir, { "a.png": "old", "gone.png": "x", "keep.png": "same" });
    Bun.spawnSync(["git", "-C", dir, "rm", "-q", "gone.png"]);
    const head = commit(dir, { "a.png": "new", "b/c.webp": "added", "notes.md": "text" });
    const got = changedImages(dir, base, head).map((b) => [b.where, b.data.toString()]);
    expect(got.sort()).toEqual([["a.png", "new"], ["b/c.webp", "added"]]);
  });

  test("history: every image version reachable from HEAD", () => {
    const dir = repo();
    commit(dir, { "a.png": "v1" });
    commit(dir, { "a.png": "v2", "b.ts": "code" });
    expect(historyImages(dir).map((b) => b.data.toString()).sort()).toEqual(["v1", "v2"]);
  });
});

const hasTesseract = Bun.spawnSync(["which", "tesseract"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0;
const hasMagick = Bun.spawnSync(["which", "magick"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0
  || Bun.spawnSync(["which", "convert"], { stdout: "pipe", stderr: "pipe" }).exitCode === 0;

// End to end with the real OCR, where tesseract and ImageMagick exist (the image guard job).
test.skipIf(!hasTesseract || !hasMagick || process.platform === "win32")("real OCR finds a private word drawn in a PNG", () => {
  const dir = mkdtempSync(join(tmpdir(), "image-guard-ocr-"));
  const png = join(dir, "shot.png");
  const magick = Bun.spawnSync(["which", "magick"]).exitCode === 0 ? ["magick"] : ["convert"];
  const r = Bun.spawnSync([...magick, "-size", "900x120", "xc:white", "-fill", "black", "-pointsize", "48", "-annotate", "+20+80", "project hushword", png], { stdout: "pipe", stderr: "pipe" });
  expect(r.exitCode).toBe(0);
  const data = require("node:fs").readFileSync(png) as Buffer;
  expect(scanImages([{ where: "shot.png", ext: ".png", data }], rules)).toEqual([{ where: "shot.png", rules: ["denied-word"] }]);
});
