export interface Feedback {
    id: string;
    studentId: string;
    courseId: string;
    rating: number;
    review: string | null;
    createdAt: Date;
    updatedAt: Date;
}
export interface FeedbackWithStudent extends Feedback {
    student: {
        id: string;
        firstName: string;
        lastName: string;
        email: string;
    };
}
export interface CreateFeedbackRequest {
    courseId: string;
    rating: number;
    review?: string | undefined;
}
export interface UpdateFeedbackRequest {
    rating?: number | undefined;
    review?: string | undefined;
}
export interface FeedbackResponse {
    id: string;
    studentId: string;
    courseId: string;
    rating: number;
    review: string | null;
    createdAt: string;
    updatedAt: string;
    student?: {
        id: string;
        name: string;
        email: string;
    };
}
export interface CourseRatingSummary {
    courseId: string;
    averageRating: number;
    totalReviews: number;
    ratingDistribution: {
        1: number;
        2: number;
        3: number;
        4: number;
        5: number;
    };
}
//# sourceMappingURL=types.d.ts.map