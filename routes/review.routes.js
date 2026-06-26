const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { verifyToken, verifyPatient } = require('../middlewares/auth.middleware');

router.post('/', verifyToken, verifyPatient, reviewController.createReview);
router.get('/doctor/:doctorId', reviewController.getDoctorReviews);

module.exports = router;
