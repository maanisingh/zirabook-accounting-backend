const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authMiddleware } = require('../middleware/auth');
const {
  loginLimiter,
  registrationLimiter,
  passwordResetLimiter
} = require('../middleware/rateLimiter');

// Public routes
router.post('/register', registrationLimiter, authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/refresh', authController.refreshAccessToken);
router.post('/forgot-password', passwordResetLimiter, authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, authController.resetPassword);

// Protected routes
router.get('/me', authMiddleware, authController.getCurrentUser);
router.post('/logout', authMiddleware, authController.logout);
router.post('/change-password', authMiddleware, authController.changePassword);

module.exports = router;