'use client';

import React from 'react';
import { classNames } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'icon' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, variant = 'primary', size = 'md', isLoading, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={classNames(
          'btn',
          variant === 'primary' && 'btn-primary',
          variant === 'secondary' && 'btn-secondary',
          variant === 'ghost' && 'btn-ghost',
          variant === 'icon' && 'btn-icon',
          variant === 'danger' && 'btn-danger',
          size === 'sm' && 'btn-sm',
          size === 'lg' && 'btn-lg',
          className
        )}
        {...props}
      >
        {isLoading ? <span className="animate-pulse-subtle">...</span> : children}
      </button>
    );
  }
);

Button.displayName = 'Button';
