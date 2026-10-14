/**
 * Safe local storage wrapper with SSR safety & server-side memory fallback
 */

const serverMemoryCache = new Map<string, string>();

export const safeStorage = {
  get<T>(key: string, defaultValue: T): T {
    if (typeof window === 'undefined') {
      const cached = serverMemoryCache.get(key);
      if (cached === undefined) return defaultValue;
      try {
        return JSON.parse(cached) as T;
      } catch {
        return defaultValue;
      }
    }
    try {
      const item = window.localStorage.getItem(key);
      if (item === null) return defaultValue;
      return JSON.parse(item) as T;
    } catch {
      return defaultValue;
    }
  },

  set<T>(key: string, value: T): boolean {
    if (typeof window === 'undefined') {
      try {
        serverMemoryCache.set(key, JSON.stringify(value));
        return true;
      } catch {
        return false;
      }
    }
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key: string): boolean {
    if (typeof window === 'undefined') {
      serverMemoryCache.delete(key);
      return true;
    }
    try {
      window.localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  },
};
