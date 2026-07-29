import { createHash, createHmac } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";

/**
 * Where rendered output goes.
 *
 * The service has always written MP4s next to itself and served them from
 * `/files`, which is fine for one box and fatal for anything else: the files
 * die with the container, a second replica cannot see the first's output, and
 * nothing bounds the directory. This is the seam that fixes it without the rest
 * of the service caring — `render()` hands a finished file to `put()` and gets
 * back a URL, whatever is behind it.
 *
 * Local stays the default, so an unconfigured deployment behaves exactly as
 * before. Point the S3 variables at any S3-compatible bucket (R2, B2, MinIO,
 * S3 itself) and output leaves the box.
 */
export interface Storage {
  /** For `/health` and logs — never branched on. */
  readonly kind: "local" | "s3";
  /** Store the file at `path` under `name`; return the URL a client can GET. */
  put(path: string, contentType: string): Promise<string>;
  /**
   * Copy an object back to `destPath`, `false` if it is not there.
   *
   * This is what makes an UPLOAD durable rather than merely backed up. The
   * media directory is a cache with a byte budget, so a token a client cached
   * last week may have been evicted — and until now that meant the render
   * simply failed and the client had to re-upload. With a bucket behind it the
   * file is fetched back on demand and eviction stops being data loss.
   */
  fetchTo(key: string, destPath: string): Promise<boolean>;
}

/** The historical behaviour: leave it where it is, serve it from `/files`. */
export function localStorage(): Storage {
  return {
    kind: "local",
    async put(path) {
      return `/files/${basename(path)}`;
    },
    // There is nowhere else to look: the disk either has it or it is gone.
    async fetchTo() {
      return false;
    },
  };
}

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** Full origin, e.g. `https://<account>.r2.cloudflarestorage.com`. Defaults
   *  to AWS's regional endpoint. */
  endpoint?: string;
  /** What clients should GET — a CDN or public bucket origin. Defaults to the
   *  endpoint, which only works if the bucket is publicly readable. */
  publicBase?: string;
  /** Key prefix, so one bucket can hold more than this service's output. */
  prefix?: string;
}

/**
 * Read S3 settings from the environment, or `null` if it is not configured.
 *
 * All-or-nothing on purpose: a half-set configuration (a bucket with no key)
 * silently falling back to local disk is how you discover in production that
 * nothing has been uploaded for a week.
 */
export function s3ConfigFromEnv(env: NodeJS.ProcessEnv = process.env): S3Config | null {
  const bucket = env.ORBIT_S3_BUCKET;
  if (!bucket) return null;
  const accessKeyId = env.ORBIT_S3_ACCESS_KEY_ID;
  const secretAccessKey = env.ORBIT_S3_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey)
    throw new Error(
      "ORBIT_S3_BUCKET is set but ORBIT_S3_ACCESS_KEY_ID / ORBIT_S3_SECRET_ACCESS_KEY are not",
    );
  return {
    bucket,
    region: env.ORBIT_S3_REGION ?? "auto",
    accessKeyId,
    secretAccessKey,
    endpoint: env.ORBIT_S3_ENDPOINT,
    publicBase: env.ORBIT_S3_PUBLIC_BASE,
    prefix: env.ORBIT_S3_PREFIX,
  };
}

const sha256 = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data).digest();

/**
 * Sign a request the way S3 wants it (SigV4), by hand.
 *
 * `@aws-sdk/client-s3` is ~2MB of dependency to issue one PUT. The algorithm is
 * fully specified and the pieces that are easy to get wrong — the canonical
 * request and the string to sign — are pinned by tests against AWS's own
 * published example, so this is checkable rather than hopeful.
 */
