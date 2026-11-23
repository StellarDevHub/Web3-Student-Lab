import { create } from 'zustand';
import { devtools, logger, securePersist } from './middleware';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  language: string;
  notifications: {
    email: boolean;
    push: boolean;
    desktop: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'private' | 'friends';
    showOnlineStatus: boolean;
    shareProgress: boolean;
  };
  editor: {
    fontSize: number;
    fontFamily: string;
    tabSize: number;
    wordWrap: boolean;
    minimap: boolean;
  };
}

export interface UserStats {
  coursesCompleted: number;
  certificatesEarned: number;
  totalStudyTime: number; // in minutes
  streakDays: number;
  lastActiveDate: string | null;
  achievements: Array<{
    id: string;
    title: string;
    description: string;
    earnedAt: string;
    icon: string;
  }>;
  progress: {
    overall: number; // 0-100
    byCategory: Record<string, number>;
  };
}

export interface UserState {
  preferences: UserPreferences;
  stats: UserStats;
  profile: {
    displayName: string;
    avatar: string | null;
    bio: string | null;
    location: string | null;
    website: string | null;
    socialLinks: {
      github?: string;
      twitter?: string;
      linkedin?: string;
    };
  };
  learningPath: {
    currentCourse: string | null;
    completedModules: string[];
    bookmarks: Array<{
      id: string;
      type: 'lesson' | 'exercise' | 'resource';
      title: string;
      url: string;
      addedAt: string;
      tags?: string[];
    }>;
    notes: Array<{
      id: string;
      courseId: string;
      lessonId: string;
      content: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
}

export interface UserActions {
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  updateStats: (stats: Partial<UserStats>) => void;
  updateProfile: (profile: Partial<UserState['profile']>) => void;
  addAchievement: (achievement: UserStats['achievements'][0]) => void;
  setCurrentCourse: (courseId: string) => void;
  completeModule: (moduleId: string) => void;
  addBookmark: (
    bookmark: Omit<UserState['learningPath']['bookmarks'][0], 'id' | 'addedAt'>
  ) => void;
  removeBookmark: (bookmarkId: string) => void;
  addNote: (
    note: Omit<UserState['learningPath']['notes'][0], 'id' | 'createdAt' | 'updatedAt'>
  ) => void;
  updateNote: (noteId: string, content: string) => void;
  deleteNote: (noteId: string) => void;
  incrementStudyTime: (minutes: number) => void;
  updateStreak: () => void;
}

export type UserStore = UserState & UserActions;

const initialState: UserState = {
  preferences: {
    theme: 'system',
    language: 'en',
    notifications: {
      email: true,
      push: true,
      desktop: false,
    },
    privacy: {
      profileVisibility: 'public',
      showOnlineStatus: true,
      shareProgress: true,
    },
    editor: {
      fontSize: 14,
      fontFamily: 'monospace',
      tabSize: 2,
      wordWrap: true,
      minimap: true,
    },
  },
  stats: {
    coursesCompleted: 0,
    certificatesEarned: 0,
    totalStudyTime: 0,
    streakDays: 0,
    lastActiveDate: null,
    achievements: [],
    progress: {
      overall: 0,
      byCategory: {},
    },
  },
  profile: {
    displayName: '',
    avatar: null,
    bio: null,
    location: null,
    website: null,
    socialLinks: {},
  },
  learningPath: {
    currentCourse: null,
    completedModules: [],
    bookmarks: [],
    notes: [],
  },
};

export const useUserStore = create<UserStore>()(
  devtools(
    logger(
      securePersist(
        (set, get) => ({
          ...initialState,

          updatePreferences: (preferences) => {
            const currentPreferences = get().preferences;
            set({ preferences: { ...currentPreferences, ...preferences } });
          },

          updateStats: (stats) => {
            const currentStats = get().stats;
            set({ stats: { ...currentStats, ...stats } });
          },

          updateProfile: (profile) => {
            const currentProfile = get().profile;
            set({ profile: { ...currentProfile, ...profile } });
          },

          addAchievement: (achievement) => {
            const currentAchievements = get().stats.achievements;
            const exists = currentAchievements.find((a) => a.id === achievement.id);
            if (!exists) {
              set({
                stats: {
                  ...get().stats,
                  achievements: [...currentAchievements, achievement],
                },
              });
            }
          },

          setCurrentCourse: (courseId) => {
            set({
              learningPath: {
                ...get().learningPath,
                currentCourse: courseId,
              },
            });
          },

          completeModule: (moduleId) => {
            const completedModules = get().learningPath.completedModules;
            if (!completedModules.includes(moduleId)) {
              set({
                learningPath: {
                  ...get().learningPath,
                  completedModules: [...completedModules, moduleId],
                },
              });
            }
          },

          addBookmark: (bookmark) => {
            const bookmarks = get().learningPath.bookmarks;
            const newBookmark = {
              ...bookmark,
              id: `bookmark_${Date.now()}`,
              addedAt: new Date().toISOString(),
            };
            set({
              learningPath: {
                ...get().learningPath,
                bookmarks: [...bookmarks, newBookmark],
              },
            });
          },

          removeBookmark: (bookmarkId) => {
            const bookmarks = get().learningPath.bookmarks;
            set({
              learningPath: {
                ...get().learningPath,
                bookmarks: bookmarks.filter((b) => b.id !== bookmarkId),
              },
            });
          },

          addNote: (note) => {
            const notes = get().learningPath.notes;
            const newNote = {
              ...note,
              id: `note_${Date.now()}`,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            };
            set({
              learningPath: {
                ...get().learningPath,
                notes: [...notes, newNote],
              },
            });
          },

          updateNote: (noteId, content) => {
            const notes = get().learningPath.notes;
            set({
              learningPath: {
                ...get().learningPath,
                notes: notes.map((note) =>
                  note.id === noteId
                    ? { ...note, content, updatedAt: new Date().toISOString() }
                    : note
                ),
              },
            });
          },

          deleteNote: (noteId) => {
            const notes = get().learningPath.notes;
            set({
              learningPath: {
                ...get().learningPath,
                notes: notes.filter((note) => note.id !== noteId),
              },
            });
          },

          incrementStudyTime: (minutes) => {
            const currentStudyTime = get().stats.totalStudyTime;
            set({
              stats: {
                ...get().stats,
                totalStudyTime: currentStudyTime + minutes,
                lastActiveDate: new Date().toISOString(),
              },
            });
          },

          updateStreak: () => {
            const today = new Date().toDateString();
            const lastActive = get().stats.lastActiveDate;
            const currentStreak = get().stats.streakDays;

            if (lastActive) {
              const lastActiveDate = new Date(lastActive);
              const daysDiff = Math.floor(
                (Date.now() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24)
              );

              if (daysDiff === 1) {
                // Consecutive day
                set({
                  stats: {
                    ...get().stats,
                    streakDays: currentStreak + 1,
                    lastActiveDate: new Date().toISOString(),
                  },
                });
              } else if (daysDiff > 1) {
                // Streak broken
                set({
                  stats: {
                    ...get().stats,
                    streakDays: 1,
                    lastActiveDate: new Date().toISOString(),
                  },
                });
              }
            } else {
              // First activity
              set({
                stats: {
                  ...get().stats,
                  streakDays: 1,
                  lastActiveDate: new Date().toISOString(),
                },
              });
            }
          },
        }),
        {
          name: 'user-storage',
          exclude: [], // Persist all user data
        }
      ),
      { name: 'user-store', enabled: true }
    ),
    { name: 'user-devtools', enabled: true }
  )
);

// Selectors for optimized re-renders
export const useUser = () => {
  const store = useUserStore();

  return {
    // User state
    preferences: store.preferences,
    stats: store.stats,
    profile: store.profile,
    learningPath: store.learningPath,

    // User actions
    updatePreferences: store.updatePreferences,
    updateStats: store.updateStats,
    updateProfile: store.updateProfile,
    addAchievement: store.addAchievement,
    setCurrentCourse: store.setCurrentCourse,
    completeModule: store.completeModule,
    addBookmark: store.addBookmark,
    removeBookmark: store.removeBookmark,
    addNote: store.addNote,
    updateNote: store.updateNote,
    deleteNote: store.deleteNote,
    incrementStudyTime: store.incrementStudyTime,
    updateStreak: store.updateStreak,
  };
};

// Selective selectors
export const useUserPreferences = () => useUserStore((state) => state.preferences);
export const useUserStats = () => useUserStore((state) => state.stats);
export const useUserProfile = () => useUserStore((state) => state.profile);
export const useUserLearningPath = () => useUserStore((state) => state.learningPath);
export const useUserTheme = () => useUserStore((state) => state.preferences.theme);
export const useUserBookmarks = () => useUserStore((state) => state.learningPath.bookmarks);
export const useUserNotes = () => useUserStore((state) => state.learningPath.notes);
