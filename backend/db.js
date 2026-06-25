const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI not set in .env — cannot start without DB config');
    process.exit(1);
  }

  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected:', mongoose.connection.name);
  });
  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });
  mongoose.connection.on('disconnected', () => {
    console.warn('⚠️  MongoDB disconnected — attempting reconnect');
  });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
}

module.exports = { connectDB };