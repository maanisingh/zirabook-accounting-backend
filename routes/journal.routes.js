const express = require('express');
const router = express.Router();
const journalController = require('../controllers/journal.controller');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/company/:companyId', journalController.getJournalEntriesByCompany);
router.get('/:id', journalController.getJournalEntry);
router.post('/', journalController.createJournalEntry);
router.put('/:id', journalController.updateJournalEntry);
router.delete('/:id', journalController.deleteJournalEntry);

module.exports = router;