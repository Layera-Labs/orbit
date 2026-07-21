/**
 * AI entry points. Opens an AI generation panel, routing through the auth sheet
 * when sign-in is required and seeding the generate modal's initial mode/source.
 * Reads the stores via `getState()` at call time so this stays a leaf module (no
 * circular import — `authStore` imports `editorStore`, and this imports both).
 */
import { AUTH_ENABLED } from '../constants';
import { useEditor, type AiIntent } from './editorStore';
import { useAuth } from './authStore';

/** Open an AI panel; gates behind the auth sheet when logged out, seeding an optional intent. */
export function openAi(target: 'aigen' | 'tts', intent?: AiIntent): void {
  useEditor.setState({ aiIntent: intent ?? null });
  const { setPanel } = useEditor.getState();
  if (AUTH_ENABLED && useAuth.getState().status !== 'authed') {
    useEditor.setState({ authNext: target });
    setPanel('auth');
  } else {
    setPanel(target);
  }
}
