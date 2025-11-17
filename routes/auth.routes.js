const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authMiddleware } = require('../middleware/auth');

// Public routes
router.post('/login', authController.login);
router.post('/register', authController.register);

// Protected routes
router.get('/me', authMiddleware, authController.getMe);
router.get('/User/company/:companyId', authMiddleware, authController.getUsersByCompany);
router.post('/User', authMiddleware, authController.createUser);
router.put('/User/:id', authMiddleware, authController.updateUser);
router.delete('/User/:id', authMiddleware, authController.deleteUser);

module.exports = router;