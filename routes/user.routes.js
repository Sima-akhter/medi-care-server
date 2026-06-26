const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const { verifyToken, verifyAdmin } = require('../middlewares/auth.middleware');

router.get('/me', verifyToken, userController.getMe);
router.put('/me', verifyToken, userController.updateMe);

// Admin-only endpoints
router.get('/', verifyToken, verifyAdmin, userController.getAllUsers);
router.put('/:id/status', verifyToken, verifyAdmin, userController.updateUserStatusRole);
router.delete('/:id', verifyToken, verifyAdmin, userController.deleteUser);

module.exports = router;
