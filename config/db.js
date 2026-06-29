const { MongoClient } = require('mongodb');
const dns = require('dns');
require('dotenv').config();

// Configure fallback DNS servers defensively to prevent local network SRV lookup ETIMEOUTs
try {
  dns.setServers(["1.1.1.1", "8.8.8.8"]);
} catch (dnsErr) {
  console.warn("Server DNS fallback configuration warning:", dnsErr.message);
}

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error("MONGO_URI is not defined in environment variables.");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 5000
});

let db = null;
let dbConnectionPromise = null;

async function connectDB() {
  if (db) return db;

  if (!dbConnectionPromise) {
    dbConnectionPromise = client.connect()
      .then(async () => {
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

        return db;
      })
      .catch((error) => {
        console.error("MongoDB connection failed:", error);
        dbConnectionPromise = null; // Reset cached promise so future requests can retry
        throw error;
      });
  }

  return dbConnectionPromise;
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
