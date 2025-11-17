const express = require('express');
const router = express.Router();
const usersController = require('../controllers/usersController');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);

router.get('/', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), usersController.listUsers);
router.post('/', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), usersController.createUser);
router.get('/:id', usersController.getUserById);
router.put('/:id', usersController.updateUser);
router.delete('/:id', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), usersController.deleteUser);
router.patch('/:id/role', requireRole('SUPERADMIN', 'COMPANY_ADMIN'), usersController.changeUserRole);
router.patch('/:id/password', usersController.changeUserPassword);

module.exports = router;
