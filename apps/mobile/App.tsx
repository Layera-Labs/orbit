import { useEffect } from 'react';
import { View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk';
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono';
import { useEditor } from './src/store/editorStore';
import { useAuth } from './src/store/authStore';
import { configurePurchases } from './src/net/purchases';
import { vela } from './src/constants';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { DiscoverScreen } from './src/screens/DiscoverScreen';
import { EditorScreen } from './src/screens/EditorScreen';

export default function App() {
  const screen = useEditor((s) => s.screen);
  const refreshProjects = useEditor((s) => s.refreshProjects);
  const loadSettings = useEditor((s) => s.loadSettings);

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
  }, [loadSettings, refreshProjects]);

  // Hold a flat screen in the app's first-screen colour until fonts are ready,
  // so we never flash unstyled (system-font) text.
  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: vela.homeBg }} />;
  }

  const isEditor = screen === 'editor';
  // Light status-bar text on the dark-topped screens; dark on the light Home.
  const darkTop = isEditor || screen === 'discover';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={darkTop ? 'light' : 'dark'} />
      {isEditor ? (
        <EditorScreen />
      ) : screen === 'discover' ? (
        <DiscoverScreen />
      ) : (
        <ProjectsScreen />
      )}
    </GestureHandlerRootView>
  );
}
