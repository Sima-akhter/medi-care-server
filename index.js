require("dotenv").config();
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { connectDB } = require("./config/db");
const AppError = require("./utils/appError");
const errorHandler = require("./middlewares/error.middleware");

// Route imports
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const doctorRoutes = require("./routes/doctor.routes");
const appointmentRoutes = require("./routes/appointment.routes");
const reviewRoutes = require("./routes/review.routes");
const prescriptionRoutes = require("./routes/prescription.routes");
const paymentRoutes = require("./routes/payment.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const uploadRoutes = require("./routes/upload.routes");

const app = express();
const port = process.env.PORT || 5000;

// 1. Initialize Database Connection immediately at the top level.
// Mongoose is smart enough to buffer requests until the connection is open.
connectDB();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    process.env.CLIENT_URL || 'http://localhost:3000'
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(cookieParser());

// Base check endpoint
app.get("/", (req, res) => {
  res.status(200).json({
    status: "success",
    message: "MediCare Connect API server is running smoothly.",
  });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/doctors", doctorRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/prescriptions", prescriptionRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/uploads", uploadRoutes);

// Catch-all route for undefined API endpoints
app.use((req, res, next) => {
  next(new AppError(`Cannot find ${req.originalUrl} on this server.`, 404));
});

// 2. Central Error Handler Middleware MUST be at the very bottom
app.use(errorHandler);

// 3. Local Development execution
// Vercel ignores this, but it keeps your local 'npm run dev' working

  app.listen(port, () => {
    console.log(`MediCare Connect server is running locally on port ${port}`);
  });


// Exporting for Vercel Serverless Functions
module.exports = app;
