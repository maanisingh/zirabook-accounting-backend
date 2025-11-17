const rateLimit = require('express-rate-limit');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Store for tracking login attempts (in production, use Redis)
const loginAttempts = new Map();

// General API Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // 500 requests per minute per IP (increased for production use)
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skip: (req) => {
    // Skip rate limiting for certain roles if needed
    if (req.user && req.user.role === 'SUPERADMIN') {
      return true;
    }
    return false;
  }
});

// Login Rate Limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 attempts per 15 minutes (increased for production use)
  message: {
    success: false,
    message: 'Too many login attempts, please try again later',
    retryAfter: 900
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipFailedRequests: false
});

// Registration Rate Limiter
const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 registration attempts per hour
  message: {
    success: false,
    message: 'Too many registration attempts, please try again later',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Password Reset Rate Limiter
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // 3 password reset attempts per hour
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later',
    retryAfter: 3600
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Report Generation Rate Limiter (for heavy operations)
const reportLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 reports per minute
  message: {
    success: false,
    message: 'Too many report requests, please try again later',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

// File Upload Rate Limiter
const uploadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 uploads per 5 minutes
  message: {
    success: false,
    message: 'Too many upload attempts, please try again later',
    retryAfter: 300
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Custom rate limiter with user-based tracking
const createUserBasedLimiter = (options) => {
  return rateLimit({
    ...options,
    keyGenerator: (req) => {
      // Use user ID if authenticated, otherwise use IP
      if (req.user && req.user.id) {
        return `user:${req.user.id}`;
      }
      return `ip:${req.ip}`;
    }
  });
};

// Track failed login attempts for account lockout
const trackFailedLogin = async (email, ip) => {
  const key = `${email}:${ip}`;
  const attempts = loginAttempts.get(key) || { count: 0, firstAttempt: Date.now() };

  attempts.count++;
  attempts.lastAttempt = Date.now();

  // Reset if more than 15 minutes since first attempt
  if (Date.now() - attempts.firstAttempt > 15 * 60 * 1000) {
    attempts.count = 1;
    attempts.firstAttempt = Date.now();
  }

  loginAttempts.set(key, attempts);

  // Lock account after 5 failed attempts
  if (attempts.count >= 5) {
    // In production, you might want to update the user record
    // await prisma.user.update({
    //   where: { email },
    //   data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) }
    // });
    return true; // Account should be locked
  }

  return false;
};

// Clear failed login attempts on successful login
const clearFailedLoginAttempts = (email, ip) => {
  const key = `${email}:${ip}`;
  loginAttempts.delete(key);
};

// Check if account is locked
const isAccountLocked = async (email, ip) => {
  const key = `${email}:${ip}`;
  const attempts = loginAttempts.get(key);

  if (!attempts) {
    return false;
  }

  // Check if lock period has expired (15 minutes)
  if (attempts.count >= 5) {
    if (Date.now() - attempts.lastAttempt > 15 * 60 * 1000) {
      loginAttempts.delete(key);
      return false;
    }
    return true;
  }

  return false;
};

// Cleanup old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, attempts] of loginAttempts.entries()) {
    if (now - attempts.lastAttempt > 60 * 60 * 1000) { // Clear entries older than 1 hour
      loginAttempts.delete(key);
    }
  }
}, 10 * 60 * 1000); // Run cleanup every 10 minutes

module.exports = {
  apiLimiter,
  loginLimiter,
  registrationLimiter,
  passwordResetLimiter,
  reportLimiter,
  uploadLimiter,
  createUserBasedLimiter,
  trackFailedLogin,
  clearFailedLoginAttempts,
  isAccountLocked
};