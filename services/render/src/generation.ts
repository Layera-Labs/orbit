import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { ElevenLabsProvider, groupWords } from "@orbit/video-gen";
import type { CaptionLine } from "@orbit/video/browser";
import type { Spoken, VoiceProvider } from "@orbit/pipeline";

/**
 * The real providers behind the generation pipeline's injected seams.
 *
 * `@orbit/pipeline` owns the sequencing and knows nothing about ElevenLabs,
 * ffprobe or the media directory. This is the other half.
 */

/**
 * ElevenLabs, plus the local measurement that makes its output usable.
 *
 * The measurement is the part worth explaining. A scene's length is how long
 * the voice took, so it has to be a real number read off the real file — an
 * `ffprobe`, locally, which costs nothing and involves no provider ceiling.
 * Estimating it from character count was never an option: the same sentence
 * varies by seconds between voices and settings, and every start after the
 * first accumulates the error.
 */
export class ElevenLabsVoice implements VoiceProvider {
  private tts: ElevenLabsProvider;

  constructor(
    apiKey: string,
    private mediaDir: string,
    private ffprobePath = process.env.ORBIT_FFPROBE_PATH ?? "ffprobe",
  ) {
    this.tts = new ElevenLabsProvider({ apiKey });
  }

  async speak(text: string): Promise<Spoken> {
    const out = await this.tts.tts({ text });
    /*
     * Named by the hash of what was SAID, not by a counter. Two scenes with the
     * same narration — a repeated hook, a re-run of the same job under a new id
     * — then land on one file, and the name is stable across processes, which a
     * counter is not.
     */
    const id = `${createHash("sha256").update(text).digest("hex")}.mp3`;
    const path = join(this.mediaDir, id);
    await writeDataUri(out.url, path);
    return { src: `upload:${id}`, durationSec: await this.duration(path) };
  }

  /**
   * Word timings, by transcribing the audio that was produced.
   *
   * Not from the text that produced it — which is why this is a second paid
   * call rather than a local calculation. A key that speaks perfectly well
   * answers 401 here, because `speech_to_text` is a separate scope and off by
   * default; the pipeline treats that as a degrade rather than a failure.
   */
  async align(src: string): Promise<CaptionLine[]> {
    const buf = await readFile(this.pathOf(src));
    const words = await this.tts.transcribe({
      audio: buf.buffer.slice(
        buf.byteOffset,
        buf.byteOffset + buf.byteLength,
      ) as ArrayBuffer,
    });
    return groupWords(words);
  }

  private pathOf(src: string): string {
    const m = /^upload:([A-Za-z0-9._-]+)$/.exec(src);
    if (!m) throw new Error(`not a media token: ${src}`);
    return join(this.mediaDir, m[1]);
  }

  private async duration(path: string): Promise<number> {
    const out = await run(this.ffprobePath, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=nw=1:nk=1",
      path,
    ]);
    const seconds = Number(out.trim());
    /*
     * Refused rather than defaulted. A zero or a NaN here becomes a scene of no
     * length, which lays every later scene on top of it — a video that is
     * silently wrong end to end, from one unreadable file.
     */
    if (!Number.isFinite(seconds) || seconds <= 0)
      throw new Error(`could not measure the narration: ffprobe said ${JSON.stringify(out)}`);
    return seconds;
  }
}

/** `data:` URI (what the provider returns) to a file. */
async function writeDataUri(uri: string, path: string): Promise<void> {
  const comma = uri.indexOf(",");
  if (!uri.startsWith("data:") || comma < 0)
    throw new Error("the voice provider did not return a data uri");
  await writeFile(path, Buffer.from(uri.slice(comma + 1), "base64"));
}

function run(bin: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    p.stdout.on("data", (c) => (out += String(c)));
    p.stderr.on("data", (c) => (err += String(c)));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve(out)
        : reject(new Error(`${bin} exited ${code}: ${err.slice(-400)}`)),
    );
  });
}

/**
 * What a caller may ask for, validated.
 *
 * A generation request is the one place a user's free text reaches an LLM
 * prompt AND a stock search AND, eventually, a filename. Everything here is
 * therefore bounded rather than trusted: a topic is a line, not a novel.
 */
export interface GenerationRequest {
  topic: string;
  format: string;
  aspect: "9:16" | "1:1" | "16:9";
  notes?: string;
}

const ASPECTS = ["9:16", "1:1", "16:9"] as const;
export const MAX_TOPIC = 400;
export const MAX_NOTES = 1_000;

export function parseGenerationRequest(body: unknown): GenerationRequest {
  const o = (body ?? {}) as Record<string, unknown>;
  const topic = typeof o.topic === "string" ? o.topic.trim() : "";
  if (!topic) throw new Error("topic is required");
  if (topic.length > MAX_TOPIC)
    throw new Error(`topic must be ${MAX_TOPIC} characters or fewer`);

  const format = typeof o.format === "string" && o.format.trim() ? o.format.trim() : "story";
  const aspect = typeof o.aspect === "string" ? o.aspect : "9:16";
  if (!ASPECTS.includes(aspect as (typeof ASPECTS)[number]))
    throw new Error(`aspect must be one of ${ASPECTS.join(", ")}`);

  const notes = typeof o.notes === "string" ? o.notes.trim() : "";
  if (notes.length > MAX_NOTES)
    throw new Error(`notes must be ${MAX_NOTES} characters or fewer`);

  return {
    topic,
    format,
    aspect: aspect as GenerationRequest["aspect"],
    ...(notes ? { notes } : {}),
  };
}
