import { copyFile, lstat, mkdir, readdir, rm } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { AUDIO_LENGTHS } from "../worker/audio-metadata.js";

const ROOT_FILES = ["index.html", "style.css"];
const ROOT_DIRECTORIES = ["src", "assets"];

async function requireRuntimeDirectory(sourceRoot, source) {
  const metadata = await lstat(source);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error(`Runtime directory must be a real directory: ${relative(sourceRoot, source)}`);
  }
}

async function copyDirectory(sourceRoot, source, outputRoot, output, summary) {
  await requireRuntimeDirectory(sourceRoot, source);
  await mkdir(output, { recursive: true });

  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) {
      throw new Error(`Hidden runtime entry is not allowed: ${relative(sourceRoot, join(source, entry.name))}`);
    }

    const sourcePath = join(source, entry.name);
    const outputPath = join(output, entry.name);
    const metadata = await lstat(sourcePath);

    if (metadata.isSymbolicLink()) {
      throw new Error(`Runtime symlink is not allowed: ${relative(sourceRoot, sourcePath)}`);
    }
    if (metadata.isDirectory()) {
      await copyDirectory(sourceRoot, sourcePath, outputRoot, outputPath, summary);
      continue;
    }
    if (!metadata.isFile()) {
      throw new Error(`Unsupported runtime entry: ${relative(sourceRoot, sourcePath)}`);
    }

    await copyFile(sourcePath, outputPath);
    summary.fileCount += 1;
    summary.totalBytes += metadata.size;
    summary.files.push(relative(outputRoot, outputPath).split("\\").join("/"));
  }
}

async function copyRootFile(sourceRoot, outputRoot, name, summary) {
  const source = join(sourceRoot, name);
  const metadata = await lstat(source);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Runtime root entry must be a regular file: ${name}`);
  }
  await copyFile(source, join(outputRoot, name));
  summary.fileCount += 1;
  summary.totalBytes += metadata.size;
  summary.files.push(name);
}

export async function validateAudioMetadata(sourceRoot) {
  const actual = {};
  for (const [pathname, expectedSize] of Object.entries(AUDIO_LENGTHS)) {
    const source = join(sourceRoot, pathname.slice(1));
    const metadata = await lstat(source);
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Audio metadata target must be a regular file: ${pathname}`);
    }
    if (metadata.size !== expectedSize) {
      throw new Error(`Audio metadata mismatch for ${pathname}: expected ${expectedSize}, found ${metadata.size}`);
    }
    if (metadata.size > 10 * 1024 * 1024) {
      throw new Error(`Audio exceeds the reviewed Worker buffer limit: ${pathname}`);
    }
    actual[pathname] = metadata.size;
  }
  return Object.fromEntries(Object.entries(actual).sort(([left], [right]) => left.localeCompare(right)));
}

export async function buildSite({ sourceRoot, outputDir }) {
  const source = resolve(sourceRoot);
  const output = resolve(outputDir);
  if (source === output) {
    throw new Error("Build output must not be the source root");
  }

  for (const name of ROOT_FILES) {
    const metadata = await lstat(join(source, name));
    if (!metadata.isFile() || metadata.isSymbolicLink()) {
      throw new Error(`Runtime root entry must be a regular file: ${name}`);
    }
  }
  for (const name of ROOT_DIRECTORIES) {
    await requireRuntimeDirectory(source, join(source, name));
  }
  await validateAudioMetadata(source);
  await rm(output, { recursive: true, force: true });
  await mkdir(output, { recursive: true });

  const summary = { fileCount: 0, totalBytes: 0, files: [] };
  for (const name of ROOT_FILES) {
    await copyRootFile(source, output, name, summary);
  }
  for (const name of ROOT_DIRECTORIES) {
    await copyDirectory(source, join(source, name), output, join(output, name), summary);
  }
  summary.files.sort();
  return summary;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  const sourceRoot = resolve(dirname(currentFile), "..");
  const outputDir = join(sourceRoot, "_site");
  const summary = await buildSite({ sourceRoot, outputDir });
  console.log(`Built ${summary.fileCount} runtime files (${summary.totalBytes} bytes) in ${outputDir}`);
}