export function signV4(args: {
  method: string;
  host: string;
  path: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  payloadHash: string;
  headers: Record<string, string>;
  /** Already-canonical query string, for presigned URLs. */
  query?: string;
  /** ISO basic format, `20130524T000000Z`. Injected so tests are not clocks. */
  amzDate: string;
}): { canonicalRequest: string; stringToSign: string; authorization: string } {
  const date = args.amzDate.slice(0, 8);
  const scope = `${date}/${args.region}/${args.service}/aws4_request`;

  // Header names lowercased and sorted; values trimmed. Both are load-bearing:
  // the server recomputes this exact string.
  const entries = Object.entries(args.headers)
    .map(([k, v]) => [k.toLowerCase(), v.trim()] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const signedHeaders = entries.map(([k]) => k).join(";");
  const canonicalHeaders = entries.map(([k, v]) => `${k}:${v}\n`).join("");

  const canonicalRequest = [
    args.method,
    args.path,
    args.query ?? "", // empty on a plain PUT; the parameters on a presigned GET
    canonicalHeaders,
    signedHeaders,
    args.payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    args.amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");

  const signature = hmac(
    hmac(
      hmac(hmac(hmac(`AWS4${args.secretAccessKey}`, date), args.region), args.service),
      "aws4_request",
    ),
    stringToSign,
  ).toString("hex");

  return {
    canonicalRequest,
    stringToSign,
    authorization: `AWS4-HMAC-SHA256 Credential=${args.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** RFC 3986, which S3 requires — `encodeURIComponent` leaves !'()* alone. */
const uriEncode = (v: string) =>
  encodeURIComponent(v).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** sha256 of an empty body — every GET's payload hash. */
const EMPTY_SHA =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** How long a returned output url stays fetchable. Long enough to download a
 *  render on a slow connection, short enough that a leaked url goes stale. */
const GET_EXPIRY_SECONDS = 6 * 60 * 60;

export function s3Storage(cfg: S3Config, now: () => Date = () => new Date()): Storage {
  const endpoint = cfg.endpoint ?? `https://s3.${cfg.region}.amazonaws.com`;
  const host = new URL(endpoint).host;
  const prefix = cfg.prefix ? `${cfg.prefix.replace(/^\/|\/$/g, "")}/` : "";

  /** A signed request for one object, ready to hand to `fetch`. */
  const signed = (
    method: string,
    key: string,
    payloadHash: string,
    extra: Record<string, string> = {},
  ) => {
    const objectPath = `/${cfg.bucket}/${key}`;
    const amzDate = now().toISOString().replace(/[-:]|\.\d{3}/g, "");
    const headers: Record<string, string> = {
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      ...extra,
    };
    const { authorization } = signV4({
      method,
      host,
      path: objectPath,
      region: cfg.region,
      service: "s3",
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      payloadHash,
      headers,
      amzDate,
    });
    return { url: `${endpoint}${objectPath}`, headers: { ...headers, authorization } };
  };

  /**
   * A time-limited GET url anyone can follow, signature in the query string.
   *
   * The client is a browser or a phone fetching an `<video src>`; it cannot
   * attach an Authorization header to that. So the credential travels in the
   * url instead, scoped to one object and one window.
   */
  const presign = (key: string, expiresIn: number) => {
    const objectPath = `/${cfg.bucket}/${key}`;
    const amzDate = now().toISOString().replace(/[-:]|\.\d{3}/g, "");
    const scope = `${amzDate.slice(0, 8)}/${cfg.region}/s3/aws4_request`;
    // Sorted by key, as the canonical form requires — and the server rebuilds
    // this exact string, so the order is not cosmetic.
    const query = [
      `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
      `X-Amz-Credential=${uriEncode(`${cfg.accessKeyId}/${scope}`)}`,
      `X-Amz-Date=${amzDate}`,
      `X-Amz-Expires=${expiresIn}`,
      `X-Amz-SignedHeaders=host`,
    ].join("&");
    const { authorization } = signV4({
      method: "GET",
      host,
      path: objectPath,
      region: cfg.region,
      service: "s3",
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
      // A presigned request has no body to hash, and S3 wants this literal.
      payloadHash: "UNSIGNED-PAYLOAD",
      headers: { host },
      query,
      amzDate,
    });
    const signature = /Signature=([0-9a-f]+)/.exec(authorization)?.[1] ?? "";
    return `${endpoint}${objectPath}?${query}&X-Amz-Signature=${signature}`;
  };

  return {
    kind: "s3",
    async put(path, contentType) {
      const key = `${prefix}${basename(path)}`;
      const body = await readFile(path);
      const req = signed("PUT", key, sha256(body), {
        "content-type": contentType,
        "content-length": String(body.byteLength),
      });

      const res = await fetch(req.url, {
        method: "PUT",
        headers: req.headers,
        body: new Uint8Array(body),
      });
      if (!res.ok)
        throw new Error(
          `s3 put failed ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );

      /*
       * A PRESIGNED url when the bucket is private, which is the default a
       * sensible operator wants: user media should not need a world-readable
       * bucket to be playable. Verified the hard way — returning the plain
       * endpoint url handed the client 343 bytes of AccessDenied XML with a
       * .mp4 name on it.
       *
       * `publicBase` still wins when it is set: that is a CDN or a public
       * origin, where a signature would be pointless and would expire.
       */
      if (cfg.publicBase)
        return `${cfg.publicBase.replace(/\/$/, "")}/${key}`;
      return presign(key, GET_EXPIRY_SECONDS);
    },

    async fetchTo(key, destPath) {
      const req = signed("GET", `${prefix}${key}`, EMPTY_SHA);
      const res = await fetch(req.url, { headers: req.headers });
      if (res.status === 404) return false;
      if (!res.ok)
        throw new Error(
          `s3 get failed ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
      await writeFile(destPath, Buffer.from(await res.arrayBuffer()));
      return true;
    },
  };
}

/** Local unless S3 is configured. Throws rather than guessing on a half-set one. */
export function storageFromEnv(env: NodeJS.ProcessEnv = process.env): Storage {
  const cfg = s3ConfigFromEnv(env);
  return cfg ? s3Storage(cfg) : localStorage();
}
