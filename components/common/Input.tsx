'use client';

import React from 'react';
import { classNames } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="form-group">
        {label && (
          <label htmlFor={inputId} className="input-label">
            {label}
          </label>
        )}
        <input
          id={inputId}
          ref={ref}
          className={classNames('input-field', className)}
          {...props}
        />
        {error && <span style={{ color: 'var(--status-error)', fontSize: '0.75rem', marginTop: '2px' }}>{error}</span>}
        {helperText && !error && (
          <span style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginTop: '2px' }}>
            {helperText}
          </span>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
