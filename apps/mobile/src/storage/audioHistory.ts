/**
 * Persistent local audio library used by the music drawer.
 *
 * **Every record is healed on the way out, and this is not optional.** iOS
 * hands the app a fresh container UUID on every install, so a stored absolute
 * `file://` is stale the moment the app is reinstalled — which for a dev build
 * is several times a day. Two separate failures came out of not doing it here,
 * and `genHistory.ts` had already been fixed for exactly the same reason:
 *
 *   - the path is stale but the file is fine. Adding the record wrote a dead
 *     src into the project. The project's own rebase heals it on the NEXT
 *     open, so the track was silent until the app was restarted — the
 *     "sometimes it just does not play" case.
 *   - the file is genuinely gone, because a reinstall wipes the documents
 *     directory. The library went on listing it as available, and the failure
 *     surfaced at the far end of an export as
 *     `this media is no longer on the device: x.wav`.
 *
 * A record with a remote url is left alone: only a local file can be rebased,
 * and only a local file's absence is knowable here.
 */
import { File, Paths } from "expo-file-system";
import { rebaseMediaUri } from "./projects";

export interface AudioLibraryRecord {
  id: string;
  name: string;
  url: string;
  source: "upload" | "ai" | "stock";
  durationSec?: number;
  createdAt: number;
}

const MAX_AUDIO_RECORDS = 80;

function audioHistoryFile(): File {
  return new File(Paths.document, "audio-library.json");
}

const isLocal = (url: string | undefined): url is string =>
  !!url && url.startsWith("file:");

function exists(url: string): boolean {
  try {
    return new File(url).exists;
  } catch {
    return false;
  }
}

export function loadAudioHistory(): AudioLibraryRecord[] {
  try {
    const file = audioHistoryFile();
    if (!file.exists) return [];
    const data = JSON.parse(file.textSync()) as AudioLibraryRecord[];
    if (!Array.isArray(data)) return [];

    let changed = false;
    const healed: AudioLibraryRecord[] = [];
    for (const raw of data) {
      if (!raw || typeof raw.url !== "string") {
        changed = true;
        continue;
      }
      const url = rebaseMediaUri(raw.url);
      if (url !== raw.url) changed = true;
      /*
       * Dropped rather than shown greyed out. A record IS its file: there is
       * nothing to re-download for an upload, and a row that cannot be used is
       * worse than one that is not there — it invites the tap that fails four
       * screens later, at the export.
       */
      if (isLocal(url) && !exists(url)) {
        changed = true;
        continue;
      }
      healed.push({ ...raw, url });
    }
    if (changed) saveAudioHistory(healed);
    return healed;
  } catch {
    return [];
  }
}

function saveAudioHistory(records: AudioLibraryRecord[]): void {
  try {
    audioHistoryFile().write(
      JSON.stringify(records.slice(0, MAX_AUDIO_RECORDS)),
    );
  } catch {
    // Local history is best-effort; the imported timeline clip still works.
  }
}

export function addAudioHistory(
  record: Omit<AudioLibraryRecord, "id" | "createdAt">,
): AudioLibraryRecord[] {
  const full: AudioLibraryRecord = {
    ...record,
    id: `aud_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  const next = [full, ...loadAudioHistory()].slice(0, MAX_AUDIO_RECORDS);
  saveAudioHistory(next);
  return next;
}
