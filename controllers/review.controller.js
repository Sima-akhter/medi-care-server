const { ObjectId } = require('mongodb');
const { getReviewsCollection, getDoctorsCollection, getAppointmentsCollection } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// Create a review for a doctor (Patient only)
exports.createReview = asyncHandler(async (req, res, next) => {
  const { doctorId, rating, comment } = req.body;

  if (!doctorId || !rating || !comment) {
    return next(new AppError('Please provide doctorId, rating, and comment fields.', 400));
  }

  const parsedRating = Number(rating);
  if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
    return next(new AppError('Rating must be a numeric value between 1 and 5.', 400));
  }

  if (!ObjectId.isValid(doctorId)) {
    return next(new AppError('Invalid Doctor ID format.', 400));
  }

  // 1. Verify doctor exists and is approved
  const doctorsCollection = getDoctorsCollection();
  const doctor = await doctorsCollection.findOne({ _id: new ObjectId(doctorId), status: 'approved' });
  if (!doctor) {
    return next(new AppError('Doctor profile not found or is currently inactive.', 404));
  }

  // 2. Ensure patient has completed appointment with this doctor to leave review
  const appointmentsCollection = getAppointmentsCollection();
  const completedAppointment = await appointmentsCollection.findOne({
    patientEmail: req.user.email,
    doctorId: new ObjectId(doctorId),
    status: 'completed'
  });

  if (!completedAppointment) {
    return next(new AppError('You can only review doctors with whom you have completed appointments.', 403));
  }

  // 3. Prevent duplicate reviews by same patient for same doctor
  const reviewsCollection = getReviewsCollection();
  const existingReview = await reviewsCollection.findOne({
    doctorId: new ObjectId(doctorId),
    patientId: new ObjectId(req.user.id)
  });

  if (existingReview) {
    return next(new AppError('You have already submitted a review for this doctor.', 400));
  }

  // 4. Save review
  const newReview = {
    doctorId: new ObjectId(doctorId),
    patientId: new ObjectId(req.user.id),
    patientName: req.user.name,
    rating: parsedRating,
    comment,
    createdAt: new Date()
  };

  await reviewsCollection.insertOne(newReview);

  // 5. Re-calculate ratings stats for Doctor profile
  const doctorReviews = await reviewsCollection.find({ doctorId: new ObjectId(doctorId) }).toArray();
  const ratingCount = doctorReviews.length;
  const avgRating = doctorReviews.reduce((sum, rev) => sum + rev.rating, 0) / ratingCount;
  const roundedRating = Math.round(avgRating * 10) / 10; // e.g. 4.6

  await doctorsCollection.updateOne(
    { _id: new ObjectId(doctorId) },
    { $set: { rating: roundedRating, ratingCount } }
  );

  res.status(201).json({
    success: true,
    message: 'Review submitted successfully.',
    data: newReview
  });
});

// Get reviews for a doctor (Public)
exports.getDoctorReviews = asyncHandler(async (req, res, next) => {
  const { doctorId } = req.params;

  if (!ObjectId.isValid(doctorId)) {
    return next(new AppError('Invalid Doctor ID format.', 400));
  }

  const reviewsCollection = getReviewsCollection();
  const reviews = await reviewsCollection.find({ doctorId: new ObjectId(doctorId) }).sort({ createdAt: -1 }).toArray();

  res.status(200).json({
    success: true,
    results: reviews.length,
    data: reviews
  });
});

// Update Review (Patient/Owner only)
exports.updateReview = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { rating, comment } = req.body;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Review ID format.', 400));
  }

  const reviewsCollection = getReviewsCollection();
  const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });

  if (!review) {
    return next(new AppError('Review not found.', 404));
  }

  // Verify that the logged-in patient is the author
  if (review.patientId.toString() !== req.user.id) {
    return next(new AppError('You do not have permission to edit this review.', 403));
  }

  const updateData = {};
  if (rating !== undefined) {
    const parsedRating = Number(rating);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return next(new AppError('Rating must be a numeric value between 1 and 5.', 400));
    }
    updateData.rating = parsedRating;
  }

  if (comment !== undefined) {
    updateData.comment = comment;
  }

  updateData.updatedAt = new Date();

  await reviewsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  // Re-calculate doctor ratings stats
  const doctorsCollection = getDoctorsCollection();
  const doctorReviews = await reviewsCollection.find({ doctorId: review.doctorId }).toArray();
  const ratingCount = doctorReviews.length;
  const avgRating = ratingCount > 0 ? doctorReviews.reduce((sum, rev) => sum + rev.rating, 0) / ratingCount : 0;
  const roundedRating = Math.round(avgRating * 10) / 10;

  await doctorsCollection.updateOne(
    { _id: review.doctorId },
    { $set: { rating: roundedRating, ratingCount } }
  );

  const updatedReview = await reviewsCollection.findOne({ _id: new ObjectId(id) });

  res.status(200).json({
    success: true,
    message: 'Review updated successfully.',
    data: updatedReview
  });
});

// Delete Review (Patient/Owner or Admin only)
exports.deleteReview = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Review ID format.', 400));
  }

  const reviewsCollection = getReviewsCollection();
  const review = await reviewsCollection.findOne({ _id: new ObjectId(id) });

  if (!review) {
    return next(new AppError('Review not found.', 404));
  }

  // Only the patient who wrote it or an Admin can delete it
  if (req.user.role !== 'admin' && review.patientId.toString() !== req.user.id) {
    return next(new AppError('You do not have permission to delete this review.', 403));
  }

  await reviewsCollection.deleteOne({ _id: new ObjectId(id) });

  // Re-calculate doctor ratings stats
  const doctorsCollection = getDoctorsCollection();
  const doctorReviews = await reviewsCollection.find({ doctorId: review.doctorId }).toArray();
  const ratingCount = doctorReviews.length;
  const avgRating = ratingCount > 0 ? doctorReviews.reduce((sum, rev) => sum + rev.rating, 0) / ratingCount : 0;
  const roundedRating = Math.round(avgRating * 10) / 10;

  await doctorsCollection.updateOne(
    { _id: review.doctorId },
    { $set: { rating: roundedRating, ratingCount } }
  );

  res.status(200).json({
    success: true,
    message: 'Review deleted successfully.'
  });
});

// Get all reviews (Public for testimonials)
exports.getAllReviews = asyncHandler(async (req, res, next) => {
  const reviewsCollection = getReviewsCollection();
  const reviews = await reviewsCollection.find().sort({ createdAt: -1 }).limit(10).toArray();
  res.status(200).json({
    success: true,
    data: reviews
  });
});
