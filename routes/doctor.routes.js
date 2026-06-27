const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctor.controller');
const { verifyToken, verifyAdmin } = require('../middlewares/auth.middleware');

router.get('/', doctorController.getAllDoctors);
router.get('/:id', doctorController.getDoctorById);

// Protected routes
router.post('/', verifyToken, doctorController.createDoctorProfile);
router.put('/:id', verifyToken, doctorController.updateDoctorProfile);

// Admin-only management
router.patch('/:id/status', verifyToken, verifyAdmin, doctorController.updateDoctorStatus);
router.patch('/:id/verify', verifyToken, verifyAdmin, doctorController.verifyDoctor);
router.patch('/:id/reject', verifyToken, verifyAdmin, doctorController.rejectDoctor);
router.delete('/:id', verifyToken, verifyAdmin, doctorController.deleteDoctor);

module.exports = router;
