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
import { font, mono, vela } from "../constants";
import { VIcon } from "./VIcon";
import { AuthError } from "../net/authClient";
import { useAuth } from "../store/authStore";
import { useEditor } from "../store/editorStore";
import { useDismissKeyboardOnUnmount } from "./keyboard";
import { useStatusBarStyle } from "./statusBar";

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

export function AuthSheet({
  onClose,
  onAuthed,
}: {
  onClose: () => void;
  onAuthed?: () => void;
}) {
  // Light sheet over dark chrome. Set through the hook, not a `<StatusBar>`:
  // that component applies a style and does nothing on unmount, so closing this
  // used to leave dark glyphs on the dark editor behind it.
  useStatusBarStyle("dark", useEditor((s) => s.screen));
  // The keyboard follows the field, and the field goes away with this modal.
  useDismissKeyboardOnUnmount();

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

  const go = useCallback((next: ViewKey) => {
    setView(next);
    setErr(null);
    setInfo(null);
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
      /*
       * The server says how it delivers, and the two answers are different
       * screens. A server with a reset page mails a LINK — sending the user to
       * a paste-a-code field then leaves them hunting an email for a code that
       * was never in it, which is how a working flow reads as broken. Only the
       * `code` server has anything to paste.
       */
      const delivery = await requestReset(email);
      const addressed = `If an account exists for ${email.trim()},`;
      if (delivery === "link") {
        setInfo(
          `${addressed} a reset link is on its way. Open it to choose a new password, then come back and sign in.`,
        );
        setPassword("");
        setView("login");
      } else {
        setInfo(
          `${addressed} a reset code is on its way. Paste it below to set a new password.`,
        );
        setPassword("");
        setView("reset");
      }
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
      <View style={styles.root}>
        <KeyboardAvoidingView
          behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
          style={styles.fill}
        >
          <ScrollView
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
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

            {/*
              There is no social sign-in here, and there is deliberately no
              placeholder for it either.

              "Continue with Apple" and "Continue with Google" used to sit here
              as real-looking controls whose entire effect was to say "coming
              soon". Three reasons they are gone rather than disabled: a control
              styled like every other one is a promise whether or not it is
              greyed out; drawing Apple's and Google's marks on buttons that do
              not perform their sign-in is a trademark problem independent of
              whether they work; and App Store guideline 4.8 rejects offering
              Google without Apple anyway, so the only two valid states are both
              real or neither.

              Password reset in this same sheet IS real, which is exactly why
              the placeholders were dangerous — nothing distinguished them.
            */}
            {isLogin || isRegister ? (
              <>
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
