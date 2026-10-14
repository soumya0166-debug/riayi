'use client';

import { useEffect, useRef } from 'react';

export function useClickOutside<T extends HTMLElement>(
  callback: () => void,
  active = true
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;

    function handleClick(event: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    }

    document.addEventListener('mousedown', handleClick);
    document.addEventListener('touchstart', handleClick);

    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('touchstart', handleClick);
    };
  }, [callback, active]);

  return ref;
}
