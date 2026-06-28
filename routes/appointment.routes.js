const express = require('express');
const router = express.Router();
const appointmentController = require('../controllers/appointment.controller');
const { verifyToken, verifyPatient } = require('../middlewares/auth.middleware');

router.use(verifyToken); // All appointment endpoints require authentication

router.post('/', verifyPatient, appointmentController.createAppointment);
router.get('/', appointmentController.getAppointments);
router.patch('/:id/status', appointmentController.updateAppointmentStatus);
router.patch('/:id/reschedule', verifyPatient, appointmentController.rescheduleAppointment);

module.exports = router;
