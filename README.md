# Medicare Connect Server - Express API Backend

This is the Node.js / Express backend server for Medicare Connect. It manages MongoDB database collections, parses and validates JWT tokens, handles Stripe payments, and registers Cloudinary image streams.

## ⚙️ Environment Variables Config

Create a `.env` file in the server root folder:

```env
PORT=5000
NODE_ENV=development

# JWT security key
JWT_SECRET=your_super_secret_jwt_signature_key

# MongoDB Connection
MONGO_URI=mongodb+srv://<username>:<password>@cluster.mongodb.net/mediCareConnect

# Stripe Secret Keys (from stripe dashboard)
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...

# Cloudinary Storage API
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret
```

---

## 🔒 JWT Authentication & Middleware Protection

The backend uses a standard JSON Web Token system:
1. **Bearer Authorization Parsing:** Client requests forward token strings inside header parameters: `Authorization: Bearer <token>`.
2. **verifyToken:** Validates token signatures, decodes expiration claims, checks if the user is suspended/blocked, and sets `req.user` payload.
3. **Role Guards:**
   - `verifyAdmin`: Restricted to admin accounts (`role === 'admin'`).
   - `verifyDoctor`: Restricted to doctor accounts (`role === 'doctor'`).
   - `verifyPatient`: Restricted to patient accounts (`role === 'patient'`).

---

## 🗄️ Database Collections Design

The system runs on native MongoDB collections:
* **`users`:** Holds name, email, role, phone, gender, photo URL, status, and favorites array. (Email is indexed uniquely).
* **`doctors`:** Holds bio, specialization, hospitalName, experience, consultationFee, availableDays, and availableSlots.
* **`appointments`:** Logs scheduled time, status (pending, confirmed, completed, cancelled), paymentStatus (paid, unpaid), and symptoms.
* **`reviews`:** Stores patient comments, ratings, and doctor ID links.
* **`payments`:** Holds Stripe charge tokens, transaction ID, and amount records.
* **`prescriptions`:** Holds diagnosis notes and medication dosages.

---

## 🏃 Run API Backend Locally

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run backend API watch mode:
   ```bash
   npm run dev
   ```
3. Base URL: `http://localhost:5000/api`.
