import { useState } from "react";
import {
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { AppHeader } from "../components/AppHeader";
import { AuthSheet } from "../components/AuthSheet";
import { BottomNav } from "../components/BottomNav";
import { BottomSheet } from "../components/BottomSheet";
import { VIcon, type VIconName } from "../components/VIcon";
import { font, SUPPORT_URL, vela } from "../constants";
import { useAuth } from "../store/authStore";
import { useEditor } from "../store/editorStore";
import { CreateSheet } from "./CreateSheet";

export function ProfileScreen() {
  const status = useAuth((s) => s.status);
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const go = useEditor((s) => s.go);
  const serverUrl = useEditor((s) => s.serverUrl);
  const setServerUrl = useEditor((s) => s.setServerUrl);
  const rippleDelete = useEditor((s) => s.rippleDelete);
  const setRippleDelete = useEditor((s) => s.setRippleDelete);
  const newProject = useEditor((s) => s.newProject);
  const [authOpen, setAuthOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const authed = status === "authed";

  const rows: Array<{ icon: VIconName; label: string; onPress: () => void }> = [
    {
      icon: "templates",
      label: "Projects & Media",
      onPress: () => go("library"),
    },
    { icon: "prefs", label: "Settings", onPress: () => setSettingsOpen(true) },
    {
      icon: "help",
      label: "Help & Support",
      // A real destination. If the device cannot open it there is nothing
      // useful to say beyond that, so it says exactly that rather than
      // failing silently.
      onPress: () => {
        void Linking.openURL(SUPPORT_URL).catch(() =>
          Alert.alert("Could not open the browser", SUPPORT_URL),
        );
      },
    },
    { icon: "help", label: "About Orbit", onPress: () => setAboutOpen(true) },
  ];

  return (
    <View style={styles.root}>
      <AppHeader title="Me" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.identity}>
          <View style={styles.avatar}>
            <VIcon name="profile" size={38} color="#fff" strokeWidth={1.8} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>
              {authed
                ? user?.email?.split("@")[0] || "Orbit Creator"
                : "Guest User"}
            </Text>
            <Text style={styles.sub}>
              {authed ? user?.email : "Create freely. Sign in only for AI."}
            </Text>
          </View>
        </View>

        <View style={styles.syncCard}>
          <View style={styles.syncIcon}>
            <VIcon
              name={authed ? "check" : "export"}
              size={24}
              color={vela.accent}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.syncTitle}>
              {authed ? "AI account connected" : "Optional account"}
            </Text>
            <Text style={styles.syncSub}>
              {authed
                ? "AI credits and generation history are available."
                : "Sign in for AI Studio. Local editing stays unlocked."}
            </Text>
          </View>
          <Pressable
            style={styles.signButton}
            onPress={() => (authed ? void logout() : setAuthOpen(true))}
          >
            <Text style={styles.signText}>
              {authed ? "Sign Out" : "Sign In"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.menu}>
          {rows.map((row, index) => (
            <Pressable
              key={row.label}
              style={[styles.row, index > 0 && styles.rowBorder]}
              onPress={row.onPress}
            >
              <VIcon name={row.icon} size={20} color={vela.ink3} />
              <Text style={styles.rowText}>{row.label}</Text>
              <VIcon name="chevronRight" size={17} color={vela.lightMuted} />
            </Pressable>
          ))}
        </View>

        <View style={styles.localCard}>
          <VIcon name="lock" size={19} color={vela.success} />
          <View style={{ flex: 1 }}>
            <Text style={styles.localTitle}>Local-first workspace</Text>
            <Text style={styles.localText}>
              Projects remain available without an account.
            </Text>
          </View>
        </View>
      </ScrollView>

      <BottomNav
        onHome={() => go("projects")}
        onTemplates={() => go("discover")}
        onCreate={() => setCreateOpen(true)}
        onAi={() => go("ai")}
      />

      {authOpen ? (
        <AuthSheet
          onClose={() => setAuthOpen(false)}
          onAuthed={() => setAuthOpen(false)}
        />
      ) : null}
      {settingsOpen ? (
        <SettingsSheet
          serverUrl={serverUrl}
          rippleDelete={rippleDelete}
          onServerUrlChange={setServerUrl}
          onRippleDeleteChange={setRippleDelete}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
      {aboutOpen ? <AboutSheet onClose={() => setAboutOpen(false)} /> : null}
      <CreateSheet
        visible={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={(width, height) => {
          setCreateOpen(false);
          newProject("Untitled", width, height);
        }}
      />
    </View>
  );
}

function SettingsSheet({
  serverUrl,
  rippleDelete,
  onServerUrlChange,
  onRippleDeleteChange,
  onClose,
}: {
  serverUrl: string;
  rippleDelete: boolean;
  onServerUrlChange: (value: string) => void;
  onRippleDeleteChange: (enabled: boolean) => void;
  onClose: () => void;
}) {
  const [serverDraft, setServerDraft] = useState(serverUrl);
  const saveAndClose = () => {
    onServerUrlChange(serverDraft);
    onClose();
  };

  return (
    <BottomSheet onClose={saveAndClose} style={styles.settingsSheet} dim="#0005">
      <View style={styles.settingsHeader}>
        <View>
          <Text style={styles.settingsTitle}>Settings</Text>
          <Text style={styles.settingsSubtitle}>
            Customize how Orbit edits your timeline.
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close settings"
          style={styles.settingsClose}
          onPress={saveAndClose}
        >
          <VIcon name="close" size={18} color={vela.ink2} />
        </Pressable>
      </View>

      <Text style={styles.settingsSectionTitle}>VIDEO EDITOR</Text>
      <View style={styles.settingsGroup}>
        <View style={styles.settingsRow}>
          <View style={styles.settingsRowIcon}>
            <VIcon
              name="rippleDelete"
              size={21}
              color={rippleDelete ? vela.accent : vela.ink3}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.settingsRowTitle}>Ripple Delete</Text>
            <Text style={styles.settingsRowText}>
              Replace Delete with Ripple Delete and automatically close space on
              the same timeline lane.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Ripple Delete"
            value={rippleDelete}
            onValueChange={onRippleDeleteChange}
            trackColor={{ false: "#d9d9df", true: "#a99fff" }}
            thumbColor={rippleDelete ? vela.accent : "#ffffff"}
          />
        </View>
      </View>

      <Text style={styles.settingsSectionTitle}>RENDERING</Text>
      <View style={styles.settingsGroup}>
        <Text style={styles.serverLabel}>Render server</Text>
        <Text style={styles.serverHelp}>
          Used for final video export and AI generation.
        </Text>
        <TextInput
          accessibilityLabel="Render server URL"
          style={styles.serverInput}
          value={serverDraft}
          onChangeText={setServerDraft}
          placeholder="http://192.168.1.20:8787"
          placeholderTextColor={vela.lightMuted}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={saveAndClose}
        />
      </View>

      <Pressable style={styles.settingsDone} onPress={saveAndClose}>
        <Text style={styles.settingsDoneText}>Done</Text>
      </Pressable>
    </BottomSheet>
  );
}

function AboutSheet({ onClose }: { onClose: () => void }) {
  const benefits: Array<{ icon: VIconName; title: string; text: string }> = [
    {
      icon: "check",
      title: "100% Free",
      text: "No login required to edit and export.",
    },
    {
      icon: "quality",
      title: "Powerful Editor",
      text: "Professional multi-track tools for everyone.",
    },
    {
      icon: "lock",
      title: "Local & Private",
      text: "Your projects and source media stay on device.",
    },
    {
      icon: "fx",
      title: "AI Studio is optional",
      text: "Sign in only when you need generative tools.",
    },
  ];
  return (
    <BottomSheet onClose={onClose} style={styles.about} dim="#0005">
      <Text style={styles.aboutTitle}>Why Orbit?</Text>
      {benefits.map((benefit) => (
        <View key={benefit.title} style={styles.aboutRow}>
          <View style={styles.aboutIcon}>
            <VIcon name={benefit.icon} size={21} color={vela.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.aboutRowTitle}>{benefit.title}</Text>
            <Text style={styles.aboutRowText}>{benefit.text}</Text>
          </View>
        </View>
      ))}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 116,
    gap: 18,
  },
  identity: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: {
    backgroundColor: vela.action,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  name: { color: vela.ink, fontFamily: font.extrabold, fontSize: 20 },
  sub: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 12.5,
    marginTop: 3,
  },
  syncCard: {
    backgroundColor: vela.folderFrom,
    minHeight: 86,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 13,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: 1,
    borderColor: "#e3defe",
  },
  syncIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  syncTitle: { color: vela.ink, fontFamily: font.bold, fontSize: 13.5 },
  syncSub: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 2,
  },
  signButton: {
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  signText: { color: vela.accent, fontFamily: font.bold, fontSize: 11.5 },
  menu: {
    backgroundColor: vela.lightCard,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  row: {
    minHeight: 56,
    paddingHorizontal: 15,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  rowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: vela.lightBorder,
  },
  rowText: {
    flex: 1,
    color: vela.ink2,
    fontFamily: font.semibold,
    fontSize: 14,
  },
  localCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    backgroundColor: "#edf8f1",
    borderRadius: 14,
    borderCurve: "continuous",
    padding: 14,
  },
  localTitle: { color: "#276443", fontFamily: font.bold, fontSize: 13 },
  localText: {
    color: "#4d7560",
    fontFamily: font.medium,
    fontSize: 11.5,
    marginTop: 2,
  },
  settingsSheet: {
    backgroundColor: vela.lightSurface,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 36,
    gap: 12,
  },
  settingsHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingBottom: 5,
  },
  settingsTitle: {
    color: vela.ink,
    fontFamily: font.extrabold,
    fontSize: 24,
  },
  settingsSubtitle: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 12,
    marginTop: 3,
  },
  settingsClose: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.lightCard,
  },
  settingsSectionTitle: {
    color: vela.lightMuted,
    fontFamily: font.bold,
    fontSize: 11,
    letterSpacing: 0.7,
    paddingHorizontal: 4,
    marginTop: 4,
  },
  settingsGroup: {
    backgroundColor: vela.lightCard,
    borderRadius: 16,
    borderCurve: "continuous",
    padding: 14,
    gap: 5,
  },
  settingsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingsRowIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.accentSoft,
  },
  settingsRowTitle: {
    color: vela.ink2,
    fontFamily: font.bold,
    fontSize: 15,
  },
  settingsRowText: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  serverLabel: {
    color: vela.ink2,
    fontFamily: font.bold,
    fontSize: 14,
  },
  serverHelp: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 11,
  },
  serverInput: {
    minHeight: 46,
    borderRadius: 12,
    borderCurve: "continuous",
    backgroundColor: vela.lightSurface,
    color: vela.ink,
    fontFamily: font.medium,
    fontSize: 13,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  settingsDone: {
    height: 50,
    borderRadius: 14,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: vela.accent,
    marginTop: 4,
  },
  settingsDoneText: {
    color: vela.onAccent,
    fontFamily: font.bold,
    fontSize: 16,
  },
  about: {
    backgroundColor: vela.lightCard,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 38,
    gap: 17,
  },
  aboutTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 24 },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 13 },
  aboutIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: vela.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  aboutRowTitle: { color: vela.ink2, fontFamily: font.bold, fontSize: 15 },
  aboutRowText: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 2,
  },
});
