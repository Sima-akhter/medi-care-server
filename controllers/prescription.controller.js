const { ObjectId } = require('mongodb');
const { getPrescriptionsCollection, getAppointmentsCollection, getDoctorsCollection } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// Create prescription (Doctor only)
exports.createPrescription = asyncHandler(async (req, res, next) => {
  const { appointmentId, medicines, advice } = req.body;

  if (!appointmentId || !medicines || !Array.isArray(medicines)) {
    return next(new AppError('Please provide appointmentId and a list of medicines.', 400));
  }

  if (!ObjectId.isValid(appointmentId)) {
    return next(new AppError('Invalid Appointment ID format.', 400));
  }

  // 1. Fetch appointment details
  const appointmentsCollection = getAppointmentsCollection();
  const appointment = await appointmentsCollection.findOne({ _id: new ObjectId(appointmentId) });

  if (!appointment) {
    return next(new AppError('Appointment not found.', 404));
  }

  // 2. Fetch doctor profile associated with logged in user
  const doctorsCollection = getDoctorsCollection();
  const doctorQuery = {
    $or: [
      ...(ObjectId.isValid(req.user.id) ? [{ userId: new ObjectId(req.user.id) }] : []),
      { userId: req.user.id }
    ]
  };
  const doctor = await doctorsCollection.findOne(doctorQuery);

  if (!doctor || appointment.doctorId.toString() !== doctor._id.toString()) {
    return next(new AppError('You do not have permission to prescribe for this appointment.', 403));
  }

  // 3. Save prescription
  const prescriptionsCollection = getPrescriptionsCollection();
  const newPrescription = {
    appointmentId: new ObjectId(appointmentId),
    doctorId: doctor._id,
    doctorName: doctor.name,
    patientId: appointment.patientId,
    patientName: appointment.patientName,
    patientEmail: appointment.patientEmail,
    medicines, // Array of { name, dosage, duration }
    advice: advice || '',
    createdAt: new Date()
  };

  const result = await prescriptionsCollection.insertOne(newPrescription);

  // 4. Automatically mark the appointment as completed
  await appointmentsCollection.updateOne(
    { _id: new ObjectId(appointmentId) },
    { $set: { status: 'completed', updatedAt: new Date() } }
  );

  res.status(201).json({
    success: true,
    message: 'Prescription successfully recorded, and appointment marked as completed.',
    data: { ...newPrescription, _id: result.insertedId }
  });
});

// Get prescriptions list (Filtered by Role/Query)
exports.getPrescriptions = asyncHandler(async (req, res, next) => {
  const prescriptionsCollection = getPrescriptionsCollection();
  const filter = {};

  if (req.user.role === 'patient') {
    filter.patientEmail = req.user.email;
  } else if (req.user.role === 'doctor') {
    const doctorsCollection = getDoctorsCollection();
    const doctorQuery = {
      $or: [
        ...(ObjectId.isValid(req.user.id) ? [{ userId: new ObjectId(req.user.id) }] : []),
        { userId: req.user.id }
      ]
    };
    const doctor = await doctorsCollection.findOne(doctorQuery);
    if (!doctor) {
      return next(new AppError('Doctor profile not found.', 404));
    }
    filter.doctorId = doctor._id;
  }
  // Admins see all by default

  const prescriptions = await prescriptionsCollection.find(filter).sort({ createdAt: -1 }).toArray();

  res.status(200).json({
    success: true,
    results: prescriptions.length,
    data: prescriptions
  });
});

// Get single prescription detail
exports.getPrescriptionById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Prescription ID format.', 400));
  }

  const prescriptionsCollection = getPrescriptionsCollection();
  const prescription = await prescriptionsCollection.findOne({ _id: new ObjectId(id) });

  if (!prescription) {
    return next(new AppError('Prescription not found.', 404));
  }

  // Authorizations
  if (req.user.role === 'patient' && prescription.patientEmail !== req.user.email) {
    return next(new AppError('Forbidden: Access is denied.', 403));
  }

  if (req.user.role === 'doctor') {
    const doctorsCollection = getDoctorsCollection();
    const doctorQuery = {
      $or: [
        ...(ObjectId.isValid(req.user.id) ? [{ userId: new ObjectId(req.user.id) }] : []),
        { userId: req.user.id }
      ]
    };
    const doctor = await doctorsCollection.findOne(doctorQuery);
    if (!doctor || prescription.doctorId.toString() !== doctor._id.toString()) {
      return next(new AppError('Forbidden: Access is denied.', 403));
    }
  }

  res.status(200).json({
    success: true,
    data: prescription
  });
});

// Update prescription (Doctor only)
exports.updatePrescription = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { medicines, advice } = req.body;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Prescription ID format.', 400));
  }

  const prescriptionsCollection = getPrescriptionsCollection();
  const prescription = await prescriptionsCollection.findOne({ _id: new ObjectId(id) });

  if (!prescription) {
    return next(new AppError('Prescription not found.', 404));
  }

  // Fetch doctor profile associated with logged in user
  const doctorsCollection = getDoctorsCollection();
  const doctorQuery = {
    $or: [
      ...(ObjectId.isValid(req.user.id) ? [{ userId: new ObjectId(req.user.id) }] : []),
      { userId: req.user.id }
    ]
  };
  const doctor = await doctorsCollection.findOne(doctorQuery);

  if (!doctor || prescription.doctorId.toString() !== doctor._id.toString()) {
    return next(new AppError('You do not have permission to update this prescription.', 403));
  }

  const updateData = {};
  if (medicines) {
    if (!Array.isArray(medicines)) {
      return next(new AppError('Medicines must be an array.', 400));
    }
    updateData.medicines = medicines;
  }
  if (advice !== undefined) {
    updateData.advice = advice;
  }

  updateData.updatedAt = new Date();

  await prescriptionsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  const updatedPrescription = await prescriptionsCollection.findOne({ _id: new ObjectId(id) });

  res.status(200).json({
    success: true,
    message: 'Prescription updated successfully.',
    data: updatedPrescription
  });
});
