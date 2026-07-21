/**
 * AuthSheet — sign in / create account before AI generation. Self-contained
 * (like InputSheet) so it sits above the keyboard with two fields. The editor
 * itself never needs this; it gates only AI + credits.
 *
 * One dominant primary action; the login/register switch is a quiet text toggle
 * (not a second button), per the design law.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { font, vela } from '../constants';
import { AuthError } from '../net/authClient';
import { useAuth } from '../store/authStore';

const SCREEN_H = Dimensions.get('window').height;

function friendly(e: unknown): string {
  if (e instanceof AuthError) {
    switch (e.kind) {
      case 'invalid-credentials': return 'Wrong email or password.';
      case 'email-taken': return 'That email is already registered — try signing in.';
      case 'weak-password': return 'Use at least 8 characters.';
      case 'bad-email': return 'Enter a valid email address.';
      case 'no-server': return 'Can’t reach the server. Check the render-server URL in Profile.';
      case 'not-configured': return 'This server doesn’t have accounts enabled.';
      default: return e.message;
    }
  }
  return e instanceof Error ? e.message : 'Something went wrong.';
}

export function AuthSheet({ onClose, onAuthed }: { onClose: () => void; onAuthed?: () => void }) {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);

  const anim = useRef(new Animated.Value(0)).current;
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [anim]);

  const close = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 190, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [anim, onClose]);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !busy;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setErr(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password);
      // On success either hand off to the caller (which swaps the panel and
      // unmounts us) or just close — never both, or we'd double-dismiss.
      if (onAuthed) onAuthed();
      else close();
    } catch (e) {
      setErr(friendly(e));
      setBusy(false);
    }
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] });
  const isLogin = mode === 'login';

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#0009', opacity: anim }]} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <Text style={styles.title}>{isLogin ? 'Sign in' : 'Create account'}</Text>
          <Text style={styles.subtitle}>An account is needed to generate with AI and track credits.</Text>

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
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={isLogin ? 'Password' : 'Password (8+ characters)'}
            placeholderTextColor={vela.muted3}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="password"
            textContentType={isLogin ? 'password' : 'newPassword'}
            returnKeyType="go"
            onSubmitEditing={submit}
          />

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable onPress={submit} disabled={!canSubmit} style={[styles.primary, !canSubmit && { opacity: 0.5 }]}>
            {busy ? <ActivityIndicator color={vela.onAccent} /> : <Text style={styles.primaryText}>{isLogin ? 'Sign in' : 'Create account'}</Text>}
          </Pressable>

          <Pressable onPress={() => { setMode(isLogin ? 'register' : 'login'); setErr(null); }} hitSlop={8} style={styles.toggle}>
            <Text style={styles.toggleText}>
              {isLogin ? 'New to Orbit? ' : 'Already have an account? '}
              <Text style={styles.toggleAccent}>{isLogin ? 'Create an account' : 'Sign in'}</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: vela.sheet,
    padding: 18,
    paddingBottom: 34,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 12,
  },
  title: { color: '#fff', fontFamily: font.extrabold, fontSize: 22 },
  subtitle: { color: vela.muted, fontFamily: font.medium, fontSize: 13.5, marginTop: -4 },
  input: {
    backgroundColor: vela.card2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#fff',
    fontFamily: font.medium,
    fontSize: 16,
  },
  err: { color: vela.danger, fontFamily: font.medium, fontSize: 13.5 },
  primary: { height: 54, borderRadius: 14, backgroundColor: vela.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primaryText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 17 },
  toggle: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  toggleText: { color: vela.textLight2, fontFamily: font.medium, fontSize: 14.5 },
  toggleAccent: { color: vela.accent, fontFamily: font.bold },
});
