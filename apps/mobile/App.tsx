import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { HankenGrotesk_400Regular, HankenGrotesk_500Medium, HankenGrotesk_600SemiBold, HankenGrotesk_700Bold, HankenGrotesk_800ExtraBold } from '@expo-google-fonts/hanken-grotesk';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_700Bold } from '@expo-google-fonts/jetbrains-mono';
import { useEditor } from './src/store/editorStore';
import { useAuth } from './src/store/authStore';
import { configurePurchases } from './src/net/purchases';
import { vela } from './src/constants';
import { HomeScreen } from './src/screens/HomeScreen';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { EditorScreen } from './src/screens/EditorScreen';
import { AiStudioScreen } from './src/screens/AiStudioScreen';
import { MediaLibraryScreen } from './src/screens/MediaLibraryScreen';
import { OnboardingScreen } from './src/screens/OnboardingScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';

const ONBOARDING_KEY = 'orbit.onboarding.complete';

export default function App() {
  const screen = useEditor((s) => s.screen);
  const refreshProjects = useEditor((s) => s.refreshProjects);
  const loadSettings = useEditor((s) => s.loadSettings);
  const [onboardingReady, setOnboardingReady] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const [fontsLoaded] = useFonts({
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  });

  useEffect(() => {
    loadSettings();
    refreshProjects();
    configurePurchases(); // no-op until a RevenueCat key is set
    // Restore a saved session (token → genClient) so AI works without re-login.
    void useAuth.getState().hydrate();
    void SecureStore.getItemAsync(ONBOARDING_KEY)
      .then((value) => setShowOnboarding(value !== '1'))
      .catch(() => setShowOnboarding(false))
      .finally(() => setOnboardingReady(true));
  }, [loadSettings, refreshProjects]);

  // Hold a flat screen in the app's first-screen colour until fonts are ready,
  // so we never flash unstyled (system-font) text.
  if (!fontsLoaded || !onboardingReady) {
    return <View style={{ flex: 1, backgroundColor: vela.homeBg }} />;
  }

  const finishOnboarding = () => {
    setShowOnboarding(false);
    void SecureStore.setItemAsync(ONBOARDING_KEY, '1');
  };

  if (showOnboarding) {
    return (
      <GestureHandlerRootView style={{ flex: 1 }}>
        <StatusBar style='dark' />
        <OnboardingScreen onContinue={finishOnboarding} />
      </GestureHandlerRootView>
    );
  }

  const isEditor = screen === 'editor';
  const darkTop = isEditor || screen === 'ai';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={darkTop ? 'light' : 'dark'} />
      {isEditor ? <EditorScreen /> : screen === 'discover' ? <DiscoverScreen /> : screen === 'library' ? <MediaLibraryScreen /> : screen === 'ai' ? <AiStudioScreen /> : screen === 'profile' ? <ProfileScreen /> : <HomeScreen />}
    </GestureHandlerRootView>
  );
}
