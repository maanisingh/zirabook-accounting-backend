const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journalController');
const { authMiddleware, requireCompanyAccess } = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiter');

router.use(apiLimiter);
router.use(authMiddleware);
router.use(requireCompanyAccess());

router.get('/', journalController.listJournalEntries);
router.post('/', journalController.createJournalEntry);
router.get('/:id', journalController.getJournalEntryById);
router.delete('/:id', journalController.deleteJournalEntry);
router.patch('/:id/post', journalController.postJournalEntry);

module.exports = router;
