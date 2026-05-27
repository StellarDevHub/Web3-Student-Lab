import { create } from 'zustand';
import { devtools, logger } from './middleware';

export interface EditorState {
  content: string;
  language: string;
  theme: string;
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  isDirty: boolean;
  lastSaved: Date | null;
  cursorPosition: { line: number; column: number };
  selectedText: string;
  collaborators: Array<{
    id: string;
    name: string;
    color: string;
    cursor: { line: number; column: number };
  }>;
}

export interface EditorActions {
  setContent: (content: string) => void;
  setLanguage: (language: string) => void;
  setTheme: (theme: string) => void;
  setFontSize: (size: number) => void;
  setWordWrap: (enabled: boolean) => void;
  setMinimap: (enabled: boolean) => void;
  setLineNumbers: (enabled: boolean) => void;
  setDirty: (dirty: boolean) => void;
  setLastSaved: (date: Date) => void;
  setCursorPosition: (position: { line: number; column: number }) => void;
  setSelectedText: (text: string) => void;
  addCollaborator: (collaborator: EditorState['collaborators'][0]) => void;
  removeCollaborator: (id: string) => void;
  updateCollaboratorCursor: (id: string, cursor: { line: number; column: number }) => void;
  reset: () => void;
}

export type EditorStore = EditorState & EditorActions;

const initialState: EditorState = {
  content: '',
  language: 'typescript',
  theme: 'vs-dark',
  fontSize: 14,
  wordWrap: true,
  minimap: true,
  lineNumbers: true,
  isDirty: false,
  lastSaved: null,
  cursorPosition: { line: 1, column: 1 },
  selectedText: '',
  collaborators: [],
};

export const useEditorStore = create<EditorStore>()(
  devtools(
    logger(
      (set, get) => ({
        ...initialState,

        setContent: (content: string) => {
          const currentContent = get().content;
          if (currentContent !== content) {
            set({ content, isDirty: true });
          }
        },

        setLanguage: (language: string) => set({ language }),

        setTheme: (theme: string) => set({ theme }),

        setFontSize: (fontSize: number) => set({ fontSize }),

        setWordWrap: (wordWrap: boolean) => set({ wordWrap }),

        setMinimap: (minimap: boolean) => set({ minimap }),

        setLineNumbers: (lineNumbers: boolean) => set({ lineNumbers }),

        setDirty: (isDirty: boolean) => set({ isDirty }),

        setLastSaved: (lastSaved: Date) => set({ lastSaved, isDirty: false }),

        setCursorPosition: (cursorPosition: { line: number; column: number }) =>
          set({ cursorPosition }),

        setSelectedText: (selectedText: string) => set({ selectedText }),

        addCollaborator: (collaborator: EditorState['collaborators'][0]) => {
          const collaborators = get().collaborators;
          const exists = collaborators.find((c) => c.id === collaborator.id);
          if (!exists) {
            set({ collaborators: [...collaborators, collaborator] });
          }
        },

        removeCollaborator: (id: string) => {
          const collaborators = get().collaborators;
          set({ collaborators: collaborators.filter((c) => c.id !== id) });
        },

        updateCollaboratorCursor: (id: string, cursor: { line: number; column: number }) => {
          const collaborators = get().collaborators;
          set({
            collaborators: collaborators.map((c) => (c.id === id ? { ...c, cursor } : c)),
          });
        },

        reset: () => set(initialState),
      }),
      { name: 'editor-store', enabled: true }
    ),
    { name: 'editor-devtools', enabled: true }
  )
);

// Selectors for optimized re-renders
export const useEditor = () => {
  const store = useEditorStore();

  return {
    // Editor state
    content: store.content,
    language: store.language,
    theme: store.theme,
    fontSize: store.fontSize,
    wordWrap: store.wordWrap,
    minimap: store.minimap,
    lineNumbers: store.lineNumbers,
    isDirty: store.isDirty,
    lastSaved: store.lastSaved,
    cursorPosition: store.cursorPosition,
    selectedText: store.selectedText,
    collaborators: store.collaborators,

    // Editor actions
    setContent: store.setContent,
    setLanguage: store.setLanguage,
    setTheme: store.setTheme,
    setFontSize: store.setFontSize,
    setWordWrap: store.setWordWrap,
    setMinimap: store.setMinimap,
    setLineNumbers: store.setLineNumbers,
    setDirty: store.setDirty,
    setLastSaved: store.setLastSaved,
    setCursorPosition: store.setCursorPosition,
    setSelectedText: store.setSelectedText,
    addCollaborator: store.addCollaborator,
    removeCollaborator: store.removeCollaborator,
    updateCollaboratorCursor: store.updateCollaboratorCursor,
    reset: store.reset,
  };
};

// Selective selectors
export const useEditorContent = () => useEditorStore((state) => state.content);
export const useEditorLanguage = () => useEditorStore((state) => state.language);
export const useEditorTheme = () => useEditorStore((state) => state.theme);
export const useEditorIsDirty = () => useEditorStore((state) => state.isDirty);
export const useEditorCollaborators = () => useEditorStore((state) => state.collaborators);
