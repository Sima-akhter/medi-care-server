const { ObjectId } = require('mongodb');
const { getUsersCollection } = require('../config/db');
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

  const user = await usersCollection.findOne({ _id: new ObjectId(userId) });
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
  
  const { name } = req.body;
  if (!name) {
    return next(new AppError('Name field is required.', 400));
  }

  await usersCollection.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { name, updatedAt: new Date() } }
  );

  const updatedUser = await usersCollection.findOne({ _id: new ObjectId(userId) });

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
