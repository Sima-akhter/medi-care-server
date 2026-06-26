const { ObjectId } = require('mongodb');
const { getAppointmentsCollection, getDoctorsCollection } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// Create appointment (Patient only)
exports.createAppointment = asyncHandler(async (req, res, next) => {
  const { doctorId, appointmentDate, appointmentTime } = req.body;

  if (!doctorId || !appointmentDate || !appointmentTime) {
    return next(new AppError('Please specify doctorId, appointmentDate, and appointmentTime.', 400));
  }

  if (!ObjectId.isValid(doctorId)) {
    return next(new AppError('Invalid Doctor ID format.', 400));
  }

  // 1. Verify doctor profile exists and is approved
  const doctorsCollection = getDoctorsCollection();
  const doctor = await doctorsCollection.findOne({ _id: new ObjectId(doctorId), status: 'approved' });

  if (!doctor) {
    return next(new AppError('Doctor not found or is not currently active.', 404));
  }

  // 2. Create the appointment record
  const appointmentsCollection = getAppointmentsCollection();
  const newAppointment = {
    patientId: new ObjectId(req.user.id),
    patientName: req.user.name,
    patientEmail: req.user.email,
    doctorId: new ObjectId(doctorId),
    doctorName: doctor.name,
    doctorEmail: doctor.email,
    appointmentDate,
    appointmentTime,
    fee: doctor.fee,
    status: 'pending',
    paymentStatus: 'unpaid',
    createdAt: new Date()
  };

  const result = await appointmentsCollection.insertOne(newAppointment);

  res.status(201).json({
    success: true,
    message: 'Appointment scheduled successfully.',
    data: { ...newAppointment, _id: result.insertedId }
  });
});

// Get appointments list (Filtered by Role/Query)
exports.getAppointments = asyncHandler(async (req, res, next) => {
  const appointmentsCollection = getAppointmentsCollection();
  const filter = {};

  // Role filtering
  if (req.user.role === 'patient') {
    // Patients can only see their own appointments
    filter.patientEmail = req.user.email;
  } else if (req.user.role === 'doctor') {
    // Doctors can only see appointments booked with them
    const doctorsCollection = getDoctorsCollection();
    const doctor = await doctorsCollection.findOne({ userId: new ObjectId(req.user.id) });
    if (!doctor) {
      return next(new AppError('Doctor profile not found for this user account.', 404));
    }
    filter.doctorId = doctor._id;
  }
  // Admins see all by default

  // Support additional filters (e.g. status, paymentStatus)
  const { status, paymentStatus } = req.query;
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;

  const appointments = await appointmentsCollection.find(filter).sort({ appointmentDate: 1, appointmentTime: 1 }).toArray();

  res.status(200).json({
    success: true,
    results: appointments.length,
    data: appointments
  });
});

// Update appointment status (Admin / Doctor)
exports.updateAppointmentStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['pending', 'confirmed', 'completed', 'cancelled'].includes(status)) {
    return next(new AppError('Please provide a valid status: pending, confirmed, completed, or cancelled.', 400));
  }

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Appointment ID format.', 400));
  }

  const appointmentsCollection = getAppointmentsCollection();
  const appointment = await appointmentsCollection.findOne({ _id: new ObjectId(id) });

  if (!appointment) {
    return next(new AppError('Appointment not found.', 404));
  }

  // Ensure only admin or doctor can update status
  if (req.user.role !== 'admin' && req.user.role !== 'doctor') {
    return next(new AppError('Forbidden: Only Doctors or Admins can update appointment status.', 403));
  }

  // If a doctor is updating, verify they are indeed the doctor assigned
  if (req.user.role === 'doctor') {
    const doctorsCollection = getDoctorsCollection();
    const doctor = await doctorsCollection.findOne({ userId: new ObjectId(req.user.id) });
    if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
      return next(new AppError('You do not have permission to modify this appointment.', 403));
    }
  }

  await appointmentsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: { status, updatedAt: new Date() } }
  );

  const updatedAppointment = await appointmentsCollection.findOne({ _id: new ObjectId(id) });

  res.status(200).json({
    success: true,
    message: `Appointment status successfully updated to '${status}'.`,
    data: updatedAppointment
  });
});
