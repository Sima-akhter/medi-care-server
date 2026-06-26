const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { getUsersCollection } = require('../config/db');

exports.createToken = asyncHandler(async (req, res, next) => {
  const { email, name, role } = req.body;

  if (!email) {
    return next(new AppError('Email is required to generate a token.', 400));
  }

  const usersCollection = getUsersCollection();
  let user = await usersCollection.findOne({ email });

  if (!user) {
    // If the user doesn't exist, auto-create a profile (useful for social sign-on integration)
    const newUser = {
      name: name || 'New Patient',
      email,
      role: role || 'patient', // defaults to patient role
      status: 'active',
      createdAt: new Date()
    };
    const result = await usersCollection.insertOne(newUser);
    user = { ...newUser, _id: result.insertedId };
  }

  if (user.status === 'blocked') {
    return next(new AppError('Your account has been blocked.', 403));
  }

  // Create standard JWT token
  const token = jwt.sign(
    { id: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET || 'medicare-secret-key-xyz-987',
    { expiresIn: '7d' }
  );

  // Set httpOnly secure cookie
  res.cookie('token', token, {
    httpOnly: true,
    secure: true, // true to allow sameSite: 'none' and secure context
    sameSite: 'none', // Allow cross-origin cookie sharing
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  });

  res.status(200).json({
    success: true,
    token,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status
    }
  });
});

exports.logout = asyncHandler(async (req, res, next) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });

  res.status(200).json({
    success: true,
    message: 'Successfully logged out.'
  });
});
