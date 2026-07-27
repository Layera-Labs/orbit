/**
 * AuthSheet — full-screen account flow gating AI generation + credits (the
 * editor itself never needs it). Four views share one screen: sign in, create,
 * forgot-password, and reset-with-code.
 *
 * Social sign-in (Apple / Google) is shown as real, bare brand marks but is a
 * placeholder for now — tapping explains it's coming. Password reset is real:
 * "forgot" emails a token, "reset" consumes it. One dominant gold primary; the
 * view switches are quiet text links, per the design law.
 */
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { StatusBar } from "expo-status-bar";
import { font, mono, vela } from "../constants";
import { VIcon } from "./VIcon";
import { AuthError } from "../net/authClient";
import { useAuth } from "../store/authStore";

type ViewKey = "login" | "register" | "forgot" | "reset";

function friendly(e: unknown): string {
  if (e instanceof AuthError) {
    switch (e.kind) {
      case "invalid-credentials":
        return "Wrong email or password.";
      case "email-taken":
        return "That email is already registered — try signing in.";
      case "weak-password":
        return "Use at least 8 characters.";
      case "bad-email":
        return "Enter a valid email address.";
      case "invalid-token":
        return "That reset code is invalid or has expired. Request a new one.";
      case "email-unconfigured":
        return "This server can’t send email yet, so password reset is unavailable.";
      case "no-server":
        return "Can’t reach the server. Check the render-server URL in Profile.";
      case "not-configured":
        return "This server doesn’t have accounts enabled.";
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : "Something went wrong.";
}

/** Apple's monochrome mark, bare (no tile), tinted to the current ink. */
function AppleMark({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24">
      <Path
        fill={color}
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </Svg>
  );
}

/** Google's four-colour "G" mark, bare. */
function GoogleMark() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24">
      <Path
        fill="#4285F4"
        d="M23.06 12.25c0-.85-.08-1.67-.22-2.45H12v4.64h6.2c-.27 1.44-1.08 2.66-2.3 3.48v2.9h3.72c2.18-2 3.44-4.96 3.44-8.57z"
      />
      <Path
        fill="#34A853"
        d="M12 24c3.11 0 5.72-1.03 7.62-2.79l-3.72-2.9c-1.03.69-2.35 1.1-3.9 1.1-3 0-5.54-2.03-6.45-4.75H1.7v2.99C3.59 21.38 7.5 24 12 24z"
      />
      <Path
        fill="#FBBC05"
        d="M5.55 14.66c-.23-.69-.36-1.42-.36-2.16s.13-1.47.36-2.16V7.35H1.7C.95 8.85.5 10.55.5 12.5s.45 3.65 1.2 5.15l3.85-2.99z"
      />
      <Path
        fill="#EA4335"
        d="M12 4.75c1.69 0 3.21.58 4.4 1.72l3.3-3.3C17.71 1.28 15.1.25 12 .25 7.5.25 3.59 2.87 1.7 6.65l3.85 2.99C6.46 6.92 9 4.75 12 4.75z"
      />
    </Svg>
  );
}

