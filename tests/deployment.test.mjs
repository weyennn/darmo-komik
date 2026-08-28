import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import worker, { parseSingleByteRange } from "../worker/index.js";
import { buildSite, validateAudioMetadata } from "../scripts/build-site.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..");
const audioBytes = Uint8Array.from({ length: 64 }, (_, index) => index);

function createAssetEnv() {
  const requests = [];
  return {
    requests,
    env: {
      ASSETS: {
        async fetch(request) {
          requests.push(request);
          const path = new URL(request.url).pathname;
          if (path === "/assets/audio/id/story.mp3") {
            return new Response(request.method === "HEAD" ? null : audioBytes, {
              status: 200,
              headers: {
                "Content-Type": "audio/mpeg",
                "Content-Length": String(audioBytes.byteLength),
                ETag: '"audio-etag"',
                "Last-Modified": "Mon, 24 Aug 2026 00:00:00 GMT",
                "Cache-Control": "public, max-age=3600",
              },
            });
          }
          return new Response("ordinary asset", { status: 200 });
        },
      },
    },
  };
}

async function responseBytes(response) {
  return [...new Uint8Array(await response.arrayBuffer())];
}

async function listFiles(root, current = root) {
  const result = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = join(current, entry.name);
    if (entry.isDirectory()) {
      result.push(...(await listFiles(root, absolute)));
    } else {
      result.push(relative(root, absolute).split("\\").join("/"));
    }
  }
  return result.sort();
}

test("parseSingleByteRange supports bounded, open-ended, and suffix ranges", () => {
  assert.deepEqual(parseSingleByteRange("bytes=0-9", 64), { start: 0, end: 9 });
  assert.deepEqual(parseSingleByteRange("bytes=60-", 64), { start: 60, end: 63 });
  assert.deepEqual(parseSingleByteRange("bytes=-4", 64), { start: 60, end: 63 });
});

test("parseSingleByteRange rejects malformed, multiple, and unsatisfiable ranges", () => {
  for (const value of ["items=0-1", "bytes=0-1,4-5", "bytes=64-70", "bytes=8-2", "bytes=-0"]) {
    assert.equal(parseSingleByteRange(value, 64), null, value);
  }
});

test("audio range request returns exact 206 payload and strips Range from asset binding request", async () => {
  const { env, requests } = createAssetEnv();
  const response = await worker.fetch(
    new Request("https://example.test/assets/audio/id/story.mp3", {
      headers: {
        Range: "bytes=4-11",
        "If-Range": '"audio-etag"',
      },
    }),
    env,
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get("Content-Range"), "bytes 4-11/64");
  assert.equal(response.headers.get("Content-Length"), "8");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
  assert.deepEqual(await responseBytes(response), [4, 5, 6, 7, 8, 9, 10, 11]);
  assert.equal(requests.length, 1);
  for (const name of ["Range", "If-Range", "If-None-Match", "If-Modified-Since"]) {
    assert.equal(requests[0].headers.has(name), false, name);
  }
});

