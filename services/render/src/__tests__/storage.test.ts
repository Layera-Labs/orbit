import { describe, expect, it } from "vitest";
import { localStorage, s3ConfigFromEnv, signV4 } from "../storage.js";

/*
 * SigV4 is hand-rolled to avoid 2MB of AWS SDK for one PUT, so it is pinned to
 * AWS's OWN published example rather than to my reading of the spec. This is
 * the "GET Object" walkthrough from the S3 signature documentation: fixed
 * credentials, fixed date, and a signature AWS states outright. If the
 * canonical request or the string to sign drift by so much as a newline, the
 * hash changes and this fails.
 */
describe("signV4", () => {
  const EXAMPLE = {
    method: "GET",
    host: "examplebucket.s3.amazonaws.com",
    path: "/test.txt",
    region: "us-east-1",
    service: "s3",
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    payloadHash:
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    amzDate: "20130524T000000Z",
    headers: {
      host: "examplebucket.s3.amazonaws.com",
      range: "bytes=0-9",
      "x-amz-content-sha256":
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      "x-amz-date": "20130524T000000Z",
    },
  };

  it("builds the canonical request AWS documents", () => {
    expect(signV4(EXAMPLE).canonicalRequest).toBe(
      [
        "GET",
        "/test.txt",
        "",
        "host:examplebucket.s3.amazonaws.com",
        "range:bytes=0-9",
        "x-amz-content-sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "x-amz-date:20130524T000000Z",
        "",
        "host;range;x-amz-content-sha256;x-amz-date",
        "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      ].join("\n"),
    );
  });

  it("builds the string to sign AWS documents", () => {
    expect(signV4(EXAMPLE).stringToSign).toBe(
      [
        "AWS4-HMAC-SHA256",
        "20130524T000000Z",
        "20130524/us-east-1/s3/aws4_request",
        "7344ae5b7ee6c3e7e6b0fe0640412a37625d1fbfff95c48bbb2dc43964946972",
      ].join("\n"),
    );
  });

  it("derives the signature AWS publishes", () => {
    expect(signV4(EXAMPLE).authorization).toContain(
      "Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    );
  });

  /* Header order is not cosmetic: the server recomputes the canonical request
     from its own sorted view, so signing an unsorted one fails remotely with a
     signature mismatch and no hint as to why. */
  it("sorts and lowercases headers however they arrive", () => {
    const shuffled = signV4({
      ...EXAMPLE,
      headers: {
        "X-Amz-Date": "20130524T000000Z",
        Host: "examplebucket.s3.amazonaws.com",
        "X-Amz-Content-Sha256": EXAMPLE.payloadHash,
        Range: "  bytes=0-9  ",
      },
    });
    expect(shuffled.authorization).toBe(signV4(EXAMPLE).authorization);
  });
});

describe("s3ConfigFromEnv", () => {
  it("is null when unconfigured, so local stays the default", () => {
    expect(s3ConfigFromEnv({})).toBeNull();
  });

  /* The failure this prevents: a bucket set, credentials forgotten, everything
     quietly written to a disk that disappears on the next deploy. */
  it("throws on a half-set configuration rather than falling back", () => {
    expect(() => s3ConfigFromEnv({ ORBIT_S3_BUCKET: "orbit" })).toThrow(
      /ACCESS_KEY/,
    );
  });

  it("reads a full configuration", () => {
    expect(
      s3ConfigFromEnv({
        ORBIT_S3_BUCKET: "orbit",
        ORBIT_S3_ACCESS_KEY_ID: "k",
        ORBIT_S3_SECRET_ACCESS_KEY: "s",
        ORBIT_S3_REGION: "us-east-1",
      }),
    ).toMatchObject({ bucket: "orbit", region: "us-east-1" });
  });
});

describe("localStorage", () => {
  it("serves the file where it already is", async () => {
    await expect(localStorage().put("/tmp/out/v_1_2.mp4", "video/mp4")).resolves.toBe(
      "/files/v_1_2.mp4",
    );
  });
});
