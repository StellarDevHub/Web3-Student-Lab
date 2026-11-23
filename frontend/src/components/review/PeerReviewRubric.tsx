'use client';

import React, { useMemo } from 'react';
import {
  ShieldAlert,
  Code2,
  CheckCircle2,
  KeyRound,
  AlertCircle,
  Check,
  Loader2,
  FileCheck,
} from 'lucide-react';
import {
  usePeerReviewSubmission,
  UsePeerReviewOptions,
} from '@/hooks/usePeerReviewSubmission';
import { RubricCategoryScore, SignedReviewSubmission } from '@/utils/reviewSignature';

export interface PeerReviewRubricProps {
  submissionId: string;
  reviewerAddress: string;
  submissionTitle?: string;
  onSubmitSuccess?: (submission: SignedReviewSubmission) => void;
  onSubmitError?: (error: Error) => void;
  walletSigner?: (message: string) => Promise<string>;
  className?: string;
}

/**
 * High-performance SVG Radar Chart for visual score distribution.
 * Time Complexity: O(K) where K is category count.
 * Space Complexity: O(K).
 */
export function RadarChart({
  categories,
  size = 280,
}: {
  categories: RubricCategoryScore[];
  size?: number;
}) {
  const center = size / 2;
  const radius = center - 40;
  const count = categories.length;

  const points = useMemo(() => {
    return categories.map((cat, index) => {
      const angle = (Math.PI * 2 / count) * index - Math.PI / 2;
      const normalizedScore = Math.max(0, Math.min(100, cat.score)) / 100;
      const r = radius * normalizedScore;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      const labelX = center + (radius + 24) * Math.cos(angle);
      const labelY = center + (radius + 24) * Math.sin(angle);
      return { x, y, labelX, labelY, cat, angle };
    });
  }, [categories, center, radius, count]);

  const polygonPath = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Grid levels (25%, 50%, 75%, 100%)
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col items-center justify-center p-2" data-testid="rubric-radar-chart">
      <svg width={size} height={size} className="overflow-visible">
        {/* Background Web Grid */}
        {gridLevels.map((lvl) => {
          const gridPoints = categories.map((_, i) => {
            const angle = (Math.PI * 2 / count) * i - Math.PI / 2;
            const r = radius * lvl;
            return `${center + r * Math.cos(angle)},${center + r * Math.sin(angle)}`;
          }).join(' ');
          return (
            <polygon
              key={`grid-${lvl}`}
              points={gridPoints}
              fill="none"
              stroke="rgba(255, 255, 255, 0.1)"
              strokeDasharray={lvl < 1 ? '3 3' : 'none'}
              strokeWidth={lvl === 1 ? 1.5 : 1}
            />
          );
        })}

        {/* Spokes */}
        {categories.map((_, i) => {
          const angle = (Math.PI * 2 / count) * i - Math.PI / 2;
          const x2 = center + radius * Math.cos(angle);
          const y2 = center + radius * Math.sin(angle);
          return (
            <line
              key={`spoke-${i}`}
              x1={center}
              y1={center}
              x2={x2}
              y2={y2}
              stroke="rgba(255, 255, 255, 0.15)"
              strokeWidth={1}
            />
          );
        })}

        {/* Filled Data Polygon */}
        <polygon
          points={polygonPath}
          fill="rgba(239, 68, 68, 0.35)"
          stroke="#ef4444"
          strokeWidth={2.5}
          className="transition-all duration-300 ease-out"
        />

        {/* Score Nodes */}
        {points.map((p, i) => (
          <circle
            key={`node-${i}`}
            cx={p.x}
            cy={p.y}
            r={4.5}
            fill="#ffffff"
            stroke="#ef4444"
            strokeWidth={2}
          />
        ))}

        {/* Category Labels */}
        {points.map((p, i) => (
          <text
            key={`label-${i}`}
            x={p.labelX}
            y={p.labelY}
            textAnchor="middle"
            dominantBaseline="central"
            className="text-[11px] font-mono font-medium fill-zinc-300"
          >
            {p.cat.label} ({p.cat.score})
          </text>
        ))}
      </svg>
    </div>
  );
}

