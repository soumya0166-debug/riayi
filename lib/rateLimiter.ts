import { AI_CONFIG } from '@/config/ai';

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const ipMap = new Map<string, RateLimitRecord>();

// Periodic memory cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of ipMap.entries()) {
      if (now > record.resetAt) {
        ipMap.delete(ip);
      }
    }
  }, 5 * 60 * 1000);
}

export function checkRateLimit(identifier: string): {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
} {
  const now = Date.now();
  const record = ipMap.get(identifier);

  if (!record || now > record.resetAt) {
    ipMap.set(identifier, {
      count: 1,
      resetAt: now + AI_CONFIG.rateLimitWindowMs,
    });
    return {
      allowed: true,
      remaining: AI_CONFIG.rateLimitMaxRequests - 1,
      resetInSeconds: Math.ceil(AI_CONFIG.rateLimitWindowMs / 1000),
    };
  }

  if (record.count >= AI_CONFIG.rateLimitMaxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
    };
  }

  record.count += 1;
  return {
    allowed: true,
    remaining: AI_CONFIG.rateLimitMaxRequests - record.count,
    resetInSeconds: Math.ceil((record.resetAt - now) / 1000),
  };
}
