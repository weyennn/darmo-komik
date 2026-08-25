const AUDIO_PATH = /^\/assets\/audio\/(?:id|en|jv)\/story\.mp3$/;

export function parseSingleByteRange(header, size) {
  if (typeof header !== "string" || !Number.isSafeInteger(size) || size <= 0) {
    return null;
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) {
    return null;
  }

  const [, startText, endText] = match;

  if (!startText) {
    const suffixLength = Number(endText);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return null;
    }
    return {
      start: Math.max(size - suffixLength, 0),
      end: size - 1,
    };
  }

  const start = Number(startText);
  if (!Number.isSafeInteger(start) || start >= size) {
    return null;
  }

  if (!endText) {
    return { start, end: size - 1 };
  }

  const requestedEnd = Number(endText);
  if (!Number.isSafeInteger(requestedEnd) || requestedEnd < start) {
    return null;
  }

  return { start, end: Math.min(requestedEnd, size - 1) };
}

function responseInit(response, headers, status = response.status) {
  return {
    status,
    statusText: status === 206 ? "Partial Content" : response.statusText,
    headers,
  };
}

function normalizedEntityTag(value) {
  return value?.trim().replace(/^W\//, "") ?? null;
}

function requestIsNotModified(request, response) {
  const ifNoneMatch = request.headers.get("If-None-Match");
  if (ifNoneMatch) {
    if (ifNoneMatch.trim() === "*") return true;
    const currentTag = response.headers.get("ETag");
    if (!currentTag) return false;
    const normalizedCurrentTag = normalizedEntityTag(currentTag);
    return ifNoneMatch
      .split(",")
      .some((candidate) => normalizedEntityTag(candidate) === normalizedCurrentTag);
  }

  const ifModifiedSince = request.headers.get("If-Modified-Since");
  const lastModified = response.headers.get("Last-Modified");
  if (!ifModifiedSince || !lastModified) return false;
  const conditionTime = Date.parse(ifModifiedSince);
  const modifiedTime = Date.parse(lastModified);
  return Number.isFinite(conditionTime) && Number.isFinite(modifiedTime) && modifiedTime <= conditionTime;
}

function ifRangeAllowsPartial(request, response) {
  const ifRange = request.headers.get("If-Range")?.trim();
  if (!ifRange) return true;

  if (ifRange.startsWith('"') || ifRange.startsWith("W/")) {
    const currentTag = response.headers.get("ETag")?.trim();
    return !ifRange.startsWith("W/")
      && Boolean(currentTag)
      && !currentTag.startsWith("W/")
      && ifRange === currentTag;
  }

  const conditionTime = Date.parse(ifRange);
  const lastModified = Date.parse(response.headers.get("Last-Modified") ?? "");
  return Number.isFinite(conditionTime) && Number.isFinite(lastModified) && lastModified <= conditionTime;
}

async function serveAudio(request, env) {
  const rangeHeader = request.headers.get("Range");

  if (!rangeHeader) {
    const response = await env.ASSETS.fetch(request);
    if (response.status !== 200) {
      return response;
    }
    const headers = new Headers(response.headers);
    headers.set("Accept-Ranges", "bytes");
    return new Response(request.method === "HEAD" ? null : response.body, responseInit(response, headers));
  }

  const assetHeaders = new Headers(request.headers);
  for (const name of ["Range", "If-Range", "If-None-Match", "If-Modified-Since"]) {
    assetHeaders.delete(name);
  }
  assetHeaders.set("Accept-Encoding", "identity");

  const fullResponse = await env.ASSETS.fetch(
    new Request(request.url, {
      method: "GET",
      headers: assetHeaders,
    }),
  );
  if (fullResponse.status !== 200) {
    return fullResponse;
  }

  const fullBody = await fullResponse.arrayBuffer();
  const totalLength = fullBody.byteLength;
  const maxBufferedAudioBytes = 10 * 1024 * 1024;
  if (totalLength <= 0 || totalLength > maxBufferedAudioBytes) {
    return new Response("Audio size outside reviewed limit", { status: 502 });
  }

  const headers = new Headers(fullResponse.headers);
  headers.delete("Content-Encoding");
  headers.set("Accept-Ranges", "bytes");

  if (requestIsNotModified(request, fullResponse)) {
    headers.delete("Content-Length");
    headers.delete("Content-Range");
    return new Response(null, {
      status: 304,
      statusText: "Not Modified",
      headers,
    });
  }

  if (!ifRangeAllowsPartial(request, fullResponse)) {
    headers.delete("Content-Range");
    headers.set("Content-Length", String(totalLength));
    return new Response(
      request.method === "HEAD" ? null : fullBody,
      responseInit(fullResponse, headers, 200),
    );
  }

  const range = parseSingleByteRange(rangeHeader, totalLength);
  if (!range) {
    headers.set("Content-Range", `bytes */${totalLength}`);
    headers.set("Content-Length", "0");
    return new Response(null, {
      status: 416,
      statusText: "Range Not Satisfiable",
      headers,
    });
  }

  const partialBody = fullBody.slice(range.start, range.end + 1);
  headers.set("Content-Range", `bytes ${range.start}-${range.end}/${totalLength}`);
  headers.set("Content-Length", String(partialBody.byteLength));

  return new Response(
    request.method === "HEAD" ? null : partialBody,
    responseInit(fullResponse, headers, 206),
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if ((request.method === "GET" || request.method === "HEAD") && AUDIO_PATH.test(url.pathname)) {
      return serveAudio(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
