const express = require('express');
const router = express.Router();
const uploadController = require('../controllers/upload.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

router.post('/image', verifyToken, uploadController.uploadImage);

module.exports = router;
