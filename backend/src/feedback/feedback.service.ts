import prisma from '../db/index.js';
import {
  Feedback,
  FeedbackWithStudent,
  CreateFeedbackRequest,
  UpdateFeedbackRequest,
  FeedbackResponse,
  CourseRatingSummary,
} from './types.js';

const MIN_RATING = 1;
const MAX_RATING = 5;

/**
 * Validate rating value
 */
const validateRating = (rating: number): void => {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw new Error(
      `Rating must be an integer between ${MIN_RATING} and ${MAX_RATING}`
    );
  }
};

/**
 * Format a feedback database record into a response object
 */
export const formatFeedbackResponse = (
  feedback: FeedbackWithStudent | Feedback
): FeedbackResponse => {
  const response: FeedbackResponse = {
    id: feedback.id,
    studentId: feedback.studentId,
    courseId: feedback.courseId,
    rating: feedback.rating,
    review: feedback.review,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };

  // Include student info if available
  if ('student' in feedback && feedback.student) {
    response.student = {
      id: feedback.student.id,
      name: `${feedback.student.firstName} ${feedback.student.lastName}`,
      email: feedback.student.email,
    };
  }

  return response;
};

/**
 * Create new feedback for a course
 */
export const createFeedback = async (
  studentId: string,
  data: CreateFeedbackRequest
): Promise<FeedbackResponse> => {
  const { courseId, rating, review } = data;

  // Validate rating
  validateRating(rating);

  // Validate review length if provided
  if (review && review.length > 1000) {
    throw new Error('Review must be less than 1000 characters');
  }

  // Check if course exists
  const course = await prisma.course.findUnique({
    where: { id: courseId },
  });

  if (!course) {
    throw new Error('Course not found');
  }

  // Check if student is enrolled in the course
  const enrollment = await prisma.enrollment.findUnique({
    where: {
      studentId_courseId: {
        studentId,
        courseId,
      },
    },
  });

  if (!enrollment) {
    throw new Error(
      'Student must be enrolled in the course to submit feedback'
    );
  }

  // Create or update feedback (upsert)
  const feedback = await prisma.feedback.upsert({
    where: {
      studentId_courseId: {
        studentId,
        courseId,
      },
    },
    update: {
      rating,
      review: review || null,
    },
    create: {
      studentId,
      courseId,
      rating,
      review: review || null,
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return formatFeedbackResponse(feedback);
};

/**
 * Get all feedback for a specific course
 */
export const getFeedbackByCourse = async (
  courseId: string
): Promise<FeedbackResponse[]> => {
  // Check if course exists
  const course = await prisma.course.findUnique({
    where: { id: courseId },
  });

  if (!course) {
    throw new Error('Course not found');
  }

  const feedback = await prisma.feedback.findMany({
    where: { courseId },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  });

  return feedback.map(formatFeedbackResponse);
};

/**
 * Get feedback by a specific student for a specific course
 */
export const getFeedbackByStudentAndCourse = async (
  studentId: string,
  courseId: string
): Promise<FeedbackResponse | null> => {
  const feedback = await prisma.feedback.findUnique({
    where: {
      studentId_courseId: {
        studentId,
        courseId,
      },
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  if (!feedback) {
    return null;
  }

  return formatFeedbackResponse(feedback);
};

/**
 * Update existing feedback
 */
export const updateFeedback = async (
  studentId: string,
  courseId: string,
  data: UpdateFeedbackRequest
): Promise<FeedbackResponse> => {
  const { rating, review } = data;

  // Validate rating if provided
  if (rating !== undefined) {
    validateRating(rating);
  }

  // Validate review length if provided
  if (review && review.length > 1000) {
    throw new Error('Review must be less than 1000 characters');
  }

  // Check if feedback exists
  const existingFeedback = await prisma.feedback.findUnique({
    where: {
      studentId_courseId: {
        studentId,
        courseId,
      },
    },
  });

  if (!existingFeedback) {
    throw new Error('Feedback not found');
  }

  const feedback = await prisma.feedback.update({
    where: {
      studentId_courseId: {
        studentId,
        courseId,
      },
    },
    data: {
      ...(rating !== undefined && { rating }),
      ...(review !== undefined && { review: review || null }),
    },
    include: {
      student: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
  });

  return formatFeedbackResponse(feedback);
};

/**
 * Delete feedback
 */
export const deleteFeedback = async (
  studentId: string,
  courseId: string
): Promise<void> => {
  // Check if feedback exists
  const existingFeedback = await prisma.feedback.findUnique({
    where: {
      studentId_courseId: {
        studentId,
        courseId,
      },
    },
  });

  if (!existingFeedback) {
    throw new Error('Feedback not found');
  }

  await prisma.feedback.delete({
    where: {
      studentId_courseId: {
        studentId,
        courseId,
      },
    },
  });
};

/**
 * Get rating summary for a course
 */
export const getCourseRatingSummary = async (
  courseId: string
): Promise<CourseRatingSummary> => {
  // Check if course exists
  const course = await prisma.course.findUnique({
    where: { id: courseId },
  });

  if (!course) {
    throw new Error('Course not found');
  }

  const feedback = await prisma.feedback.findMany({
    where: { courseId },
    select: { rating: true },
  });

  const totalReviews = feedback.length;

  if (totalReviews === 0) {
    return {
      courseId,
      averageRating: 0,
      totalReviews: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  const sum = feedback.reduce(
    (acc: number, f: { rating: number }) => acc + f.rating,
    0
  );
  const averageRating = sum / totalReviews;

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  feedback.forEach((f: { rating: number }) => {
    distribution[f.rating as keyof typeof distribution]++;
  });

  return {
    courseId,
    averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
    totalReviews,
    ratingDistribution: distribution,
  };
};
