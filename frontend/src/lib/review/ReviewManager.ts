
export interface ReviewRequest {
  id: string;
  title: string;
  description: string;
  author: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  };
  reviewers: {
    id: string;
    name: string;
    email?: string;
    avatar?: string;
  }[];
  code: string;
  language: string;
  status: "pending" | "in_review" | "approved" | "rejected" | "changes_requested";
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  tags: string[];
  priority: "low" | "medium" | "high" | "urgent";
}

export interface ReviewSummary {
  id: string;
  reviewId: string;
  reviewer: {
    id: string;
    name: string;
  };
  status: "pending" | "completed" | "approved" | "rejected" | "changes_requested";
  overallScore: number;
  scores: {
    security: number;
    efficiency: number;
    readability: number;
    maintainability: number;
  };
  comments: string[];
  suggestions: string[];
  approvedAt?: Date;
  submittedAt: Date;
}

export interface ReviewTemplate {
  id: string;
  name: string;
  description: string;
  criteria: {
    name: string;
    description: string;
    weight: number;
    maxScore: number;
  }[];
  defaultComments: string[];
  tags: string[];
}

export class ReviewManager {
  private reviews: Map<string, ReviewRequest> = new Map();
  private summaries: Map<string, ReviewSummary[]> = new Map();
  private templates: Map<string, ReviewTemplate> = new Map();
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.initializeDefaultTemplates();
  }

  // Event listeners
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(listener => listener());
  }

  // Review management
  createReview(review: Omit<ReviewRequest, "id" | "createdAt" | "updatedAt">): ReviewRequest {
    const newReview: ReviewRequest = {
      ...review,
      id: this.generateId(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.reviews.set(newReview.id, newReview);
    this.summaries.set(newReview.id, []);
    this.notify();
    return newReview;
  }

  updateReview(id: string, updates: Partial<ReviewRequest>): ReviewRequest | null {
    const review = this.reviews.get(id);
    if (!review) return null;

    const updatedReview = {
      ...review,
      ...updates,
      updatedAt: new Date(),
    };

    this.reviews.set(id, updatedReview);
    this.notify();
    return updatedReview;
  }

  getReview(id: string): ReviewRequest | null {
    return this.reviews.get(id) || null;
  }

  getAllReviews(): ReviewRequest[] {
    return Array.from(this.reviews.values());
  }

  getReviewsByAuthor(authorId: string): ReviewRequest[] {
    return Array.from(this.reviews.values()).filter(review => review.author.id === authorId);
  }

  getReviewsByReviewer(reviewerId: string): ReviewRequest[] {
    return Array.from(this.reviews.values()).filter(review =>
      review.reviewers.some(reviewer => reviewer.id === reviewerId)
    );
  }

  getReviewsByStatus(status: ReviewRequest["status"]): ReviewRequest[] {
    return Array.from(this.reviews.values()).filter(review => review.status === status);
  }

  deleteReview(id: string): boolean {
    const deleted = this.reviews.delete(id);
    this.summaries.delete(id);
    if (deleted) this.notify();
    return deleted;
  }

  // Review summary management
  createSummary(reviewId: string, summary: Omit<ReviewSummary, "id" | "submittedAt">): ReviewSummary {
    const newSummary: ReviewSummary = {
      ...summary,
      id: this.generateId(),
      submittedAt: new Date(),
    };

    const summaries = this.summaries.get(reviewId) || [];
    summaries.push(newSummary);
    this.summaries.set(reviewId, summaries);

    // Update review status if all reviewers have submitted
    this.updateReviewStatusBasedOnSummaries(reviewId);
    this.notify();
    return newSummary;
  }

  getSummaries(reviewId: string): ReviewSummary[] {
    return this.summaries.get(reviewId) || [];
  }

  getSummary(reviewId: string, summaryId: string): ReviewSummary | null {
    const summaries = this.summaries.get(reviewId) || [];
    return summaries.find(summary => summary.id === summaryId) || null;
  }

  updateSummary(reviewId: string, summaryId: string, updates: Partial<ReviewSummary>): ReviewSummary | null {
    const summaries = this.summaries.get(reviewId) || [];
    const index = summaries.findIndex(summary => summary.id === summaryId);

    if (index === -1) return null;

    const updatedSummary = { ...summaries[index], ...updates };
    summaries[index] = updatedSummary;
    this.summaries.set(reviewId, summaries);

    this.updateReviewStatusBasedOnSummaries(reviewId);
    this.notify();
    return updatedSummary;
  }

  deleteSummary(reviewId: string, summaryId: string): boolean {
    const summaries = this.summaries.get(reviewId) || [];
    const index = summaries.findIndex(summary => summary.id === summaryId);

    if (index === -1) return false;

    summaries.splice(index, 1);
    this.summaries.set(reviewId, summaries);

    this.updateReviewStatusBasedOnSummaries(reviewId);
    this.notify();
    return true;
  }

  // Template management
  createTemplate(template: Omit<ReviewTemplate, "id">): ReviewTemplate {
    const newTemplate: ReviewTemplate = {
      ...template,
      id: this.generateId(),
    };

    this.templates.set(newTemplate.id, newTemplate);
    this.notify();
    return newTemplate;
  }

  getTemplate(id: string): ReviewTemplate | null {
    return this.templates.get(id) || null;
  }

  getAllTemplates(): ReviewTemplate[] {
    return Array.from(this.templates.values());
  }

  updateTemplate(id: string, updates: Partial<ReviewTemplate>): ReviewTemplate | null {
    const template = this.templates.get(id);
    if (!template) return null;

    const updatedTemplate = { ...template, ...updates };
    this.templates.set(id, updatedTemplate);
    this.notify();
    return updatedTemplate;
  }

  deleteTemplate(id: string): boolean {
    const deleted = this.templates.delete(id);
    if (deleted) this.notify();
    return deleted;
  }

  // Helper methods
  private updateReviewStatusBasedOnSummaries(reviewId: string) {
    const review = this.reviews.get(reviewId);
    const summaries = this.summaries.get(reviewId) || [];

    if (!review) return;

    const completedSummaries = summaries.filter(s => s.status === "completed");
    const approvedSummaries = summaries.filter(s => s.status === "approved");
    const rejectedSummaries = summaries.filter(s => s.status === "rejected");

    // If all reviewers have submitted
    if (completedSummaries.length === review.reviewers.length) {
      if (rejectedSummaries.length > 0) {
        review.status = "rejected";
      } else if (approvedSummaries.length === review.reviewers.length) {
        review.status = "approved";
      } else {
        review.status = "changes_requested";
      }
    } else if (completedSummaries.length > 0) {
      review.status = "in_review";
    }

    review.updatedAt = new Date();
    this.reviews.set(reviewId, review);
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private initializeDefaultTemplates() {
    const securityTemplate: ReviewTemplate = {
      id: "security-template",
      name: "Security Review",
      description: "Focus on security vulnerabilities and best practices",
      criteria: [
        {
          name: "Input Validation",
          description: "Proper validation of user inputs",
          weight: 0.3,
          maxScore: 10,
        },
        {
          name: "Access Control",
          description: "Proper authorization and authentication",
          weight: 0.3,
          maxScore: 10,
        },
        {
          name: "Data Protection",
          description: "Encryption and secure data handling",
          weight: 0.2,
          maxScore: 10,
        },
        {
          name: "Error Handling",
          description: "Secure error handling without information leakage",
          weight: 0.2,
          maxScore: 10,
        },
      ],
      defaultComments: [
        "Consider adding input validation here",
        "This could be a security vulnerability",
        "Ensure proper access control is implemented",
      ],
      tags: ["security", "audit", "vulnerability"],
    };

    const codeQualityTemplate: ReviewTemplate = {
      id: "code-quality-template",
      name: "Code Quality Review",
      description: "General code quality and best practices",
      criteria: [
        {
          name: "Readability",
          description: "Code clarity and documentation",
          weight: 0.25,
          maxScore: 10,
        },
        {
          name: "Efficiency",
          description: "Performance and optimization",
          weight: 0.25,
          maxScore: 10,
        },
        {
          name: "Maintainability",
          description: "Code structure and modularity",
          weight: 0.25,
          maxScore: 10,
        },
        {
          name: "Testing",
          description: "Test coverage and quality",
          weight: 0.25,
          maxScore: 10,
        },
      ],
      defaultComments: [
        "Consider refactoring this for better readability",
        "This could be optimized for better performance",
        "Adding tests would improve code quality",
      ],
      tags: ["quality", "best-practices", "refactoring"],
    };

    this.templates.set(securityTemplate.id, securityTemplate);
    this.templates.set(codeQualityTemplate.id, codeQualityTemplate);
  }

  // Analytics and reporting
  getReviewStats() {
    const reviews = Array.from(this.reviews.values());
    const summaries = Array.from(this.summaries.values()).flat();

    return {
      totalReviews: reviews.length,
      pendingReviews: reviews.filter(r => r.status === "pending").length,
      inProgressReviews: reviews.filter(r => r.status === "in_review").length,
      completedReviews: reviews.filter(r =>
        ["approved", "rejected", "changes_requested"].includes(r.status)
      ).length,
      averageReviewTime: this.calculateAverageReviewTime(reviews),
      averageScore: this.calculateAverageScore(summaries),
      topReviewers: this.getTopReviewers(summaries),
    };
  }

  private calculateAverageReviewTime(reviews: ReviewRequest[]): number {
    const completedReviews = reviews.filter(r =>
      ["approved", "rejected", "changes_requested"].includes(r.status)
    );

    if (completedReviews.length === 0) return 0;

    const totalTime = completedReviews.reduce((sum, review) => {
      const summaries = this.summaries.get(review.id) || [];
      if (summaries.length === 0) return sum;

      const firstSummary = summaries[0];
      const reviewTime = firstSummary.submittedAt.getTime() - review.createdAt.getTime();
      return sum + reviewTime;
    }, 0);

    return totalTime / completedReviews.length / (1000 * 60 * 60 * 24); // Convert to days
  }

  private calculateAverageScore(summaries: ReviewSummary[]): number {
    if (summaries.length === 0) return 0;

    const totalScore = summaries.reduce((sum, summary) => sum + summary.overallScore, 0);
    return totalScore / summaries.length;
  }

  private getTopReviewers(summaries: ReviewSummary[]): Array<{ name: string; count: number }> {
    const reviewerCounts = new Map<string, number>();

    summaries.forEach(summary => {
      const count = reviewerCounts.get(summary.reviewer.name) || 0;
      reviewerCounts.set(summary.reviewer.name, count + 1);
    });

    return Array.from(reviewerCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }
}
