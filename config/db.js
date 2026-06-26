const { MongoClient } = require('mongodb');
require('dotenv').config();

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("MONGO_URI is not defined in environment variables.");
  process.exit(1);
}

const client = new MongoClient(uri);

let db = null;

async function connectDB() {
  try {
    await client.connect();
    db = client.db('mediCareConnect');
    console.log("Successfully connected to MongoDB - Database: 'mediCareConnect'");

    // Initialize indexes for performance and uniqueness
    const users = db.collection('users');
    await users.createIndex({ email: 1 }, { unique: true });

    const doctors = db.collection('doctors');
    await doctors.createIndex({ specialization: 1 });
    await doctors.createIndex({ fee: 1 });
    await doctors.createIndex({ rating: -1 });

    const appointments = db.collection('appointments');
    await appointments.createIndex({ patientEmail: 1 });
    await appointments.createIndex({ doctorId: 1 });

  } catch (error) {
    console.error("MongoDB connection failed:", error);
    process.exit(1);
  }
}

function getCollection(name) {
  if (!db) {
    throw new Error("Database is not connected. Call connectDB first.");
  }
  return db.collection(name);
}

module.exports = {
  connectDB,
  client,
  getUsersCollection: () => getCollection('users'),
  getDoctorsCollection: () => getCollection('doctors'),
  getAppointmentsCollection: () => getCollection('appointments'),
  getReviewsCollection: () => getCollection('reviews'),
  getPaymentsCollection: () => getCollection('payments'),
  getPrescriptionsCollection: () => getCollection('prescriptions'),
};
