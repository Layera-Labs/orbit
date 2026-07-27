import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { font, orbitGradient, vela } from "../constants";
import { BottomSheet } from "../components/BottomSheet";
import { OrbitMark } from "../components/OrbitMark";
import { PrimaryButton } from "../components/OrbitUi";
import { VIcon, type VIconName } from "../components/VIcon";

export function OnboardingScreen({ onContinue }: { onContinue: () => void }) {
  const [whyOpen, setWhyOpen] = useState(false);
  return (
    <LinearGradient
      colors={["#ffffff", "#f1efff"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.brandBlock}>
          <View style={styles.markHalo}>
            <OrbitMark size={92} ringOpacity={0.8} />
          </View>
          <Text style={styles.wordmark}>orbit</Text>
          <Text style={styles.tagline}>
            Powerful video editing.{`\n`}Open for everyone.
          </Text>
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="Get Started" onPress={onContinue} />
          <Pressable
            accessibilityRole="button"
            style={styles.guest}
            onPress={onContinue}
          >
            <VIcon name="navHome" size={18} color={vela.ink2} />
            <Text style={styles.guestText}>Continue as Guest</Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.promise}
          onPress={() => setWhyOpen(true)}
          hitSlop={8}
        >
          <VIcon name="lock" size={14} color={vela.ink3} />
          <Text style={styles.promiseText}>100% Free · No Login Required</Text>
        </Pressable>
        <Text style={styles.promiseSub}>Edit. Export. That’s it.</Text>
      </ScrollView>

      {whyOpen ? <WhyOrbitSheet onClose={() => setWhyOpen(false)} /> : null}
    </LinearGradient>
  );
}

function WhyOrbitSheet({ onClose }: { onClose: () => void }) {
  const rows: Array<{
    icon: VIconName;
    title: string;
    detail: string;
    color: string;
  }> = [
    {
      icon: "check",
      title: "100% Free",
      detail: "No login required to edit and export.",
      color: "#3d8b63",
    },
    {
      icon: "quality",
      title: "Powerful Editor",
      detail: "Professional tools for everyone.",
      color: vela.accent,
    },
    {
      icon: "lock",
      title: "Local & Private",
      detail: "Your projects and media stay on your device.",
      color: "#4f78c8",
    },
    {
      icon: "fx",
      title: "AI Studio (Optional)",
      detail: "Sign in only when you want AI power.",
      color: vela.accent2,
    },
  ];
  return (
    <BottomSheet onClose={onClose} style={styles.whySheet} dim="#0005">
      <Text style={styles.whyTitle}>Why Orbit?</Text>
      {rows.map((row) => (
        <View key={row.title} style={styles.whyRow}>
          <View style={[styles.whyIcon, { backgroundColor: `${row.color}26` }]}>
            <VIcon
              name={row.icon}
              size={22}
              color={row.color}
              strokeWidth={2.1}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.whyRowTitle}>{row.title}</Text>
            <Text style={styles.whyRowDetail}>{row.detail}</Text>
          </View>
        </View>
      ))}
      <LinearGradient colors={orbitGradient} style={styles.whyAccent} />
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: {
    flexGrow: 1,
    paddingTop: 78,
    paddingHorizontal: 28,
    paddingBottom: 34,
    justifyContent: "space-between",
  },
  brandBlock: { alignItems: "center", paddingTop: 56 },
  markHalo: {
    width: 124,
    height: 124,
    borderRadius: 62,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.72)",
  },
  wordmark: {
    color: vela.ink,
    fontFamily: font.extrabold,
    fontSize: 50,
    letterSpacing: -2.2,
    marginTop: 14,
  },
  tagline: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 10,
  },
  actions: { gap: 12, paddingTop: 70 },
  guest: {
    height: 52,
    borderRadius: 13,
    borderCurve: "continuous",
    backgroundColor: "rgba(255,255,255,0.76)",
    borderWidth: 1,
    borderColor: vela.lightBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  guestText: { color: vela.ink2, fontFamily: font.bold, fontSize: 15 },
  promise: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingTop: 24,
  },
  promiseText: { color: vela.ink3, fontFamily: font.semibold, fontSize: 12.5 },
  promiseSub: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 12.5,
    textAlign: "center",
    marginTop: 4,
  },
  whySheet: {
    backgroundColor: vela.lightCard,
    gap: 18,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 38,
  },
  whyTitle: { color: vela.ink, fontFamily: font.extrabold, fontSize: 25 },
  whyRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  whyIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  whyRowTitle: { color: vela.ink2, fontFamily: font.bold, fontSize: 16 },
  whyRowDetail: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  whyAccent: { height: 3, borderRadius: 2, marginTop: 2 },
});
