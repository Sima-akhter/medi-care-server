const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/payment.controller');
const { verifyToken, verifyPatient } = require('../middlewares/auth.middleware');

router.use(verifyToken); // All payment routes require auth

router.post('/create-payment-intent', verifyPatient, paymentController.createPaymentIntent);
router.post('/', verifyPatient, paymentController.savePayment);
router.get('/', paymentController.getPayments);

module.exports = router;
