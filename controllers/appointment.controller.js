const { ObjectId } = require('mongodb');
const { getAppointmentsCollection, getDoctorsCollection } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// Create appointment (Patient only)
exports.createAppointment = asyncHandler(async (req, res, next) => {
  const { doctorId, appointmentDate, appointmentTime, symptoms } = req.body;

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

  // Check if doctor has set availability
  if (!doctor.availableDays || doctor.availableDays.length === 0) {
    return next(new AppError('This doctor has not configured available days yet.', 400));
  }
  if (!doctor.availableSlots || doctor.availableSlots.length === 0) {
    return next(new AppError('This doctor has not configured available slots yet.', 400));
  }

  // Validate day of week
  const dateObj = new Date(appointmentDate);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = dayNames[dateObj.getDay()];
  const isDayAvailable = doctor.availableDays.some(day => day.toLowerCase() === dayOfWeek.toLowerCase());
  if (!isDayAvailable) {
    return next(new AppError(`Doctor is not available on ${dayOfWeek}. Available days: ${doctor.availableDays.join(', ')}`, 400));
  }

  // Validate slot time
  const isSlotAvailable = doctor.availableSlots.some(slot => slot.trim() === appointmentTime.trim());
  if (!isSlotAvailable) {
    return next(new AppError(`Selected slot ${appointmentTime} is not available. Available slots: ${doctor.availableSlots.join(', ')}`, 400));
  }

  // 2. Prevent duplicate booking (same doctor, same date, same time)
  const appointmentsCollection = getAppointmentsCollection();
  const duplicate = await appointmentsCollection.findOne({
    doctorId: new ObjectId(doctorId),
    appointmentDate,
    appointmentTime,
    status: { $ne: 'cancelled' }
  });

  if (duplicate) {
    return next(new AppError('This time slot is already booked for this doctor.', 400));
  }

  // 3. Create the appointment record
  const newAppointment = {
    patientId: new ObjectId(req.user.id),
    patientName: req.user.name,
    patientEmail: req.user.email,
    doctorId: new ObjectId(doctorId),
    doctorName: doctor.name,
    doctorEmail: doctor.email,
    appointmentDate,
    appointmentTime,
    fee: doctor.fee !== undefined ? doctor.fee : (doctor.consultationFee || 0),
    status: 'pending',
    paymentStatus: 'unpaid',
    symptoms: symptoms || '',
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
    const doctorQuery = {
      $or: [
        ...(ObjectId.isValid(req.user.id) ? [{ userId: new ObjectId(req.user.id) }] : []),
        { userId: req.user.id }
      ]
    };
    const doctor = await doctorsCollection.findOne(doctorQuery);
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

  // Ensure only admin or doctor can update status, EXCEPT for patients cancelling their own bookings
  const isPatientCancellation = req.user.role === 'patient' && status === 'cancelled';
  
  if (req.user.role !== 'admin' && req.user.role !== 'doctor' && !isPatientCancellation) {
    return next(new AppError('Forbidden: Only Doctors or Admins can update appointment status.', 403));
  }

  // If a patient is cancelling, verify ownership and status
  if (isPatientCancellation) {
    if (appointment.patientEmail !== req.user.email) {
      return next(new AppError('Forbidden: You can only cancel your own appointments.', 403));
    }
    if (appointment.status === 'completed') {
      return next(new AppError('Forbidden: Completed appointments cannot be cancelled.', 400));
    }
    if (appointment.status === 'cancelled') {
      return next(new AppError('Forbidden: Appointment is already cancelled.', 400));
    }
  }

  // If a doctor is updating, verify they are indeed the doctor assigned
  if (req.user.role === 'doctor') {
    const doctorsCollection = getDoctorsCollection();
    const doctorQuery = {
      $or: [
        ...(ObjectId.isValid(req.user.id) ? [{ userId: new ObjectId(req.user.id) }] : []),
        { userId: req.user.id }
      ]
    };
    const doctor = await doctorsCollection.findOne(doctorQuery);
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

// Reschedule appointment (Patient only, future appointments only)
exports.rescheduleAppointment = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { appointmentDate, appointmentTime } = req.body;

  if (!appointmentDate || !appointmentTime) {
    return next(new AppError('Please specify appointmentDate and appointmentTime.', 400));
  }

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Appointment ID format.', 400));
  }

  const appointmentsCollection = getAppointmentsCollection();
  const appointment = await appointmentsCollection.findOne({ _id: new ObjectId(id) });

  if (!appointment) {
    return next(new AppError('Appointment not found.', 404));
  }

  // 1. Ownership & role verification
  if (req.user.role !== 'patient' || appointment.patientEmail !== req.user.email) {
    return next(new AppError('Forbidden: You can only reschedule your own appointments.', 403));
  }

  // 2. Validate current appointment status
  if (appointment.status === 'completed' || appointment.status === 'cancelled') {
    return next(new AppError('Only future, active appointments can be rescheduled.', 400));
  }

  // 3. Ensure the current appointment is in the future
  const currentDate = new Date();
  const currentAppDate = new Date(`${appointment.appointmentDate}T${appointment.appointmentTime}`);
  if (currentAppDate < currentDate) {
    return next(new AppError('Forbidden: Past appointments cannot be rescheduled.', 400));
  }

  // 4. Fetch doctor profile to validate availability
  const doctorsCollection = getDoctorsCollection();
  const doctor = await doctorsCollection.findOne({ _id: appointment.doctorId });
  if (!doctor) {
    return next(new AppError('Assigned doctor profile not found.', 404));
  }

  // Validate day of week
  const dateObj = new Date(appointmentDate);
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = dayNames[dateObj.getDay()];
  if (doctor.availableDays && doctor.availableDays.length > 0) {
    const isDayAvailable = doctor.availableDays.some(day => day.toLowerCase() === dayOfWeek.toLowerCase());
    if (!isDayAvailable) {
      return next(new AppError(`Doctor is not available on ${dayOfWeek}. Available days: ${doctor.availableDays.join(', ')}`, 400));
    }
  }

  // Validate slot time
  if (doctor.availableSlots && doctor.availableSlots.length > 0) {
    const isSlotAvailable = doctor.availableSlots.some(slot => slot.trim() === appointmentTime.trim());
    if (!isSlotAvailable) {
      return next(new AppError(`Selected slot ${appointmentTime} is not available. Available slots: ${doctor.availableSlots.join(', ')}`, 400));
    }
  }

  // 5. Prevent duplicate booking (same doctor, same date, same time)
  const duplicate = await appointmentsCollection.findOne({
    _id: { $ne: new ObjectId(id) },
    doctorId: appointment.doctorId,
    appointmentDate,
    appointmentTime,
    status: { $ne: 'cancelled' }
  });

  if (duplicate) {
    return next(new AppError('This time slot is already booked for this doctor.', 400));
  }

  // 6. Update appointment
  await appointmentsCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        appointmentDate,
        appointmentTime,
        status: 'pending', // Revert to pending status when rescheduled
        updatedAt: new Date()
      }
    }
  );

  const updatedAppointment = await appointmentsCollection.findOne({ _id: new ObjectId(id) });

  res.status(200).json({
    success: true,
    message: 'Appointment rescheduled successfully.',
    data: updatedAppointment
  });
});
