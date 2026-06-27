const { ObjectId } = require('mongodb');
const {
  getAppointmentsCollection,
  getPrescriptionsCollection,
  getPaymentsCollection,
  getDoctorsCollection,
  getReviewsCollection,
  getUsersCollection
} = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// Patient dashboard summary (Patient only)
exports.getPatientDashboard = asyncHandler(async (req, res, next) => {
  const patientEmail = req.user.email;

  const appointmentsCol = getAppointmentsCollection();
  const prescriptionsCol = getPrescriptionsCollection();
  const paymentsCol = getPaymentsCollection();

  // 1. Total appointments count
  const totalAppointments = await appointmentsCol.countDocuments({ patientEmail });

  // 2. Total prescriptions count
  const totalPrescriptions = await prescriptionsCol.countDocuments({ patientEmail });

  // 3. Payment details sum
  const payments = await paymentsCol.find({ patientEmail }).sort({ createdAt: -1 }).toArray();
  const totalSpent = payments.reduce((sum, pay) => sum + pay.amount, 0);

  // 4. Upcoming appointments
  const upcomingAppointments = await appointmentsCol.find({
    patientEmail,
    status: { $in: ['pending', 'confirmed'] }
  }).sort({ appointmentDate: 1, appointmentTime: 1 }).toArray();

  res.status(200).json({
    success: true,
    data: {
      stats: {
        totalAppointments,
        totalPrescriptions,
        totalSpent
      },
      upcomingAppointments,
      recentPayments: payments.slice(0, 5) // Return last 5 payments
    }
  });
});

// Doctor dashboard summary (Doctor only)
exports.getDoctorDashboard = asyncHandler(async (req, res, next) => {
  const userId = new ObjectId(req.user.id);
  
  const doctorsCol = getDoctorsCollection();
  const doctor = await doctorsCol.findOne({ userId });
  if (!doctor) {
    return next(new AppError('Doctor profile not found for this user account.', 404));
  }

  const doctorId = doctor._id;
  const appointmentsCol = getAppointmentsCollection();
  const reviewsCol = getReviewsCollection();
  const paymentsCol = getPaymentsCollection();

  // 1. Total appointments count
  const totalAppointments = await appointmentsCol.countDocuments({ doctorId });

  // 2. Total reviews count
  const totalReviews = await reviewsCol.countDocuments({ doctorId });

  // 3. Unique patients treated / scheduled
  const patientsCountArr = await appointmentsCol.aggregate([
    { $match: { doctorId } },
    { $group: { _id: '$patientEmail' } },
    { $count: 'uniquePatients' }
  ]).toArray();
  const uniquePatients = patientsCountArr.length > 0 ? patientsCountArr[0].uniquePatients : 0;

  // 4. Earned revenue sum
  const payments = await paymentsCol.find({ doctorId }).toArray();
  const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);

  // 5. Upcoming appointments
  const upcomingAppointments = await appointmentsCol.find({
    doctorId,
    status: { $in: ['pending', 'confirmed'] }
  }).sort({ appointmentDate: 1, appointmentTime: 1 }).toArray();

  res.status(200).json({
    success: true,
    data: {
      doctor: {
        id: doctor._id.toString(),
        status: doctor.status,
        verificationStatus: doctor.verificationStatus || doctor.status
      },
      stats: {
        totalAppointments,
        totalReviews,
        uniquePatients,
        totalEarnings,
        rating: doctor.rating || 0,
        ratingCount: doctor.ratingCount || 0
      },
      upcomingAppointments
    }
  });
});

// Admin dashboard summary & Analytics (Admin only)
exports.getAdminDashboard = asyncHandler(async (req, res, next) => {
  const usersCol = getUsersCollection();
  const doctorsCol = getDoctorsCollection();
  const appointmentsCol = getAppointmentsCollection();
  const reviewsCol = getReviewsCollection();
  const paymentsCol = getPaymentsCollection();

  // 1. Main statistics
  const totalDoctors = await doctorsCol.countDocuments();
  const totalPatients = await usersCol.countDocuments({ role: 'patient' });
  const totalAppointments = await appointmentsCol.countDocuments();
  const totalReviews = await reviewsCol.countDocuments();

  // 2. Financial totals
  const payments = await paymentsCol.find().toArray();
  const totalEarnings = payments.reduce((sum, p) => sum + p.amount, 0);

  // 3. Top performing doctors (Based on rating & experience)
  const doctorPerformance = await doctorsCol.find({
    $or: [ { status: 'approved' }, { verificationStatus: 'verified' } ]
  })
    .sort({ rating: -1, experience: -1 })
    .limit(10)
    .toArray();

  // 4. Appointments status distribution
  const statusBreakdownArr = await appointmentsCol.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ]).toArray();
  
  const statusBreakdown = {
    pending: 0,
    confirmed: 0,
    completed: 0,
    cancelled: 0
  };
  
  statusBreakdownArr.forEach(item => {
    if (statusBreakdown.hasOwnProperty(item._id)) {
      statusBreakdown[item._id] = item.count;
    }
  });

  res.status(200).json({
    success: true,
    data: {
      stats: {
        totalDoctors,
        totalPatients,
        totalAppointments,
        totalReviews,
        totalEarnings
      },
      statusBreakdown,
      doctorPerformance: doctorPerformance.map(doc => ({
        id: doc._id,
        name: doc.name,
        specialization: doc.specialization,
        rating: doc.rating,
        ratingCount: doc.ratingCount,
        experience: doc.experience,
        fee: doc.fee
      }))
    }
  });
});

// Public platform statistics
exports.getPublicStats = asyncHandler(async (req, res, next) => {
  const usersCol = getUsersCollection();
  const doctorsCol = getDoctorsCollection();
  const appointmentsCol = getAppointmentsCollection();
  const reviewsCol = getReviewsCollection();

  const totalDoctors = await doctorsCol.countDocuments({
    $or: [ { status: 'approved' }, { verificationStatus: 'verified' } ]
  });
  const totalPatients = await usersCol.countDocuments({ role: 'patient' });
  const totalAppointments = await appointmentsCol.countDocuments();
  const totalReviews = await reviewsCol.countDocuments();

  res.status(200).json({
    success: true,
    data: {
      totalDoctors,
      totalPatients,
      totalAppointments,
      totalReviews
    }
  });
});
