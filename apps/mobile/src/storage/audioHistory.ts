/** Persistent local audio library used by the music drawer. */
import { File, Paths } from "expo-file-system";

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

export function loadAudioHistory(): AudioLibraryRecord[] {
  try {
    const file = audioHistoryFile();
    if (!file.exists) return [];
    const data = JSON.parse(file.textSync()) as AudioLibraryRecord[];
    return Array.isArray(data) ? data : [];
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