export function AuthSheet({
  onClose,
  onAuthed,
}: {
  onClose: () => void;
  onAuthed?: () => void;
}) {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const requestReset = useAuth((s) => s.requestReset);
  const resetPassword = useAuth((s) => s.resetPassword);

  const [view, setView] = useState<ViewKey>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [social, setSocial] = useState<string | null>(null);

  const go = useCallback((next: ViewKey) => {
    setView(next);
    setErr(null);
    setInfo(null);
    setSocial(null);
  }, []);

  const succeed = () => {
    if (onAuthed) onAuthed();
    else onClose();
  };

  const canAuth = email.trim().length > 0 && password.length > 0 && !busy;
  const canForgot = email.trim().length > 0 && !busy;
  const canReset = token.trim().length > 0 && password.length > 0 && !busy;

  const submitAuth = async () => {
    if (!canAuth) return;
    setBusy(true);
    setErr(null);
    try {
      if (view === "login") await login(email, password);
      else await register(email, password);
      succeed();
    } catch (e) {
      setErr(friendly(e));
      setBusy(false);
    }
  };

  const submitForgot = async () => {
    if (!canForgot) return;
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      await requestReset(email);
      setInfo(
        `If an account exists for ${email.trim()}, a reset code is on its way. Paste it below to set a new password.`,
      );
      setPassword("");
      setView("reset");
    } catch (e) {
      setErr(friendly(e));
    } finally {
      setBusy(false);
    }
  };

  const submitReset = async () => {
    if (!canReset) return;
    setBusy(true);
    setErr(null);
    try {
      await resetPassword(token.trim(), password);
      succeed();
    } catch (e) {
      setErr(friendly(e));
      setBusy(false);
    }
  };

  const isLogin = view === "login";
  const isRegister = view === "register";
  const isForgot = view === "forgot";
  const isReset = view === "reset";

  const heading = isLogin
    ? "Sign in to unlock AI features"
    : isRegister
      ? "Create your AI account"
      : isForgot
        ? "Reset password"
        : "Set a new password";
  const sub =
    isLogin || isRegister
      ? "Orbit stays open for editing and export. Sign in only when you want AI Studio."
      : isForgot
        ? "Enter your email and we’ll send a reset code."
        : "Paste the code from your email and choose a new password.";

  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <StatusBar style="auto" />
      <View style={styles.root}>
        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
          style={styles.fill}
        >
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* Close sits inline with the heading, right-aligned — same on every view. */}
            <View style={styles.titleRow}>
              <Text style={styles.title}>{heading}</Text>
              <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
                <VIcon
                  name="close"
                  size={22}
                  color={vela.ink2}
                  strokeWidth={2.2}
                />
              </Pressable>
            </View>
            <Text style={styles.subtitle}>{sub}</Text>

            {info ? <Text style={styles.info}>{info}</Text> : null}

            {isReset ? (
              <TextInput
                style={[styles.input, styles.code]}
                value={token}
                onChangeText={setToken}
                placeholder="Reset code"
                placeholderTextColor={vela.muted3}
                autoCapitalize="none"
                autoCorrect={false}
                multiline
              />
            ) : (
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="Email"
                placeholderTextColor={vela.muted3}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType={isForgot ? "send" : "next"}
                onSubmitEditing={isForgot ? submitForgot : undefined}
              />
            )}

            {!isForgot ? (
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={isLogin ? "Password" : "Password (8+ characters)"}
                placeholderTextColor={vela.muted3}
                secureTextEntry
                autoCapitalize="none"
                autoComplete="password"
                textContentType={isLogin ? "password" : "newPassword"}
                returnKeyType="go"
                onSubmitEditing={isReset ? submitReset : submitAuth}
              />
            ) : null}

            {isLogin ? (
              <Pressable
                onPress={() => go("forgot")}
                hitSlop={8}
                style={styles.forgotLink}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </Pressable>
            ) : null}

            {err ? <Text style={styles.err}>{err}</Text> : null}

            <Pressable
              onPress={
                isForgot ? submitForgot : isReset ? submitReset : submitAuth
              }
              disabled={isForgot ? !canForgot : isReset ? !canReset : !canAuth}
              style={[
                styles.primary,
                (isForgot ? !canForgot : isReset ? !canReset : !canAuth) && {
                  opacity: 0.5,
                },
              ]}
            >
              {busy ? (
                <ActivityIndicator color={vela.onAccent} />
              ) : (
                <Text style={styles.primaryText}>
                  {isLogin
                    ? "Sign in"
                    : isRegister
                      ? "Create account"
                      : isForgot
                        ? "Send reset code"
                        : "Reset password"}
                </Text>
              )}
            </Pressable>

            {isLogin || isRegister ? (
              <>
                <View style={styles.orRow}>
                  <View style={styles.orLine} />
                  <Text style={styles.orText}>or</Text>
                  <View style={styles.orLine} />
                </View>

                {social ? <Text style={styles.info}>{social}</Text> : null}

                <Pressable
                  style={styles.social}
                  onPress={() => setSocial("Apple sign-in is coming soon.")}
                >
                  <AppleMark color={vela.ink2} />
                  <Text style={styles.socialText}>Continue with Apple</Text>
                </Pressable>
                <Pressable
                  style={styles.social}
                  onPress={() => setSocial("Google sign-in is coming soon.")}
                >
                  <GoogleMark />
                  <Text style={styles.socialText}>Continue with Google</Text>
                </Pressable>

                <Pressable
                  onPress={() => go(isLogin ? "register" : "login")}
                  hitSlop={8}
                  style={styles.toggle}
                >
                  <Text style={styles.toggleText}>
                    {isLogin ? "New to Orbit? " : "Already have an account? "}
                    <Text style={styles.toggleAccent}>
                      {isLogin ? "Create an account" : "Sign in"}
                    </Text>
                  </Text>
                </Pressable>
              </>
            ) : (
              <Pressable
                onPress={() => go("login")}
                hitSlop={8}
                style={styles.toggle}
              >
                <Text style={styles.toggleText}>
                  {isReset ? "Didn’t get a code? " : "Remembered it? "}
                  <Text style={styles.toggleAccent}>
                    {isReset ? "Start over" : "Back to sign in"}
                  </Text>
                </Text>
              </Pressable>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: vela.homeBg, paddingTop: 62 },
  fill: { flex: 1 },
  body: { paddingHorizontal: 22, paddingTop: 8, paddingBottom: 40, gap: 12 },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flexShrink: 1,
    color: vela.ink,
    fontFamily: font.extrabold,
    fontSize: 30,
    letterSpacing: -0.5,
  },
  close: { padding: 2 },
  subtitle: {
    color: vela.lightMuted,
    fontFamily: font.medium,
    fontSize: 14.5,
    marginTop: -4,
    lineHeight: 20,
  },
  info: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 13.5,
    lineHeight: 19,
  },
  input: {
    backgroundColor: vela.lightSurface,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 15,
    color: vela.ink,
    fontFamily: font.medium,
    fontSize: 16,
  },
  code: {
    fontFamily: mono.regular,
    fontSize: 13,
    minHeight: 78,
    textAlignVertical: "top",
  },
  forgotLink: { alignSelf: "flex-end", paddingVertical: 2 },
  forgotText: {
    color: vela.ink3,
    fontFamily: font.semibold,
    fontSize: 13.5,
  },
  err: { color: vela.danger, fontFamily: font.medium, fontSize: 13.5 },
  primary: {
    height: 54,
    borderRadius: 14,
    backgroundColor: vela.accent,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  primaryText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 17 },
  orRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 6 },
  orLine: { flex: 1, height: 1, backgroundColor: vela.lightBorder },
  orText: { color: vela.lightMuted, fontFamily: font.medium, fontSize: 13 },
  social: {
    height: 52,
    borderRadius: 14,
    backgroundColor: vela.lightCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: vela.lightBorder,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  socialText: {
    color: vela.ink2,
    fontFamily: font.semibold,
    fontSize: 15.5,
  },
  toggle: {
    alignSelf: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
  },
  toggleText: {
    color: vela.ink3,
    fontFamily: font.medium,
    fontSize: 14.5,
  },
  toggleAccent: { color: vela.accent, fontFamily: font.bold },
});
