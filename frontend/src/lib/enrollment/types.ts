export interface CourseSelection {
  selectedCourseId: string;
  selectedCourseTitle: string;
  selectedCourseCredits: number;
}

export interface PrerequisiteCheck {
  completedCourses: string[];
  skillAssessmentScore: number;
  prepMaterialsViewed: boolean;
  hasRequiredSkills: boolean;
}

export interface LearningGoals {
  objectives: string[];
  pace: 'intensive' | 'moderate' | 'relaxed';
  milestones: string[];
  estimatedHoursPerWeek: number;
}

export interface StudySchedule {
  preferredDays: (
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday'
    | 'sunday'
  )[];
  preferredTimeStart: string;
  preferredTimeEnd: string;
  targetCompletionDate: string;
}

export interface Confirmation {
  termsAccepted: boolean;
  emailConfirmed: boolean;
  paymentMethod?: string;
  specialRequirements?: string;
}

export interface EnrollmentWizardState {
  currentStep: number;
  totalSteps: 5;
  isComplete: boolean;
  steps: {
    step1_courseSelection: CourseSelection;
    step2_prerequisites: PrerequisiteCheck;
    step3_goals: LearningGoals;
    step4_schedule: StudySchedule;
    step5_confirmation: Confirmation;
  };
  validationErrors: Record<string, string[]>;
  lastSaved: string;
}

export interface CourseWithPrerequisites {
  id: string;
  title: string;
  description?: string;
  instructor: string;
  credits: number;
  prerequisites: string[];
  estimatedHours: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export const INITIAL_WIZARD_STATE: EnrollmentWizardState = {
  currentStep: 1,
  totalSteps: 5,
  isComplete: false,
  steps: {
    step1_courseSelection: {
      selectedCourseId: '',
      selectedCourseTitle: '',
      selectedCourseCredits: 0,
    },
    step2_prerequisites: {
      completedCourses: [],
      skillAssessmentScore: 0,
      prepMaterialsViewed: false,
      hasRequiredSkills: false,
    },
    step3_goals: {
      objectives: [],
      pace: 'moderate',
      milestones: [],
      estimatedHoursPerWeek: 5,
    },
    step4_schedule: {
      preferredDays: [],
      preferredTimeStart: '09:00',
      preferredTimeEnd: '17:00',
      targetCompletionDate: '',
    },
    step5_confirmation: {
      termsAccepted: false,
      emailConfirmed: false,
    },
  },
  validationErrors: {},
  lastSaved: new Date().toISOString(),
};

export type WizardStep = 1 | 2 | 3 | 4 | 5;

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export const PACE_OPTIONS = [
  { value: 'intensive', label: 'Intensive', description: '20+ hours/week', multiplier: 2 },
  { value: 'moderate', label: 'Moderate', description: '8-12 hours/week', multiplier: 1 },
  { value: 'relaxed', label: 'Relaxed', description: '4-6 hours/week', multiplier: 0.5 },
] as const;

export const DAYS_OF_WEEK = [
  { value: 'monday', label: 'Mon', fullLabel: 'Monday' },
  { value: 'tuesday', label: 'Tue', fullLabel: 'Tuesday' },
  { value: 'wednesday', label: 'Wed', fullLabel: 'Wednesday' },
  { value: 'thursday', label: 'Thu', fullLabel: 'Thursday' },
  { value: 'friday', label: 'Fri', fullLabel: 'Friday' },
  { value: 'saturday', label: 'Sat', fullLabel: 'Saturday' },
  { value: 'sunday', label: 'Sun', fullLabel: 'Sunday' },
] as const;

export const LEARNING_OBJECTIVES = [
  'Build production-ready smart contracts',
  'Understand blockchain fundamentals',
  'Develop decentralized applications',
  'Master Soroban framework',
  'Integrate with Stellar ecosystem',
  'Create tokenomics models',
  'Implement secure contracts',
  'Deploy to testnet/mainnet',
] as const;

export const MILESTONE_OPTIONS = [
  'Complete first module within 1 week',
  'Build first smart contract within 2 weeks',
  'Pass mid-term assessment',
  'Submit capstone project',
  'Obtain certification',
  'Deploy to mainnet',
] as const;
