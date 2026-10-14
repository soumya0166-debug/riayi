'use client';

import React from 'react';
import { classNames } from '@/lib/utils';

export function Card({
  children,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={classNames('card', className)} {...props}>
      {children}
    </div>
  );
}

export function Avatar({
  name = 'User',
  isAccent = false,
  className,
}: {
  name?: string;
  isAccent?: boolean;
  className?: string;
}) {
  const initial = name ? name.charAt(0).toUpperCase() : 'U';

  return (
    <div className={classNames('avatar', isAccent && 'avatar-accent', className)}>
      {initial}
    </div>
  );
}

export function Badge({
  children,
  variant = 'subtle',
  className,
}: {
  children: React.ReactNode;
  variant?: 'accent' | 'subtle';
  className?: string;
}) {
  return (
    <span
      className={classNames(
        'badge',
        variant === 'accent' ? 'badge-accent' : 'badge-subtle',
        className
      )}
    >
      {children}
    </span>
  );
}
