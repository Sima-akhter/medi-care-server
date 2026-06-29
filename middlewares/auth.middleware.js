const jwt = require('jsonwebtoken');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { getUsersCollection } = require('../config/db');

const verifyToken = asyncHandler(async (req, res, next) => {
  let token = null;

  // Check cookies first
  if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }
  // Check authorization header
  else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return next(new AppError('Authentication token is missing. Please log in.', 401));
  }

  // Decode token signature against JWT_SECRET key configured in .env variables
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'medicare-secret-key-xyz-987');
  } catch (err) {
    return next(new AppError('Session expired or invalid token. Please log in again.', 401));
  }

  const usersCollection = getUsersCollection();
  const user = await usersCollection.findOne({ email: decoded.email });

  if (!user) {
    return next(new AppError('User account associated with this token does not exist.', 401));
  }

  if (user.status === 'blocked') {
    return next(new AppError('Access denied. Your account is currently blocked.', 403));
  }

  req.user = {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role, // 'admin', 'doctor', 'patient'
    status: user.status
  };

  next();
});

const verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return next(new AppError('Forbidden: Access is restricted to Administrators only.', 403));
  }
  next();
};

const verifyDoctor = (req, res, next) => {
  if (!req.user || req.user.role !== 'doctor') {
    return next(new AppError('Forbidden: Access is restricted to Doctors only.', 403));
  }
  next();
};

const verifyPatient = (req, res, next) => {
  if (!req.user || req.user.role !== 'patient') {
    return next(new AppError('Forbidden: Access is restricted to Patients only.', 403));
  }
  next();
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyDoctor,
  verifyPatient
};
