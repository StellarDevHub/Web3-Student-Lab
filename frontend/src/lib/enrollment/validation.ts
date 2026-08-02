import {
  CourseSelection,
  PrerequisiteCheck,
  LearningGoals,
  StudySchedule,
  Confirmation,
  ValidationResult,
  CourseWithPrerequisites,
} from './types';

export const validationRules = {
  courseSelection: (data: CourseSelection): ValidationResult => {
    const errors: string[] = [];

    if (!data.selectedCourseId) {
      errors.push('Please select a course to continue');
    }

    if (!data.selectedCourseTitle) {
      errors.push('Course title is required');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  prerequisites: (
    data: PrerequisiteCheck,
    course?: CourseWithPrerequisites,
    completedCourseIds?: string[]
  ): ValidationResult => {
    const errors: string[] = [];

    if (course?.prerequisites && course.prerequisites.length > 0) {
      const missingPrereqs = course.prerequisites.filter(
        (prereq) => !completedCourseIds?.includes(prereq)
      );

      if (missingPrereqs.length > 0 && !data.hasRequiredSkills) {
        errors.push(
          `Missing prerequisites: ${missingPrereqs.join(', ')}. Please complete these courses or pass the skill assessment.`
        );
      }
    }

    if (data.skillAssessmentScore > 0 && data.skillAssessmentScore < 60) {
      errors.push('Skill assessment score must be at least 60% to proceed without prerequisites');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  goals: (data: LearningGoals): ValidationResult => {
    const errors: string[] = [];

    if (data.objectives.length === 0) {
      errors.push('Select at least one learning objective');
    }

    if (data.objectives.length > 5) {
      errors.push('Maximum 5 learning objectives allowed');
    }

    if (!data.pace) {
      errors.push('Please select a learning pace');
    }

    if (data.estimatedHoursPerWeek < 1 || data.estimatedHoursPerWeek > 40) {
      errors.push('Weekly study hours must be between 1 and 40');
    }

    if (data.milestones.length === 0) {
      errors.push('Select at least one milestone');
    }

    if (data.milestones.length > 4) {
      errors.push('Maximum 4 milestones allowed');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  schedule: (data: StudySchedule): ValidationResult => {
    const errors: string[] = [];

    if (data.preferredDays.length === 0) {
      errors.push('Select at least one preferred study day');
    }

    if (data.preferredDays.length > 7) {
      errors.push('Invalid number of days selected');
    }

    const startTime = parseTime(data.preferredTimeStart);
    const endTime = parseTime(data.preferredTimeEnd);

    if (startTime >= endTime) {
      errors.push('End time must be after start time');
    }

    const minDuration = 30;
    if (endTime - startTime < minDuration) {
      errors.push('Study session must be at least 30 minutes');
    }

    if (!data.targetCompletionDate) {
      errors.push('Please set a target completion date');
    } else {
      const targetDate = new Date(data.targetCompletionDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (targetDate <= today) {
        errors.push('Target completion date must be in the future');
      }

      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 2);
      if (targetDate > maxDate) {
        errors.push('Target completion date cannot be more than 2 years in the future');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },

  confirmation: (data: Confirmation): ValidationResult => {
    const errors: string[] = [];

    if (!data.termsAccepted) {
      errors.push('You must accept the terms and conditions');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  },
};

function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

export function hasTimeConflict(
  selectedDays: string[],
  existingSchedule: Array<{ days: string[]; startTime: string; endTime: string }>
): boolean {
  for (const existing of existingSchedule) {
    const dayOverlap = selectedDays.some((day) => existing.days.includes(day));
    if (dayOverlap) {
      return true;
    }
  }
  return false;
}

export function isAchievable(
  goals: LearningGoals,
  courseHours: number,
  schedule: StudySchedule
): boolean {
  const weeksUntilCompletion = Math.ceil(
    (new Date(schedule.targetCompletionDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 7)
  );

  if (weeksUntilCompletion <= 0) return false;

  const availableHoursPerWeek = schedule.preferredDays.length * goals.estimatedHoursPerWeek;
  const totalAvailableHours = weeksUntilCompletion * availableHoursPerWeek;

  return totalAvailableHours >= courseHours;
}

export function validateStep(
  step: number,
  data: EnrollmentWizardState['steps'],
  course?: CourseWithPrerequisites,
  completedCourseIds?: string[]
): ValidationResult {
  switch (step) {
    case 1:
      return validationRules.courseSelection(data.step1_courseSelection);
    case 2:
      return validationRules.prerequisites(data.step2_prerequisites, course, completedCourseIds);
    case 3:
      return validationRules.goals(data.step3_goals);
    case 4:
      return validationRules.schedule(data.step4_schedule);
    case 5:
      return validationRules.confirmation(data.step5_confirmation);
    default:
      return { isValid: false, errors: ['Invalid step'] };
  }
}
