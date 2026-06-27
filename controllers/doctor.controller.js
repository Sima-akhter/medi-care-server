const { ObjectId } = require('mongodb');
const { getDoctorsCollection, getUsersCollection } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// Get all doctors with Search, Sort, Pagination
exports.getAllDoctors = asyncHandler(async (req, res, next) => {
  const doctorsCollection = getDoctorsCollection();

  const { search, specialization, sortBy, order, page = 1, limit = 10, status } = req.query;

  const query = {};

  // For public endpoints, default to verified doctors.
  // Admins can search by passing a custom status.
  if (status) {
    if (status === 'all') {
      // Do not filter by status at all
    } else if (status === 'verified' || status === 'approved') {
      query.$or = [ { status: 'approved' }, { verificationStatus: 'verified' } ];
    } else {
      query.$or = [ { status: status }, { verificationStatus: status } ];
    }
  } else {
    query.$or = [ { status: 'approved' }, { verificationStatus: 'verified' } ];
  }

  // Name or specialization search
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { specialization: { $regex: search, $options: 'i' } }
    ];
  }

  if (specialization) {
    query.specialization = { $regex: specialization, $options: 'i' };
  }

  // Sorting setup
  const sort = {};
  if (sortBy) {
    const sortField = ['fee', 'experience', 'rating'].includes(sortBy) ? sortBy : 'createdAt';
    const sortOrder = order === 'asc' ? 1 : -1;
    sort[sortField] = sortOrder;
  } else {
    sort.createdAt = -1; // Default
  }

  // Pagination calculation
  const skip = (parseInt(page) - 1) * parseInt(limit);
  const parsedLimit = parseInt(limit);

  const total = await doctorsCollection.countDocuments(query);
  const doctors = await doctorsCollection.find(query)
    .sort(sort)
    .skip(skip)
    .limit(parsedLimit)
    .toArray();

  res.status(200).json({
    success: true,
    total,
    page: parseInt(page),
    pages: Math.ceil(total / parsedLimit),
    results: doctors.length,
    data: doctors
  });
});

// Get single doctor profile
exports.getDoctorById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Doctor ID format.', 400));
  }

  const doctorsCollection = getDoctorsCollection();
  const doctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });

  if (!doctor) {
    return next(new AppError('Doctor profile not found.', 404));
  }

  res.status(200).json({
    success: true,
    data: doctor
  });
});

// Register / Create Doctor Profile (Authenticated patient/user)
exports.createDoctorProfile = asyncHandler(async (req, res, next) => {
  const { name, email, specialization, experience, fee, bio } = req.body;

  if (!name || !email || !specialization || !experience || !fee) {
    return next(new AppError('Please fill out all required fields: name, email, specialization, experience, fee.', 400));
  }

  const doctorsCollection = getDoctorsCollection();

  const existingDoctor = await doctorsCollection.findOne({ email });
  if (existingDoctor) {
    return next(new AppError('A doctor profile already exists with this email address.', 400));
  }

  const newDoctor = {
    userId: new ObjectId(req.user.id),
    name,
    email,
    specialization,
    experience: Number(experience),
    fee: Number(fee),
    bio: bio || '',
    rating: 0,
    ratingCount: 0,
    status: 'pending', // default pending admin approval
    createdAt: new Date()
  };

  const result = await doctorsCollection.insertOne(newDoctor);

  res.status(201).json({
    success: true,
    message: 'Doctor application submitted successfully. Pending Admin approval.',
    data: { ...newDoctor, _id: result.insertedId }
  });
});

// Update Doctor Profile
exports.updateDoctorProfile = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { name, specialization, experience, fee, bio } = req.body;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Doctor ID format.', 400));
  }

  const doctorsCollection = getDoctorsCollection();
  const doctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });

  if (!doctor) {
    return next(new AppError('Doctor profile not found.', 404));
  }

  // Must be admin or the doctor who owns the profile
  if (req.user.role !== 'admin' && doctor.userId.toString() !== req.user.id) {
    return next(new AppError('You do not have permission to edit this profile.', 403));
  }

  const updateData = {};
  if (name) updateData.name = name;
  if (specialization) updateData.specialization = specialization;
  if (experience) updateData.experience = Number(experience);
  if (fee) updateData.fee = Number(fee);
  if (bio) updateData.bio = bio;

  updateData.updatedAt = new Date();

  await doctorsCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  const updatedDoctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });

  // Update associated user record as well if name changes
  if (name) {
    const usersCollection = getUsersCollection();
    await usersCollection.updateOne(
      { _id: doctor.userId },
      { $set: { name } }
    );
  }

  res.status(200).json({
    success: true,
    message: 'Doctor profile updated successfully.',
    data: updatedDoctor
  });
});

// Admin Approve/Reject Doctor Status (Admin only)
exports.updateDoctorStatus = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'approved', 'rejected', 'verified'];
  if (!status || !validStatuses.includes(status)) {
    return next(new AppError('Please provide a valid status value.', 400));
  }

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Doctor ID format.', 400));
  }

  const doctorsCollection = getDoctorsCollection();
  const doctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });

  if (!doctor) {
    return next(new AppError('Doctor profile not found.', 404));
  }

  let mappedStatus = status;
  let mappedVerificationStatus = status;

  if (status === 'approved' || status === 'verified') {
    mappedStatus = 'approved';
    mappedVerificationStatus = 'verified';
  } else if (status === 'rejected') {
    mappedStatus = 'rejected';
    mappedVerificationStatus = 'rejected';
  } else {
    mappedStatus = 'pending';
    mappedVerificationStatus = 'pending';
  }

  await doctorsCollection.updateOne(
    { _id: new ObjectId(id) },
    { 
      $set: { 
        status: mappedStatus, 
        verificationStatus: mappedVerificationStatus, 
        updatedAt: new Date() 
      } 
    }
  );

  const usersCollection = getUsersCollection();
  if (mappedStatus === 'approved') {
    // Elevate user role to doctor
    await usersCollection.updateOne(
      { _id: doctor.userId },
      { $set: { role: 'doctor' } }
    );
  } else {
    // Revert user role to patient if rejected or reset
    await usersCollection.updateOne(
      { _id: doctor.userId },
      { $set: { role: 'patient' } }
    );
  }

  const updatedDoctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });

  res.status(200).json({
    success: true,
    message: `Doctor application status updated to '${status}'.`,
    data: updatedDoctor
  });
});

// Delete Doctor profile (Admin only)
exports.deleteDoctor = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid Doctor ID format.', 400));
  }

  const doctorsCollection = getDoctorsCollection();
  const doctor = await doctorsCollection.findOne({ _id: new ObjectId(id) });

  if (!doctor) {
    return next(new AppError('Doctor profile not found.', 404));
  }

  await doctorsCollection.deleteOne({ _id: new ObjectId(id) });

  // Demote associated user
  const usersCollection = getUsersCollection();
  await usersCollection.updateOne(
    { _id: doctor.userId },
    { $set: { role: 'patient' } }
  );

  res.status(200).json({
    success: true,
    message: 'Doctor profile deleted successfully and associated user role reset to patient.'
  });
});
