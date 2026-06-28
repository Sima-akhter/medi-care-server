const { ObjectId } = require('mongodb');
const { getUsersCollection, getDoctorsCollection } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// Get all users (Admin only)
exports.getAllUsers = asyncHandler(async (req, res, next) => {
  const usersCollection = getUsersCollection();
  
  const { search, role } = req.query;
  const filter = {};
  
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }
  
  if (role) {
    filter.role = role;
  }

  const users = await usersCollection.find(filter).sort({ createdAt: -1 }).toArray();

  res.status(200).json({
    success: true,
    results: users.length,
    data: users
  });
});

// Get current user profile (Authenticated)
exports.getMe = asyncHandler(async (req, res, next) => {
  const usersCollection = getUsersCollection();
  const userId = req.user.id;

  const userQuery = {
    $or: [
      ...(ObjectId.isValid(userId) ? [{ _id: new ObjectId(userId) }] : []),
      { _id: userId }
    ]
  };
  const user = await usersCollection.findOne(userQuery);
  if (!user) {
    return next(new AppError('No user found with this ID.', 404));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// Update current user profile (Authenticated)
exports.updateMe = asyncHandler(async (req, res, next) => {
  const usersCollection = getUsersCollection();
  const userId = req.user.id;
  
  const { name, phone, gender, photo, image, profileImage } = req.body;

  const userQuery = {
    $or: [
      ...(ObjectId.isValid(userId) ? [{ _id: new ObjectId(userId) }] : []),
      { _id: userId }
    ]
  };

  const resolvedPhoto = photo || image || profileImage;
  const updateFields = { updatedAt: new Date() };
  if (name) updateFields.name = name;
  if (phone !== undefined) updateFields.phone = phone;
  if (gender !== undefined) updateFields.gender = gender;
  if (resolvedPhoto !== undefined) {
    updateFields.photo = resolvedPhoto;
    updateFields.image = resolvedPhoto;
  }

  if (Object.keys(updateFields).length <= 1) { // only updatedAt means nothing was sent
    return next(new AppError('Please provide at least one field to update.', 400));
  }

  await usersCollection.updateOne(
    userQuery,
    { $set: updateFields }
  );

  // Sync to doctor profile if user is a doctor
  if (req.user.role === 'doctor') {
    const doctorsCollection = getDoctorsCollection();
    const docUpdate = {};
    if (name) {
      docUpdate.name = name;
      docUpdate.doctorName = name;
    }
    if (resolvedPhoto) {
      docUpdate.profileImage = resolvedPhoto;
    }
    if (Object.keys(docUpdate).length > 0) {
      await doctorsCollection.updateOne(
        { userId: ObjectId.isValid(userId) ? new ObjectId(userId) : userId },
        { $set: docUpdate }
      );
    }
  }

  const updatedUser = await usersCollection.findOne(userQuery);

  res.status(200).json({
    success: true,
    message: 'Profile updated successfully.',
    data: updatedUser
  });
});

// Update user status or role (Admin only)
exports.updateUserStatusRole = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { role, status } = req.body;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid user ID format.', 400));
  }

  if (req.user.id === id && status === 'blocked') {
    return next(new AppError('You cannot block or suspend your own administrator account.', 400));
  }

  const usersCollection = getUsersCollection();
  const updateData = {};
  
  if (role) {
    if (!['admin', 'doctor', 'patient'].includes(role)) {
      return next(new AppError('Invalid role specified.', 400));
    }
    updateData.role = role;
  }

  if (status) {
    if (!['active', 'blocked'].includes(status)) {
      return next(new AppError('Invalid status specified.', 400));
    }
    updateData.status = status;
  }

  if (Object.keys(updateData).length === 0) {
    return next(new AppError('Please provide a role or status parameter to update.', 400));
  }

  updateData.updatedAt = new Date();

  const result = await usersCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updateData }
  );

  if (result.matchedCount === 0) {
    return next(new AppError('User not found.', 404));
  }

  const updatedUser = await usersCollection.findOne({ _id: new ObjectId(id) });

  res.status(200).json({
    success: true,
    message: 'User settings updated successfully.',
    data: updatedUser
  });
});

// Delete a user (Admin only)
exports.deleteUser = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid user ID format.', 400));
  }

  const usersCollection = getUsersCollection();
  const result = await usersCollection.deleteOne({ _id: new ObjectId(id) });

  if (result.deletedCount === 0) {
    return next(new AppError('User not found.', 404));
  }

  res.status(200).json({
    success: true,
    message: 'User deleted successfully.'
  });
});

// Get user details by ID (Admin or Self only)
exports.getUserById = asyncHandler(async (req, res, next) => {
  const { id } = req.params;

  if (!ObjectId.isValid(id)) {
    return next(new AppError('Invalid user ID format.', 400));
  }

  if (req.user.role !== 'admin' && req.user.id !== id) {
    return next(new AppError('Forbidden: Access is denied.', 403));
  }

  const usersCollection = getUsersCollection();
  const user = await usersCollection.findOne({ _id: new ObjectId(id) });

  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  res.status(200).json({
    success: true,
    data: user
  });
});

// Toggle Favorite Doctor (Patient only)
exports.toggleFavoriteDoctor = asyncHandler(async (req, res, next) => {
  const { doctorId } = req.body;
  const userId = req.user.id;

  if (!doctorId) {
    return next(new AppError('Please provide a doctorId.', 400));
  }

  const usersCollection = getUsersCollection();
  const userQuery = {
    $or: [
      ...(ObjectId.isValid(userId) ? [{ _id: new ObjectId(userId) }] : []),
      { _id: userId }
    ]
  };

  const user = await usersCollection.findOne(userQuery);
  if (!user) {
    return next(new AppError('User not found.', 404));
  }

  const favorites = user.favorites || [];
  const hasFavorited = favorites.includes(doctorId);

  if (hasFavorited) {
    await usersCollection.updateOne(userQuery, { $pull: { favorites: doctorId } });
  } else {
    await usersCollection.updateOne(userQuery, { $addToSet: { favorites: doctorId } });
  }

  const updatedUser = await usersCollection.findOne(userQuery);

  res.status(200).json({
    success: true,
    message: hasFavorited ? 'Doctor removed from favorites.' : 'Doctor added to favorites.',
    data: updatedUser.favorites || []
  });
});
