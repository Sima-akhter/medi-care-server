const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');
const { verifyToken, verifyPatient } = require('../middlewares/auth.middleware');

router.get('/', reviewController.getAllReviews);
router.post('/', verifyToken, verifyPatient, reviewController.createReview);
router.get('/doctor/:doctorId', reviewController.getDoctorReviews);
router.put('/:id', verifyToken, verifyPatient, reviewController.updateReview);
router.delete('/:id', verifyToken, reviewController.deleteReview);

module.exports = router;
