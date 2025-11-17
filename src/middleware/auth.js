const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// JWT Token Generation
const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId
    },
    process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production-2024',
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '1d'
    }
  );
};

// Refresh Token Generation
const generateRefreshToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      type: 'refresh'
    },
    process.env.REFRESH_TOKEN_SECRET || 'your-super-secret-refresh-token-key-2024',
    {
      expiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '7d'
    }
  );
};

// Bearer Token Extraction
const extractBearerToken = (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
};

// Main Authentication Middleware
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - No token provided'
      });
    }

    // Verify token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production-2024'
    );

    // Verify user still exists and is active
    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
        isActive: true
      },
      include: {
        company: true
      }
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found or inactive'
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      companyId: user.companyId,
      company: user.company
    };

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

// Role-based Authorization Middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - No user context'
      });
    }

    // Handle both array and individual arguments
    // If first arg is an array, use it; otherwise use all arguments
    const allowedRoles = Array.isArray(roles[0]) ? roles[0] : roles;

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
};

// Company Isolation Middleware
const requireCompanyAccess = (allowSuperAdmin = true) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - No user context'
      });
    }

    // Super admins can access all companies if allowed
    if (allowSuperAdmin && req.user.role === 'SUPERADMIN') {
      return next();
    }

    // Get companyId from various sources
    let requestedCompanyId =
      req.params.companyId ||
      req.body?.companyId ||
      req.query.companyId;

    // If no specific company requested, use user's company
    if (!requestedCompanyId) {
      requestedCompanyId = req.user.companyId;
    }

    // Check if user has access to this company
    if (req.user.companyId !== requestedCompanyId) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden - Cannot access resources from another company'
      });
    }

    // Attach companyId to request for convenience
    req.companyId = requestedCompanyId;
    next();
  };
};

// Optional Authentication Middleware (for public endpoints that can be enhanced with auth)
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractBearerToken(authHeader);

    if (!token) {
      return next(); // Continue without user context
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production-2024'
    );

    const user = await prisma.user.findUnique({
      where: {
        id: decoded.userId,
        isActive: true
      },
      include: {
        company: true
      }
    });

    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        companyId: user.companyId,
        company: user.company
      };
    }

    next();
  } catch (error) {
    // Ignore errors and continue without user context
    next();
  }
};

// Verify Refresh Token
const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(
      token,
      process.env.REFRESH_TOKEN_SECRET || 'your-super-secret-refresh-token-key-2024'
    );
  } catch (error) {
    return null;
  }
};

// Password Validation
const validatePassword = (password) => {
  const errors = [];

  if (!password || password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }

  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }

  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

module.exports = {
  authMiddleware,
  requireRole,
  requireCompanyAccess,
  optionalAuth,
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  validatePassword,
  extractBearerToken
};