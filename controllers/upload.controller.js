const cloudinary = require('../config/cloudinary');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// @desc    Upload image to Cloudinary (Base64)
// @route   POST /api/uploads/image
// @access  Private
exports.uploadImage = asyncHandler(async (req, res, next) => {
  const { image } = req.body;

  if (!image) {
    return next(new AppError('No image payload provided. Please send base64 data.', 400));
  }

  try {
    const uploadResponse = await cloudinary.uploader.upload(image, {
      folder: 'medicare_connect',
      resource_type: 'image',
    });

    res.status(200).json({
      success: true,
      message: 'Image uploaded successfully to Cloudinary.',
      url: uploadResponse.secure_url,
    });
  } catch (err) {
    return next(new AppError(`Cloudinary Upload failed: ${err.message}`, 500));
  }
});
