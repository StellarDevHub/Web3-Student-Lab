export interface Lesson {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  completed: boolean;
}
export interface Module {
  id: string;
  title: string;
  description: string;
  lessons: Lesson[];
}
export interface Progress {
  userId: string;
  completedLessons: string[];
  currentModule: string;
  percentage: number;
}
//# sourceMappingURL=types.d.ts.map