test("stale If-Range returns the full representation instead of partial content", async () => {
  const { env } = createAssetEnv();
  const response = await worker.fetch(
    new Request("https://example.test/assets/audio/id/story.mp3", {
      headers: { Range: "bytes=4-11", "If-Range": '"stale-range-etag"' },
    }),
    env,
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Range"), null);
  assert.equal(response.headers.get("Content-Length"), "64");
  assert.deepEqual(await responseBytes(response), [...audioBytes]);
});

test("matching cache validators return 304 before processing Range", async () => {
  for (const headers of [
    { Range: "bytes=4-11", "If-None-Match": 'W/"audio-etag"' },
    { Range: "bytes=4-11", "If-Modified-Since": "Tue, 25 Aug 2026 00:00:00 GMT" },
  ]) {
    const { env } = createAssetEnv();
    const response = await worker.fetch(
      new Request("https://example.test/assets/audio/id/story.mp3", { headers }),
      env,
    );
    assert.equal(response.status, 304);
    assert.equal(response.headers.get("Content-Range"), null);
    assert.equal((await response.arrayBuffer()).byteLength, 0);
  }
});

test("audio suffix range and HEAD range use correct partial headers", async () => {
  const suffix = createAssetEnv();
  const suffixResponse = await worker.fetch(
    new Request("https://example.test/assets/audio/id/story.mp3", {
      headers: { Range: "bytes=-3" },
    }),
    suffix.env,
  );
  assert.equal(suffixResponse.status, 206);
  assert.equal(suffixResponse.headers.get("Content-Range"), "bytes 61-63/64");
  assert.deepEqual(await responseBytes(suffixResponse), [61, 62, 63]);

  const head = createAssetEnv();
  const headResponse = await worker.fetch(
    new Request("https://example.test/assets/audio/id/story.mp3", {
      method: "HEAD",
      headers: { Range: "bytes=0-7" },
    }),
    head.env,
  );
  assert.equal(headResponse.status, 206);
  assert.equal(headResponse.headers.get("Content-Range"), "bytes 0-7/64");
  assert.equal(headResponse.headers.get("Content-Length"), "8");
  assert.equal((await headResponse.arrayBuffer()).byteLength, 0);
});

test("invalid audio range returns 416 with total length", async () => {
  const { env } = createAssetEnv();
  const response = await worker.fetch(
    new Request("https://example.test/assets/audio/id/story.mp3", {
      headers: { Range: "bytes=999-1000" },
    }),
    env,
  );

  assert.equal(response.status, 416);
  assert.equal(response.headers.get("Content-Range"), "bytes */64");
  assert.equal(response.headers.get("Accept-Ranges"), "bytes");
});

test("ordinary audio and non-audio requests remain usable", async () => {
  const plain = createAssetEnv();
  const audioResponse = await worker.fetch(
    new Request("https://example.test/assets/audio/id/story.mp3"),
    plain.env,
  );
  assert.equal(audioResponse.status, 200);
  assert.equal(audioResponse.headers.get("Accept-Ranges"), "bytes");
  assert.deepEqual(await responseBytes(audioResponse), [...audioBytes]);

  const ordinary = createAssetEnv();
  const assetResponse = await worker.fetch(new Request("https://example.test/style.css"), ordinary.env);
  assert.equal(await assetResponse.text(), "ordinary asset");
});

test("audio metadata exactly matches the deploy audio files", async () => {
  const metadata = await validateAudioMetadata(projectRoot);
  assert.deepEqual(metadata, {
    "/assets/audio/en/story.mp3": 4035702,
    "/assets/audio/id/story.mp3": 4035702,
    "/assets/audio/jv/story.mp3": 5245694,
  });
});

test("build rejects symlinked top-level runtime directories", async () => {
  for (const symlinkedName of ["src", "assets"]) {
    const temporaryRoot = await mkdtemp(join(tmpdir(), `darmo-symlink-${symlinkedName}-`));
    const source = join(temporaryRoot, "source");
    const output = join(temporaryRoot, "output");
    try {
      await mkdir(source);
      await writeFile(join(source, "index.html"), "fixture");
      await writeFile(join(source, "style.css"), "fixture");
      const ordinaryName = symlinkedName === "src" ? "assets" : "src";
      await mkdir(join(source, ordinaryName));
      await symlink(join(projectRoot, symlinkedName), join(source, symlinkedName), "dir");
      await assert.rejects(
        () => buildSite({ sourceRoot: source, outputDir: output }),
        /Runtime directory must be a real directory/,
      );
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }
});

test("build output contains only the runtime allowlist and excludes deployment metadata", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "darmo-build-test-"));
  const output = join(temporaryRoot, "_site");
  try {
    const summary = await buildSite({ sourceRoot: projectRoot, outputDir: output });
    const files = await listFiles(output);
    const expected = [
      "index.html",
      "style.css",
      ...(await listFiles(join(projectRoot, "src"))).map((path) => `src/${path}`),
      ...(await listFiles(join(projectRoot, "assets"))).map((path) => `assets/${path}`),
    ].sort();

    assert.deepEqual(files, expected);
    assert.equal(summary.fileCount, 53);
    for (const forbidden of [".git/HEAD", ".git/config", ".gitignore", "wrangler.jsonc", "package.json", "tests/deployment.test.mjs", "worker/index.js"]) {
      assert.equal(files.includes(forbidden), false, forbidden);
    }
    assert.match(await readFile(join(output, "index.html"), "utf8"), /Darmo dan Mantra Ketulusan/);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
