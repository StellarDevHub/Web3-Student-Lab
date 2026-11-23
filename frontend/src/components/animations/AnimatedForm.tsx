'use client';

import { useAnimationFeedback, useLoadingAnimation } from '@/hooks/useAnimationFeedback';
import React, { useState } from 'react';
import { AnimatedButton } from './AnimatedButton';
import { AnimatedContainer } from './AnimatedContainer';
import { AnimatedInput } from './AnimatedInput';
import { FeedbackAnimation } from './FeedbackAnimation';
import { LoadingAnimation } from './LoadingAnimation';

interface AnimatedFormProps {
  title?: string;
  onSubmit: (data: Record<string, string>) => Promise<void>;
  fields: Array<{
    name: string;
    label: string;
    type?: 'text' | 'email' | 'password' | 'number';
    placeholder?: string;
    required?: boolean;
    icon?: React.ReactNode;
  }>;
  submitText?: string;
  variant?: 'primary' | 'secondary';
}

export const AnimatedForm: React.FC<AnimatedFormProps> = ({
  title,
  onSubmit,
  fields,
  submitText = 'Submit',
  variant = 'primary',
}) => {
  const [formData, setFormData] = useState<Record<string, string>>(
    fields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {})
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [successes, setSuccesses] = useState<Record<string, string>>({});

  const { feedback, isVisible, showSuccess, showError, dismiss } = useAnimationFeedback();
  const { isLoading, withLoading } = useLoadingAnimation();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate
    const newErrors: Record<string, string> = {};
    fields.forEach((field) => {
      if (field.required && !formData[field.name]) {
        newErrors[field.name] = `${field.label} is required`;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      showError('Please fill in all required fields');
      return;
    }

    // Submit with loading state
    await withLoading(async () => {
      try {
        await onSubmit(formData);
        setFormData(fields.reduce((acc, field) => ({ ...acc, [field.name]: '' }), {}));
        setErrors({});
        showSuccess('Form submitted successfully!');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'An error occurred';
        showError(errorMessage);
      }
    });
  };

  return (
    <AnimatedContainer variant="slideInUp" className="w-full max-w-md">
      {title && <h2 className="mb-6 text-2xl font-bold text-white">{title}</h2>}

      <form onSubmit={handleSubmit} className="space-y-4">
        {fields.map((field, index) => (
          <AnimatedInput
            key={field.name}
            name={field.name}
            label={field.label}
            type={field.type || 'text'}
            placeholder={field.placeholder}
            required={field.required}
            value={formData[field.name]}
            onChange={handleChange}
            error={errors[field.name]}
            success={successes[field.name]}
            icon={field.icon}
          />
        ))}

        <AnimatedButton
          type="submit"
          variant={variant}
          size="md"
          fullWidth
          isLoading={isLoading}
          disabled={isLoading}
          className="mt-6"
        >
          {submitText}
        </AnimatedButton>
      </form>

      {feedback && isVisible && (
        <div className="mt-4">
          <FeedbackAnimation {...feedback} onDismiss={dismiss} />
        </div>
      )}
    </AnimatedContainer>
  );
};

// Example usage component
export const AnimationShowcase: React.FC = () => {
  const { feedback, isVisible, showSuccess, showError, dismiss } = useAnimationFeedback();
  const [loadingType, setLoadingType] = useState<
    'spinner' | 'dots' | 'pulse' | 'bars' | 'skeleton'
  >('spinner');

  return (
    <div className="space-y-8 p-6">
      <section>
        <h2 className="mb-4 text-2xl font-bold">Button Animations</h2>
        <div className="flex flex-wrap gap-2">
          <AnimatedButton>Default</AnimatedButton>
          <AnimatedButton variant="secondary">Secondary</AnimatedButton>
          <AnimatedButton variant="outline">Outline</AnimatedButton>
          <AnimatedButton variant="danger">Danger</AnimatedButton>
          <AnimatedButton isLoading>Loading</AnimatedButton>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Feedback Animations</h2>
        <div className="flex flex-wrap gap-2">
          <AnimatedButton onClick={() => showSuccess('Success!')}>Show Success</AnimatedButton>
          <AnimatedButton onClick={() => showError('Something went wrong')} variant="danger">
            Show Error
          </AnimatedButton>
        </div>
        {feedback && isVisible && (
          <div className="mt-4">
            <FeedbackAnimation {...feedback} onDismiss={dismiss} />
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Loading Animations</h2>
        <div className="mb-4 flex flex-wrap gap-4">
          {['spinner', 'dots', 'pulse', 'bars', 'skeleton'].map((type) => (
            <AnimatedButton
              key={type}
              onClick={() => setLoadingType(type as any)}
              variant={loadingType === type ? 'primary' : 'outline'}
            >
              {type}
            </AnimatedButton>
          ))}
        </div>
        <LoadingAnimation type={loadingType} size="md" text="Loading..." />
      </section>

      <section>
        <h2 className="mb-4 text-2xl font-bold">Form Example</h2>
        <AnimatedForm
          title="Contact Us"
          fields={[
            {
              name: 'email',
              label: 'Email',
              type: 'email',
              placeholder: 'your@email.com',
              required: true,
            },
            {
              name: 'message',
              label: 'Message',
              type: 'text',
              placeholder: 'Your message here...',
              required: true,
            },
          ]}
          onSubmit={async (data) => {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            console.log('Form submitted:', data);
          }}
        />
      </section>
    </div>
  );
};
