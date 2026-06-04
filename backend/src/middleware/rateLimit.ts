import rateLimit from 'express-rate-limit';

/**
 * General rate limiter: 100 requests/minute per IP.
 */
export const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please try again later.',
    retryAfter: '60 seconds',
  },
});

/**
 * Auth rate limiter: 10 requests/minute per IP.
 * Stricter limit on login/register to prevent brute force.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts',
    message: 'Please wait before trying again.',
    retryAfter: '60 seconds',
  },
});
