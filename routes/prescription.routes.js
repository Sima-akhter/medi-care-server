const express = require('express');
const router = express.Router();
const prescriptionController = require('../controllers/prescription.controller');
const { verifyToken, verifyDoctor } = require('../middlewares/auth.middleware');

router.use(verifyToken); // All prescription endpoints require auth

router.post('/', verifyDoctor, prescriptionController.createPrescription);
router.get('/', prescriptionController.getPrescriptions);
router.get('/:id', prescriptionController.getPrescriptionById);
router.put('/:id', verifyDoctor, prescriptionController.updatePrescription);

module.exports = router;
