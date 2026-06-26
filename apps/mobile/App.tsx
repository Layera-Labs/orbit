import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useEditor } from './src/store/editorStore';
import { ProjectsScreen } from './src/screens/ProjectsScreen';
import { EditorScreen } from './src/screens/EditorScreen';
import { QuickGenerateScreen } from './src/screens/QuickGenerateScreen';

export default function App() {
  const screen = useEditor((s) => s.screen);
  const refreshProjects = useEditor((s) => s.refreshProjects);
  const loadSettings = useEditor((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
    refreshProjects();
  }, [loadSettings, refreshProjects]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      {screen === 'editor' ? (
        <EditorScreen />
      ) : screen === 'quick' ? (
        <QuickGenerateScreen />
      ) : (
        <ProjectsScreen />
      )}
    </GestureHandlerRootView>
  );
}
