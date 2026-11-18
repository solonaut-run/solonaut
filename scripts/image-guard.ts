#!/usr/bin/env bun
// Image guard. A screenshot can leak what the text checks never see: a home path in a
// terminal, an e-mail in a window title, a private name in a sidebar. This reads the text in
// images with tesseract OCR and runs the safety guard's text scanner over it.
//
// PNG, JPEG, GIF (every frame, through ImageMagick when it is installed) and WebP files are
// read, and so are images inlined in SVGs as data: URIs. The SVG markup itself is text, so the
// main safety guard already scans it.
//
// Usage:
//   bun scripts/image-guard.ts --changed BASE HEAD   images added or changed between two commits
//   bun scripts/image-guard.ts --history             every image blob reachable from HEAD
//   bun scripts/image-guard.ts FILE...               these files
// Findings print the path and the finding type only (CI logs are public). Exit 1 if any.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { loadRules, scanText, type Rules } from "./safety-guard";

export const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp"];
const SCANNED_EXTS = [...IMAGE_EXTS, ".svg"];

export const isScanned = (path: string) => SCANNED_EXTS.includes(extname(path).toLowerCase());

/** A file to read: where it is reported, and its bytes. */
export interface ImageBlob {
  where: string;
  ext: string;
  data: Buffer;
}

export interface ImageFinding {
  where: string;
  rules: string[];
}

/** Turns an image file into text. Injected so tests don't need tesseract. */
export type Ocr = (file: string) => string;

const MAX_GIF_FRAMES = 40;

function has(cmd: string): boolean {
  return Bun.spawnSync([process.platform === "win32" ? "where" : "which", cmd], { stdout: "pipe", stderr: "pipe" }).exitCode === 0;
}

export const tesseract: Ocr = (file) => {
  const r = Bun.spawnSync(["tesseract", file, "stdout", "--psm", "3"], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`tesseract failed on an image (exit ${r.exitCode})`);
  return r.stdout.toString();
};

/** Images inlined in an SVG as base64 data: URIs. */
export function svgDataImages(svg: string): { ext: string; data: Buffer }[] {
  const out: { ext: string; data: Buffer }[] = [];
  for (const m of svg.matchAll(/data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s]+)/gi)) {
    out.push({ ext: `.${m[1]!.toLowerCase().replace("jpeg", "jpg")}`, data: Buffer.from(m[2]!.replace(/\s+/g, ""), "base64") });
  }
  return out;
}

/** OCRs one image (each frame of a GIF when ImageMagick is there) and returns its text. */
function imageText(dir: string, ext: string, data: Buffer, ocr: Ocr, magick: string | undefined): string {
  const file = join(dir, `image${ext}`);
  writeFileSync(file, data);
  if (ext !== ".gif" || !magick) return ocr(file);
  const r = Bun.spawnSync([magick, file, "-coalesce", join(dir, "frame-%04d.png")], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) return ocr(file);
  const names = readdirSync(dir).filter((n) => n.startsWith("frame-")).sort();
  // A long animation: sample evenly, the text on screen rarely changes every frame.
  const step = Math.max(1, Math.ceil(names.length / MAX_GIF_FRAMES));
  return names.filter((_, i) => i % step === 0).map((n) => ocr(join(dir, n))).join("\n");
}

export function scanImages(blobs: ImageBlob[], rules: Rules, ocr: Ocr = tesseract): ImageFinding[] {
  const magick = has("magick") ? "magick" : has("convert") ? "convert" : undefined;
  const findings: ImageFinding[] = [];
  for (const blob of blobs) {
    const parts = blob.ext === ".svg" ? svgDataImages(blob.data.toString("latin1")) : [{ ext: blob.ext, data: blob.data }];
    const kinds = new Set<string>();
    for (const part of parts) {
      const dir = mkdtempSync(join(tmpdir(), "image-guard-"));
      try {
        for (const f of scanText(imageText(dir, part.ext, part.data, ocr, magick), blob.where, rules)) kinds.add(f.rule);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
    if (kinds.size) findings.push({ where: blob.where, rules: [...kinds].sort() });
  }
  return findings;
}

function git(root: string, args: string[], input?: string): Buffer {
  const r = Bun.spawnSync(["git", "-C", root, ...args], { stdin: input ? Buffer.from(input) : undefined, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args[0]}: ${r.stderr.toString().trim()}`);
  return r.stdout;
}

/** Reads blobs by sha with one git process. */
function readBlobs(root: string, entries: { sha: string; path: string }[]): ImageBlob[] {
  if (!entries.length) return [];
  const batch = git(root, ["cat-file", "--batch"], `${entries.map((e) => e.sha).join("\n")}\n`);
  const out: ImageBlob[] = [];
  let off = 0;
  for (const e of entries) {
    const nl = batch.indexOf(10, off);
    const [, type, size] = batch.subarray(off, nl).toString().split(" ");
    const len = Number(size);
    if (type === "blob") out.push({ where: e.path, ext: extname(e.path).toLowerCase(), data: batch.subarray(nl + 1, nl + 1 + len) });
    off = nl + 1 + (type === "missing" ? 0 : len + 1);
  }
  return out;
}

/** Images added, changed or renamed between two commits, read from HEAD's side. */
export function changedImages(root: string, base: string, head: string): ImageBlob[] {
  const names = git(root, ["diff", "--name-only", "-z", "--no-renames", "--diff-filter=AM", base, head]).toString().split("\0").filter(isScanned);
  const entries = names.map((path) => ({ path, sha: git(root, ["rev-parse", `${head}:${path}`]).toString().trim() }));
  return readBlobs(root, entries);
}

/** Every image blob reachable from HEAD, once per content. */
export function historyImages(root: string): ImageBlob[] {
  const seen = new Map<string, string>();
  for (const line of git(root, ["rev-list", "--objects", "HEAD"]).toString().split("\n")) {
    const sp = line.indexOf(" ");
    if (sp < 0) continue;
    const sha = line.slice(0, sp);
    const path = line.slice(sp + 1);
    if (isScanned(path) && !seen.has(sha)) seen.set(sha, path);
  }
  return readBlobs(root, [...seen].map(([sha, path]) => ({ sha, path: `${path} @${sha.slice(0, 10)}` })));
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const root = git(process.cwd(), ["rev-parse", "--show-toplevel"]).toString().trim();
  let blobs: ImageBlob[];
  if (argv[0] === "--changed") blobs = changedImages(root, argv[1]!, argv[2]!);
  else if (argv[0] === "--history") blobs = historyImages(root);
  else blobs = argv.filter((f) => isScanned(f) && existsSync(f)).map((f) => ({ where: f, ext: extname(f).toLowerCase(), data: readFileSync(f) }));

  if (!blobs.length) {
    console.log("image-guard: no images to read");
    process.exit(0);
  }
  if (!has("tesseract")) {
    console.error("image-guard: tesseract is not installed (apt-get install tesseract-ocr, brew install tesseract)");
    process.exit(2);
  }
  const findings = scanImages(blobs, loadRules(root));
  for (const f of findings) console.error(`${f.where}  ${f.rules.join(", ")}`);
  if (findings.length) {
    console.error(`\nimage-guard: ${findings.length} image(s) with findings. Replace them with a capture of the dev window or a fixture with sample data.`);
    process.exit(1);
  }
  console.log(`image-guard: clean (${blobs.length} image(s))`);
}
