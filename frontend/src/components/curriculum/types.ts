export interface LessonItem {
  id: string;
  title: string;
  slug: string;
  status: 'completed' | 'in_progress' | 'locked';
}

export interface ModuleItem {
  id: string;
  title: string;
  lessons: LessonItem[];
}
