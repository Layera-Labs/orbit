/**
 * Getting the keyboard back down.
 *
 * `Keyboard.dismiss()` was called NOWHERE in this app. `Keyboard` was imported
 * once, in `BottomSheet`, and only to listen for the inset. That left two bugs
 * with one root, and both were found in a live demo:
 *
 * 1. **A surface that closes with a field focused leaves the keyboard up.**
 *    Signing in is the loud case — the auth modal unmounts on success and the
 *    keyboard stays, floating over whatever screen you land on, with nothing on
 *    screen still able to accept it. Every sheet with an input had this.
 *
 * 2. **A `multiline` field traps it completely.** On a multiline `TextInput`
 *    the return key inserts a newline instead of submitting, so
 *    `onSubmitEditing` and `returnKeyType` cannot help — and four of this app's
 *    inputs are multiline, including the AI prompt, which also has `autoFocus`.
 *    Open it and the keyboard is up, over the Generate button, permanently.
 *
 * The rule these two imply: **whatever raises the keyboard owns lowering it.**
 * A surface with a text field dismisses on unmount; a multiline field is given
 * somewhere to tap.
 */
import { useEffect } from "react";
import { Keyboard } from "react-native";

/** Put the keyboard away. Named so call sites read as an intention. */
export function dismissKeyboard(): void {
  Keyboard.dismiss();
}

/**
 * Dismiss the keyboard when this surface goes away.
 *
 * On unmount rather than in each `close` handler, because a sheet has more ways
 * out than its close button — a backdrop tap, a hardware back, a success path
 * that swaps the screen underneath — and only unmount catches all of them. It
 * is also idempotent: dismissing an already-lowered keyboard does nothing.
 */
export function useDismissKeyboardOnUnmount(): void {
  useEffect(() => dismissKeyboard, []);
}
