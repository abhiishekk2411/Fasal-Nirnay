const dns = require('dns');
const mongoose = require('mongoose');

// Configure public DNS servers to resolve MongoDB SRV records reliably on Windows
try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (dnsErr) {
  console.warn('DNS server configuration warning:', dnsErr.message);
}

const connectDB = async () => {
  if (!process.env.MONGODB_URI) {
    console.warn('MONGODB_URI is not set in environment.');
    return;
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000 // 5s timeout to prevent hanging
    });
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`MongoDB Connection Warning: ${error.message}`);
    console.warn(`⚠️ Express server will remain running on port ${process.env.PORT || 5001}.`);
  }
};

module.exports = connectDB;
