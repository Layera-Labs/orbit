import { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { font, vela } from "../constants";
import { useEditor } from "../store/editorStore";
import { VIcon } from "./VIcon";

export function StorySheet() {
  const project = useEditor((s) => s.project);
  const projectName = useEditor((s) => s.name);
  const setPanel = useEditor((s) => s.setPanel);
  const select = useEditor((s) => s.select);
  const setPlayhead = useEditor((s) => s.setPlayhead);
  const removeSelected = useEditor((s) => s.removeSelected);
  const [showTitle, setShowTitle] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const close = () => setPanel(null);
  const track = project?.tracks?.find((item) => item.kind === "visual");
  const clips = track?.kind === "visual" ? track.clips : [];

  const jumpTo = (clipId: string, start: number) => {
    if (!track) return;
    select({ trackId: track.id, clipId });
    setPlayhead(start);
    close();
  };
  const remove = (clipId: string) => {
    if (!track) return;
    select({ trackId: track.id, clipId });
    removeSelected();
  };

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <StatusBar style="auto" />
      <View style={styles.root}>
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Close story"
            onPress={close}
            style={styles.headerButton}
          >
            <VIcon name="close" size={21} color={vela.ink} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title}>Story</Text>
            <Text style={styles.subtitle}>{projectName || "Project"}</Text>
          </View>
          <Pressable
            accessibilityLabel="Story options"
            style={styles.headerButton}
          >
            <VIcon name="dots" size={20} color={vela.ink} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>Main sequence</Text>
              <Text style={styles.sectionHint}>
                {clips.length} visual clips
              </Text>
            </View>
            <VIcon name="chevronUp" size={18} color={vela.ink3} />
          </View>

          <View style={styles.titleToggle}>
            <View style={styles.toggleCopy}>
              <VIcon name="text" size={20} color={vela.accent} />
              <View>
                <Text style={styles.toggleTitle}>Show section title clip</Text>
                <Text style={styles.toggleHint}>
                  Add a title card before this sequence
                </Text>
              </View>
            </View>
            <Switch
              value={showTitle}
              onValueChange={setShowTitle}
              trackColor={{ false: vela.lightBorder, true: vela.accentSoft }}
              thumbColor={showTitle ? vela.accent : "#fff"}
            />
          </View>

          <View style={styles.clipList}>
            {clips.map((clip, index) => (
              <Pressable
                key={clip.id}
                onPress={() => jumpTo(clip.id, clip.start)}
                style={styles.clipRow}
              >
                <View style={styles.thumb}>
                  <VIcon
                    name={clip.type === "video" ? "video" : "image"}
                    size={22}
                    color={vela.accent}
                  />
                  <Text style={styles.thumbIndex}>{index + 1}</Text>
                </View>
                <View style={styles.clipCopy}>
                  <View style={styles.clipMeta}>
                    <Text style={styles.clipTitle}>
                      {clip.type === "video" ? "Video clip" : "Image clip"}
                    </Text>
                    <Text style={styles.duration}>
                      {clip.duration.toFixed(2)}s
                    </Text>
                  </View>
                  <TextInput
                    value={notes[clip.id] ?? ""}
                    onChangeText={(value) =>
                      setNotes((current) => ({ ...current, [clip.id]: value }))
                    }
                    onPressIn={(event) => event.stopPropagation()}
                    placeholder="Describe this clip"
                    placeholderTextColor={vela.lightMuted2}
                    style={styles.note}
                  />
                </View>
                <Pressable
                  accessibilityLabel={`Delete clip ${index + 1}`}
                  hitSlop={8}
                  onPress={(event) => {
                    event.stopPropagation();
                    remove(clip.id);
                  }}
                  style={styles.delete}
                >
                  <VIcon name="trash" size={20} color="#fff" />
                </Pressable>
                <VIcon name="list" size={20} color={vela.lightMuted2} />
              </Pressable>
            ))}
            {!clips.length ? (
              <View style={styles.empty}>
                <VIcon name="video" size={28} color={vela.lightMuted} />
                <Text style={styles.emptyTitle}>No visual clips yet</Text>
                <Text style={styles.emptyText}>
                  Add media to start building your story.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Pressable onPress={close} style={styles.done}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  header: {
    minHeight: 108,
    paddingTop: 50,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: vela.lightCard,
    borderBottomWidth: 1,
    borderBottomColor: vela.lightBorder,
  },
  headerButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.lightSurface,
  },
  headerText: { alignItems: "center" },
  title: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  subtitle: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 11.5 },
  content: { padding: 18, paddingBottom: 28, gap: 14 },
  sectionHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 22 },
  sectionHint: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12,
  },
  titleToggle: {
    padding: 15,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: vela.lightCard,
    borderWidth: 1,
    borderColor: vela.lightBorder,
  },
  toggleCopy: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  toggleTitle: { color: vela.ink2, fontFamily: font.semibold, fontSize: 14 },
  toggleHint: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 11.5,
  },
  clipList: { gap: 10 },
  clipRow: {
    minHeight: 88,
    padding: 10,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: vela.lightCard,
    borderWidth: 1,
    borderColor: vela.lightBorder,
  },
  thumb: {
    width: 62,
    height: 62,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.accentSoft,
  },
  thumbIndex: {
    position: "absolute",
    right: 5,
    bottom: 4,
    color: vela.accent,
    fontFamily: font.bold,
    fontSize: 10,
  },
  clipCopy: { flex: 1, gap: 5 },
  clipMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  clipTitle: { color: vela.ink2, fontFamily: font.bold, fontSize: 13.5 },
  duration: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 10.5,
    fontVariant: ["tabular-nums"],
  },
  note: {
    height: 34,
    borderRadius: 9,
    paddingHorizontal: 10,
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 12.5,
    backgroundColor: vela.lightSurface,
  },
  delete: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.ink2,
  },
  empty: {
    minHeight: 220,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: vela.lightCard,
    borderWidth: 1,
    borderColor: vela.lightBorder,
  },
  emptyTitle: { color: vela.ink2, fontFamily: font.bold, fontSize: 16 },
  emptyText: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 13 },
  footer: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: vela.lightCard,
    borderTopWidth: 1,
    borderTopColor: vela.lightBorder,
  },
  done: {
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.accent,
  },
  doneText: { color: "#fff", fontFamily: font.bold, fontSize: 17 },
});
