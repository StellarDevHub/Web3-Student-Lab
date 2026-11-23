'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bug, Send, X, Loader2, CheckCircle } from 'lucide-react';

interface BugReportData {
  title: string;
  description: string;
  steps: string[];
  expected: string;
  actual: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'ui' | 'functionality' | 'performance' | 'security' | 'other';
  browser: string;
  url: string;
}

interface BugReportProps {
  isOpen: boolean;
  onClose: () => void;
  context?: {
    route: string;
    component?: string;
  };
}

export function BugReport({ isOpen, onClose, context }: BugReportProps) {
  const [formData, setFormData] = useState<BugReportData>({
    title: '',
    description: '',
    steps: [''],
    expected: '',
    actual: '',
    severity: 'medium',
    category: 'functionality',
    browser: typeof window !== 'undefined' ? navigator.userAgent : '',
    url: typeof window !== 'undefined' ? window.location.href : '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleInputChange = (field: keyof BugReportData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleStepChange = (index: number, value: string) => {
    const newSteps = [...formData.steps];
    newSteps[index] = value;
    setFormData((prev) => ({ ...prev, steps: newSteps }));
  };

  const addStep = () => {
    setFormData((prev) => ({ ...prev, steps: [...prev.steps, ''] }));
  };

  const removeStep = (index: number) => {
    if (formData.steps.length > 1) {
      const newSteps = formData.steps.filter((_, i) => i !== index);
      setFormData((prev) => ({ ...prev, steps: newSteps }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Simulate API call to submit bug report
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // In a real implementation, this would send the data to a backend service
      console.log('Bug report submitted:', {
        ...formData,
        context,
        timestamp: new Date().toISOString(),
      });

      setIsSubmitted(true);

      // Reset form after 2 seconds
      setTimeout(() => {
        setIsSubmitted(false);
        onClose();
        setFormData({
          title: '',
          description: '',
          steps: [''],
          expected: '',
          actual: '',
          severity: 'medium',
          category: 'functionality',
          browser: typeof window !== 'undefined' ? navigator.userAgent : '',
          url: typeof window !== 'undefined' ? window.location.href : '',
        });
      }, 2000);
    } catch (error) {
      console.error('Failed to submit bug report:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid =
    formData.title.trim() &&
    formData.description.trim() &&
    formData.steps.some((step) => step.trim()) &&
    formData.expected.trim() &&
    formData.actual.trim();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="max-h-[90vh] w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Bug className="h-6 w-6" />
                  <div>
                    <h2 className="text-xl font-bold">Report a Bug</h2>
                    <p className="text-sm opacity-90">
                      Help us improve by reporting issues you encounter
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="rounded-lg p-2 transition-colors hover:bg-white/20"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="max-h-[calc(100vh-200px)] overflow-y-auto p-6">
              {isSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="py-12 text-center"
                >
                  <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
                  <h3 className="mb-2 text-xl font-semibold text-gray-800">
                    Bug Report Submitted!
                  </h3>
                  <p className="text-gray-600">
                    Thank you for helping us improve. We'll review your report and address the
                    issue.
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* Basic Information */}
                  <div className="space-y-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Bug Title *
                      </label>
                      <input
                        type="text"
                        value={formData.title}
                        onChange={(e) => handleInputChange('title', e.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500 focus:outline-none"
                        placeholder="Brief description of the issue"
                        required
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Description *
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        rows={4}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500 focus:outline-none"
                        placeholder="Detailed description of what happened"
                        required
                      />
                    </div>
                  </div>

                  {/* Steps to Reproduce */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Steps to Reproduce *
                    </label>
                    <div className="space-y-2">
                      {formData.steps.map((step, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium">
                            {index + 1}
                          </span>
                          <input
                            type="text"
                            value={step}
                            onChange={(e) => handleStepChange(index, e.target.value)}
                            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500 focus:outline-none"
                            placeholder={`Step ${index + 1}`}
                          />
                          {formData.steps.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeStep(index)}
                              className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={addStep}
                        className="text-sm font-medium text-red-500 hover:text-red-600"
                      >
                        + Add Step
                      </button>
                    </div>
                  </div>

                  {/* Expected vs Actual */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Expected Behavior *
                      </label>
                      <textarea
                        value={formData.expected}
                        onChange={(e) => handleInputChange('expected', e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500 focus:outline-none"
                        placeholder="What should have happened"
                        required
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Actual Behavior *
                      </label>
                      <textarea
                        value={formData.actual}
                        onChange={(e) => handleInputChange('actual', e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500 focus:outline-none"
                        placeholder="What actually happened"
                        required
                      />
                    </div>
                  </div>

                  {/* Severity and Category */}
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Severity
                      </label>
                      <select
                        value={formData.severity}
                        onChange={(e) =>
                          handleInputChange('severity', e.target.value as BugReportData['severity'])
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500 focus:outline-none"
                      >
                        <option value="low">Low - Minor inconvenience</option>
                        <option value="medium">Medium - Affects usability</option>
                        <option value="high">High - Major functionality broken</option>
                        <option value="critical">Critical - System unusable</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Category
                      </label>
                      <select
                        value={formData.category}
                        onChange={(e) =>
                          handleInputChange('category', e.target.value as BugReportData['category'])
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:border-transparent focus:ring-2 focus:ring-red-500 focus:outline-none"
                      >
                        <option value="ui">UI/UX Issue</option>
                        <option value="functionality">Functionality</option>
                        <option value="performance">Performance</option>
                        <option value="security">Security</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  {/* Auto-filled Information */}
                  <div className="rounded-lg bg-gray-50 p-4">
                    <h3 className="mb-2 text-sm font-medium text-gray-700">System Information</h3>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div>
                        <strong>URL:</strong> {formData.url}
                      </div>
                      <div>
                        <strong>Browser:</strong> {formData.browser.substring(0, 100)}...
                      </div>
                      {context && (
                        <div>
                          <strong>Context:</strong> {context.route}{' '}
                          {context.component && `(${context.component})`}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Submit Button */}
                  <div className="flex justify-end space-x-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-lg bg-gray-200 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-300"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!isFormValid || isSubmitting}
                      className="flex items-center space-x-2 rounded-lg bg-red-500 px-6 py-2 text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Submitting...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4" />
                          <span>Submit Report</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
