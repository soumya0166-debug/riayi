'use client';

import React from 'react';
import { classNames } from '@/lib/utils';

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
