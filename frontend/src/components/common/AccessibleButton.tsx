import React from 'react';

interface AccessibleButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  ariaLabel?: string;
}

export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
  children,
  ariaLabel,
  ...props
}) => {
  return (
    <button
      {...props}
      aria-label={ariaLabel}
      role="button"
      tabIndex={0}
      className={`focus-visible:ring-4 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${props.className || ''}`}
    >
      {children}
    </button>
  );
};
