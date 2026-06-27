const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { verifyToken, verifyAdmin, verifyDoctor, verifyPatient } = require('../middlewares/auth.middleware');

router.get('/public-stats', dashboardController.getPublicStats);

router.use(verifyToken); // All dashboards require JWT verification

router.get('/patient', verifyPatient, dashboardController.getPatientDashboard);
router.get('/doctor', verifyDoctor, dashboardController.getDoctorDashboard);
router.get('/admin', verifyAdmin, dashboardController.getAdminDashboard);

module.exports = router;
