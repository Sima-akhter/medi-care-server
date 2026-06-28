const { ObjectId } = require('mongodb');
const { getPaymentsCollection, getAppointmentsCollection } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_secret_key_1234');

// Create Stripe Payment Intent (Patient only)
exports.createPaymentIntent = asyncHandler(async (req, res, next) => {
  const { appointmentId } = req.body;

  if (!appointmentId) {
    return next(new AppError('Please provide an appointmentId.', 400));
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

  // Verify ownership
  if (appointment.patientEmail !== req.user.email) {
    return next(new AppError('Unauthorized access: This appointment does not belong to you.', 403));
  }

  if (appointment.paymentStatus === 'paid') {
    return next(new AppError('This appointment has already been paid.', 400));
  }

  // Stripe expects the amount in cents
  const amount = Math.round(appointment.fee * 100);

  if (amount <= 0) {
    return next(new AppError('Invalid payment amount.', 400));
  }

  // Create payment intent
  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        appointmentId: appointmentId.toString(),
        patientEmail: req.user.email
      }
    });
  } catch (err) {
    return next(new AppError(`Stripe Integration Error: ${err.message}`, 400));
  }

  res.status(200).json({
    success: true,
    clientSecret: paymentIntent.client_secret,
    transactionId: paymentIntent.id
  });
});

// Save Payment Record (Patient only)
exports.savePayment = asyncHandler(async (req, res, next) => {
  const { appointmentId, transactionId, amount } = req.body;

  if (!appointmentId || !transactionId || !amount) {
    return next(new AppError('Please provide appointmentId, transactionId, and amount.', 400));
  }

  if (!ObjectId.isValid(appointmentId)) {
    return next(new AppError('Invalid Appointment ID format.', 400));
  }

  const appointmentsCollection = getAppointmentsCollection();
  const appointment = await appointmentsCollection.findOne({ _id: new ObjectId(appointmentId) });

  if (!appointment) {
    return next(new AppError('Appointment not found.', 404));
  }

  // 1. Create a payment record
  const paymentsCollection = getPaymentsCollection();
  const newPayment = {
    patientId: new ObjectId(req.user.id),
    patientEmail: req.user.email,
    appointmentId: new ObjectId(appointmentId),
    doctorId: appointment.doctorId,
    doctorName: appointment.doctorName,
    amount: Number(amount),
    transactionId,
    status: 'succeeded',
    createdAt: new Date()
  };

  const result = await paymentsCollection.insertOne(newPayment);

  // 2. Update appointment payment status and confirmation status
  await appointmentsCollection.updateOne(
    { _id: new ObjectId(appointmentId) },
    {
      $set: {
        paymentStatus: 'paid',
        status: 'pending',
        updatedAt: new Date()
      }
    }
  );

  res.status(201).json({
    success: true,
    message: 'Payment saved successfully. Appointment is now confirmed.',
    data: { ...newPayment, _id: result.insertedId }
  });
});

// Get Payment Records (Admin, Patient - filtered)
exports.getPayments = asyncHandler(async (req, res, next) => {
  const paymentsCollection = getPaymentsCollection();
  const filter = {};

  // Patients see their own payments. Admins see all.
  if (req.user.role === 'patient') {
    filter.patientEmail = req.user.email;
  } else if (req.user.role !== 'admin') {
    return next(new AppError('Forbidden: Unauthorized view role.', 403));
  }

  const payments = await paymentsCollection.find(filter).sort({ createdAt: -1 }).toArray();

  res.status(200).json({
    success: true,
    results: payments.length,
    data: payments
  });
});
