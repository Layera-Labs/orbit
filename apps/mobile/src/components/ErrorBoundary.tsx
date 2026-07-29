/**
 * The app's only line of defence against a render-time throw.
 *
 * There was none. In React 18 an uncaught error during render unmounts the
 * whole tree, which on a phone is not a stack trace — it is a black screen with
 * no way out but force-quitting. In a release build there is no red box either,
 * so the user gets no explanation at all and we get no report.
 *
 * A class component because that is still the only way to catch this; there is
 * no hook equivalent.
 */
import { Component, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { font, mono, r, sp, vela } from '../constants';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // The only trace that survives a release build, and the thing that makes a
    // user's screenshot actionable.
    console.error('[orbit] unhandled render error:', error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={{ flex: 1, backgroundColor: vela.editorBg, padding: sp.xxl, justifyContent: 'center' }}>
        <Text style={{ color: vela.textLight, fontSize: 24, fontFamily: font.bold, marginBottom: sp.md }}>
          Orbit hit a problem.
        </Text>
        <Text style={{ color: vela.muted, fontSize: 14, lineHeight: 21, marginBottom: sp.lg }}>
          Your projects are saved on this device and were not affected. Starting over usually
          clears it.
        </Text>
        {/* Scrollable, because a long message must be readable in full rather
            than clipped — a truncated error looks like the whole error. */}
        <ScrollView
          style={{
            maxHeight: 180,
            backgroundColor: vela.card,
            borderRadius: r.md,
            padding: sp.md,
            marginBottom: sp.lg,
          }}
        >
          <Text style={{ color: vela.muted, fontSize: 12, fontFamily: mono.regular }}>
            {error.message || String(error)}
          </Text>
        </ScrollView>
        <Pressable
          onPress={() => this.setState({ error: null })}
          style={{
            backgroundColor: vela.action,
            borderRadius: r.md,
            paddingVertical: sp.md,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: vela.onAccent, fontSize: 15, fontFamily: font.semibold }}>Start over</Text>
        </Pressable>
      </View>
    );
  }
}
