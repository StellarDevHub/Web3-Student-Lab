import { Feedback, FeedbackWithStudent, CreateFeedbackRequest, UpdateFeedbackRequest, FeedbackResponse, CourseRatingSummary } from './types.js';
/**
 * Format a feedback database record into a response object
 */
export declare const formatFeedbackResponse: (feedback: FeedbackWithStudent | Feedback) => FeedbackResponse;
/**
 * Create new feedback for a course
 */
export declare const createFeedback: (studentId: string, data: CreateFeedbackRequest) => Promise<FeedbackResponse>;
/**
 * Get all feedback for a specific course
 */
export declare const getFeedbackByCourse: (courseId: string) => Promise<FeedbackResponse[]>;
/**
 * Get feedback by a specific student for a specific course
 */
export declare const getFeedbackByStudentAndCourse: (studentId: string, courseId: string) => Promise<FeedbackResponse | null>;
/**
 * Update existing feedback
 */
export declare const updateFeedback: (studentId: string, courseId: string, data: UpdateFeedbackRequest) => Promise<FeedbackResponse>;
/**
 * Delete feedback
 */
export declare const deleteFeedback: (studentId: string, courseId: string) => Promise<void>;
/**
 * Get rating summary for a course
 */
export declare const getCourseRatingSummary: (courseId: string) => Promise<CourseRatingSummary>;
//# sourceMappingURL=feedback.service.d.ts.map