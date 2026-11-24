import { useState, useCallback, useMemo } from 'react';
import {
  RubricCategoryScore,
  ReviewAssessmentPayload,
  SignedReviewSubmission,
  calculateWeightedAverage,
  signReviewAssessment,
} from '@/utils/reviewSignature';

export interface UsePeerReviewOptions {
  submissionId: string;
  reviewerAddress: string;
  onSubmitSuccess?: (submission: SignedReviewSubmission) => void;
  onSubmitError?: (error: Error) => void;
  walletSigner?: (message: string) => Promise<string>;
}

export const INITIAL_RUBRIC_CATEGORIES: RubricCategoryScore[] = [
  {
    category: 'codeQuality',
    label: 'Code Quality',
    score: 80,
    weight: 0.35,
    comment: '',
  },
  {
    category: 'security',
    label: 'Security & Auth',
    score: 75,
    weight: 0.40,
    comment: '',
  },
  {
    category: 'tests',
    label: 'Test Coverage',
    score: 70,
    weight: 0.25,
    comment: '',
  },
];

export function usePeerReviewSubmission({
  submissionId,
  reviewerAddress,
  onSubmitSuccess,
  onSubmitError,
  walletSigner,
}: UsePeerReviewOptions) {
  const [categories, setCategories] = useState<RubricCategoryScore[]>(INITIAL_RUBRIC_CATEGORIES);
  const [overallFeedback, setOverallFeedback] = useState('');
  const [status, setStatus] = useState<'idle' | 'signing' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [signedSubmission, setSignedSubmission] = useState<SignedReviewSubmission | null>(null);

  const weightedScore = useMemo(() => calculateWeightedAverage(categories), [categories]);

  const updateScore = useCallback((categoryName: string, newScore: number) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.category === categoryName ? { ...cat, score: Math.max(0, Math.min(100, newScore)) } : cat))
    );
  }, []);

  const updateComment = useCallback((categoryName: string, newComment: string) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.category === categoryName ? { ...cat, comment: newComment } : cat))
    );
  }, []);

  const validationErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    for (const cat of categories) {
      if (!cat.comment || cat.comment.trim().length < 10) {
        errors[cat.category] = `${cat.label} requires a justification comment (minimum 10 characters).`;
      }
    }
    if (!reviewerAddress || reviewerAddress.trim() === '') {
      errors.reviewer = 'Reviewer wallet must be connected.';
    }
    return errors;
  }, [categories, reviewerAddress]);

  const isValid = useMemo(() => Object.keys(validationErrors).length === 0, [validationErrors]);

  const submitReview = useCallback(async () => {
    if (!isValid) {
      setErrorMessage('Please address all rubric justifications before signing.');
      return;
    }

    try {
      setStatus('signing');
      setErrorMessage(null);

      const payload: ReviewAssessmentPayload = {
        submissionId,
        reviewerAddress,
        scores: categories,
        weightedScore,
        overallFeedback,
        timestamp: Date.now(),
      };

      const signed = await signReviewAssessment(payload, walletSigner);
      setStatus('submitting');

      // Emulate backend dispatch / confirmation
      await new Promise((resolve) => setTimeout(resolve, 300));

      setSignedSubmission(signed);
      setStatus('success');
      if (onSubmitSuccess) {
        onSubmitSuccess(signed);
      }
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error(String(err));
      setErrorMessage(error.message);
      setStatus('error');
      if (onSubmitError) {
        onSubmitError(error);
      }
    }
  }, [
    isValid,
    submissionId,
    reviewerAddress,
    categories,
    weightedScore,
    overallFeedback,
    walletSigner,
    onSubmitSuccess,
    onSubmitError,
  ]);

  const reset = useCallback(() => {
    setCategories(INITIAL_RUBRIC_CATEGORIES);
    setOverallFeedback('');
    setStatus('idle');
    setErrorMessage(null);
    setSignedSubmission(null);
  }, []);

  return {
    categories,
    updateScore,
    updateComment,
    overallFeedback,
    setOverallFeedback,
    weightedScore,
    validationErrors,
    isValid,
    status,
    errorMessage,
    signedSubmission,
    submitReview,
    reset,
  };
}

export default usePeerReviewSubmission;