export function PeerReviewRubric({
  submissionId,
  reviewerAddress,
  submissionTitle = 'Soroban Smart Contract Submission',
  onSubmitSuccess,
  onSubmitError,
  walletSigner,
  className = '',
}: PeerReviewRubricProps) {
  const {
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
  } = usePeerReviewSubmission({
    submissionId,
    reviewerAddress,
    onSubmitSuccess,
    onSubmitError,
    walletSigner,
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security':
        return <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />;
      case 'tests':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />;
      case 'codeQuality':
      default:
        return <Code2 className="h-4 w-4 text-blue-400" aria-hidden="true" />;
    }
  };

  return (
    <div
      className={`rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-white shadow-xl ${className}`}
      data-testid="peer-review-rubric"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-zinc-800 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <FileCheck className="h-5 w-5 text-red-500" aria-hidden="true" />
            <h2 className="text-lg font-bold tracking-tight">Interactive Rubric Assessment</h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Evaluating: <span className="font-semibold text-zinc-200">{submissionTitle}</span> · #{submissionId}
          </p>
        </div>

        {/* Weighted Score Badge */}
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2">
          <div className="text-right">
            <div className="text-[10px] font-mono uppercase tracking-wider text-zinc-500">
              Weighted Score
            </div>
            <div
              className={`text-xl font-black font-mono ${
                weightedScore >= 80
                  ? 'text-emerald-400'
                  : weightedScore >= 60
                  ? 'text-amber-400'
                  : 'text-red-400'
              }`}
            >
              {weightedScore} / 100
            </div>
          </div>
        </div>
      </div>

      {/* Grid: Form Sliders vs Radar Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 my-6">
        {/* Sliders & Justifications */}
        <div className="lg:col-span-7 space-y-6">
          {categories.map((cat) => {
            const hasError = Boolean(validationErrors[cat.category]);
            return (
              <div
                key={cat.category}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 transition hover:border-zinc-700"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(cat.category)}
                    <label
                      htmlFor={`slider-${cat.category}`}
                      className="text-sm font-semibold text-zinc-200"
                    >
                      {cat.label}
                    </label>
                    <span className="text-[10px] font-mono text-zinc-500">
                      ({Math.round(cat.weight * 100)}% weight)
                    </span>
                  </div>
                  <span className="font-mono text-sm font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded">
                    {cat.score}
                  </span>
                </div>

                {/* Score Slider */}
                <input
                  id={`slider-${cat.category}`}
                  type="range"
                  min={0}
                  max={100}
                  value={cat.score}
                  onChange={(e) => updateScore(cat.category, Number(e.target.value))}
                  className="w-full accent-red-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
                  data-testid={`slider-${cat.category}`}
                />

                {/* Mandatory Comment Justification */}
                <div className="mt-3">
                  <label
                    htmlFor={`comment-${cat.category}`}
                    className="block text-[11px] font-medium text-zinc-400 mb-1"
                  >
                    Score Justification <span className="text-red-400">*</span>
                  </label>
                  <textarea
                    id={`comment-${cat.category}`}
                    rows={2}
                    value={cat.comment}
                    onChange={(e) => updateComment(cat.category, e.target.value)}
                    placeholder={`Explain the rationale for ${cat.score}/100 in ${cat.label}... (min 10 chars)`}
                    className={`w-full rounded-lg border bg-zinc-950 px-3 py-2 text-xs text-zinc-200 outline-none transition ${
                      hasError ? 'border-red-500/60 focus:border-red-500' : 'border-zinc-800 focus:border-zinc-600'
                    }`}
                    data-testid={`comment-${cat.category}`}
                  />
                  {hasError && (
                    <p className="text-[11px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" aria-hidden="true" />
                      {validationErrors[cat.category]}
                    </p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Overall Comments */}
          <div>
            <label
              htmlFor="overall-feedback"
              className="block text-xs font-semibold text-zinc-300 mb-1"
            >
              Overall Assessment Summary (Optional)
            </label>
            <textarea
              id="overall-feedback"
              rows={3}
              value={overallFeedback}
              onChange={(e) => setOverallFeedback(e.target.value)}
              placeholder="Additional feedback, recommendations, or architecture notes..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-200 outline-none focus:border-zinc-600"
              data-testid="overall-feedback-input"
            />
          </div>
        </div>

        {/* Radar Chart & Summary */}
        <div className="lg:col-span-5 flex flex-col items-center justify-between bg-zinc-900/30 rounded-2xl border border-zinc-800 p-6">
          <div className="w-full text-center mb-2">
            <h3 className="text-xs font-mono uppercase tracking-widest text-zinc-400">
              Rubric Distribution
            </h3>
          </div>

          <RadarChart categories={categories} />

          {/* Reviewer Wallet Status */}
          <div className="w-full mt-4 p-3 bg-zinc-950/70 border border-zinc-800 rounded-xl">
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-zinc-400">Reviewer Wallet</span>
              <span className="font-mono text-zinc-300 truncate max-w-[150px]">
                {reviewerAddress ? `${reviewerAddress.slice(0, 6)}...${reviewerAddress.slice(-4)}` : 'Not Connected'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-zinc-400">Validation Status</span>
              <span className={`font-semibold ${isValid ? 'text-emerald-400' : 'text-amber-400'}`}>
                {isValid ? 'Ready to Sign' : 'Comments Pending'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-200">
          <AlertCircle className="h-4 w-4 text-red-400 shrink-0" aria-hidden="true" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Success Banner with Cryptographic Proof */}
      {status === 'success' && signedSubmission && (
        <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-4 text-xs text-emerald-200">
          <div className="flex items-center gap-2 font-semibold text-emerald-300 mb-2">
            <Check className="h-4 w-4" aria-hidden="true" />
            <span>Assessment Successfully Signed and Submitted!</span>
          </div>
          <div className="space-y-1 font-mono text-[11px] text-zinc-400">
            <div>Review Hash: <span className="text-zinc-200">{signedSubmission.reviewHash}</span></div>
            <div>Signature: <span className="text-zinc-200 truncate inline-block max-w-[320px]">{signedSubmission.signature}</span></div>
          </div>
        </div>
      )}

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-zinc-800">
        <button
          type="button"
          onClick={reset}
          className="text-xs text-zinc-400 hover:text-white transition"
        >
          Reset Rubric
        </button>

        <button
          type="button"
          onClick={submitReview}
          disabled={!isValid || status === 'signing' || status === 'submitting'}
          className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-red-600/20 transition hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="sign-and-submit-review-btn"
        >
          {status === 'signing' || status === 'submitting' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Prompting Wallet Signature...</span>
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>Sign Assessment & Submit</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default PeerReviewRubric;
