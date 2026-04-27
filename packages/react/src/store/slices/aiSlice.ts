import type { StateCreator } from 'zustand';
import type { AIMode, AISubMode } from '../types';

export interface AISlice {
  aiMode: AIMode;
  aiSubMode: AISubMode;
  aiPrompt: string;
  aiReferenceImage: string | null;
  aiStrength: number;
  aiDuration: number;
  aiResolution: string;
  aiModel: string;
  isGenerating: boolean;
  aiResults: Array<{ id: string; src: string; thumbnail?: string; type: string }>;

  setAIMode: (mode: AIMode) => void;
  setAISubMode: (subMode: AISubMode) => void;
  setAIPrompt: (prompt: string) => void;
  setAIReferenceImage: (src: string | null) => void;
  setAIStrength: (strength: number) => void;
  setAIDuration: (duration: number) => void;
  setAIResolution: (resolution: string) => void;
  setAIModel: (model: string) => void;
  setIsGenerating: (generating: boolean) => void;
  addAIResult: (result: { id: string; src: string; thumbnail?: string; type: string }) => void;
  clearAIResults: () => void;
}

export const createAISlice: StateCreator<AISlice> = (set) => ({
  aiMode: 'image',
  aiSubMode: 'text-to-image',
  aiPrompt: '',
  aiReferenceImage: null,
  aiStrength: 0.75,
  aiDuration: 5,
  aiResolution: '1080p',
  aiModel: 'gpt-4o',
  isGenerating: false,
  aiResults: [],

  setAIMode: (mode) => set({ aiMode: mode }),
  setAISubMode: (subMode) => set({ aiSubMode: subMode }),
  setAIPrompt: (prompt) => set({ aiPrompt: prompt }),
  setAIReferenceImage: (src) => set({ aiReferenceImage: src }),
  setAIStrength: (strength) => set({ aiStrength: strength }),
  setAIDuration: (duration) => set({ aiDuration: duration }),
  setAIResolution: (resolution) => set({ aiResolution: resolution }),
  setAIModel: (model) => set({ aiModel: model }),
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  addAIResult: (result) =>
    set((s) => ({ aiResults: [result, ...s.aiResults] })),
  clearAIResults: () => set({ aiResults: [] }),
});
