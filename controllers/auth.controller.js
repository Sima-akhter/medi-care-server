const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const { getUsersCollection, getDoctorsCollection } = require('../config/db');

exports.createToken = asyncHandler(async (req, res, next) => {
  const { 
    email, 
    name, 
    role, 
    phone, 
    gender, 
    photo, 
    specialization, 
    qualifications, 
    experience, 
    fee, 
    hospitalName 
  } = req.body;

  if (!email) {
    return next(new AppError('Email is required to generate a token.', 400));
  }

  const normalizedEmail = email.toLowerCase();
  const usersCollection = getUsersCollection();
  let user = await usersCollection.findOne({ email: normalizedEmail });

  const resolvedRole = role || 'patient';

  if (!user) {
    // If the user doesn't exist, auto-create a profile (social sign-on integration)
    const newUser = {
      name: name || 'New Patient',
      email: normalizedEmail,
      role: resolvedRole,
      status: 'active',
      phone: phone || '',
      gender: gender || 'Other',
      photo: photo || '',
      createdAt: new Date()
    };
    const result = await usersCollection.insertOne(newUser);
    user = { ...newUser, _id: result.insertedId };
  } else {
    // Update user document custom fields if they exist in the request
    const updateFields = {};
    
    // Safety check: Never demote admin or doctor roles to patient
    if (role && role !== 'patient' && user.role === 'patient') {
      updateFields.role = role;
    }
    
    if (phone) updateFields.phone = phone;
    if (gender) updateFields.gender = gender;
    if (photo) updateFields.photo = photo;
    if (name) updateFields.name = name;
    
    if (Object.keys(updateFields).length > 0) {
      await usersCollection.updateOne(
        { _id: user._id },
        { $set: updateFields }
      );
      user = { ...user, ...updateFields };
    }
  }

  if (user.status === 'blocked') {
    return next(new AppError('Your account has been blocked.', 403));
  }

  // Create doctor profile if role is doctor
  if (user.role === 'doctor') {
    const doctorsCollection = getDoctorsCollection();
    const existingDoctor = await doctorsCollection.findOne({ email: user.email });
    
    if (!existingDoctor) {
      const docFee = Number(fee) || 0;
      const docExp = Number(experience) || 0;

      const newDoctor = {
        userId: user._id,
        name: user.name, // backward compatibility
        doctorName: user.name, // prompt compliance
        email: user.email,
        specialization: specialization || 'General Medicine',
        qualifications: qualifications || 'MBBS',
        experience: docExp,
        fee: docFee, // backward compatibility
        consultationFee: docFee, // prompt compliance
        hospitalName: hospitalName || 'General Hospital',
        profileImage: user.photo || '',
        availableDays: [],
        availableSlots: [],
        status: 'pending', // backward compatibility
        verificationStatus: 'pending', // prompt compliance
        rating: 0,
        ratingCount: 0, // backward compatibility
        totalReviews: 0, // prompt compliance
        bio: '',
        createdAt: new Date()
      };

      await doctorsCollection.insertOne(newDoctor);
    }
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
    secure: true,
    sameSite: 'none',
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
