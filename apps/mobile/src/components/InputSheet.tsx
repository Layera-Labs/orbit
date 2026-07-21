/**
 * InputSheet — a cross-platform text-input dialog (replaces iOS-only
 * `Alert.prompt`, which is a no-op on Android). Same slide-up motion as
 * `BottomSheet`, but self-contained so it can sit inside a `KeyboardAvoidingView`
 * and stay above the keyboard while the user types — the one thing a bottom-
 * anchored sheet must get right for an input.
 *
 * Primary "Save" is the dominant action; "Cancel" is a quiet secondary below it
 * (not a fill-vs-ghost pair). Save is disabled while the trimmed value is empty.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
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
  type KeyboardTypeOptions,
} from 'react-native';
import { font, vela } from '../constants';

const SCREEN_H = Dimensions.get('window').height;

export function InputSheet({
  title,
  subtitle,
  initialValue = '',
  placeholder,
  saveLabel = 'Save',
  keyboardType,
  autoCapitalize = 'sentences',
  secureTextEntry,
  allowEmpty = false,
  onSave,
  onClose,
}: {
  title: string;
  subtitle?: string;
  initialValue?: string;
  placeholder?: string;
  saveLabel?: string;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  secureTextEntry?: boolean;
  /** Permit saving an empty string (default: Save disabled until non-empty). */
  allowEmpty?: boolean;
  onSave: (value: string) => void;
  onClose: () => void;
}) {
  const anim = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = shown
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 240, useNativeDriver: true }).start();
  }, [anim]);

  const close = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 190, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onClose();
    });
  }, [anim, onClose]);

  const canSave = allowEmpty || value.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave(value.trim());
    close();
  };

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H, 0] });

  return (
    <Modal visible transparent statusBarTranslucent animationType="none" onRequestClose={close}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#0008', opacity: anim }]} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <TextInput
            style={styles.input}
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={vela.muted3}
            keyboardType={keyboardType}
            autoCapitalize={autoCapitalize}
            autoCorrect={false}
            secureTextEntry={secureTextEntry}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <Pressable onPress={save} disabled={!canSave} style={[styles.save, !canSave && { opacity: 0.5 }]}>
            <Text style={styles.saveText}>{saveLabel}</Text>
          </Pressable>
          <Pressable onPress={close} hitSlop={8} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancel</Text>
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
  title: { color: '#fff', fontFamily: font.extrabold, fontSize: 19 },
  subtitle: { color: vela.muted, fontFamily: font.medium, fontSize: 13.5, marginTop: -4 },
  input: {
    backgroundColor: vela.card2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: '#fff',
    fontFamily: font.medium,
    fontSize: 16,
    marginTop: 4,
  },
  save: { height: 52, borderRadius: 14, backgroundColor: vela.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  saveText: { color: vela.onAccent, fontFamily: font.bold, fontSize: 17 },
  cancel: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 16 },
  cancelText: { color: vela.textLight2, fontFamily: font.semibold, fontSize: 15 },
});
