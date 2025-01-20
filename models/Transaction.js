const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Generated unique ID
    userId: { type: String, required: true }, // Driver or Passenger ID
    userType: { type: String, enum: ['driver', 'passenger'], required: true },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    paymentMethod: { type: String, enum: ['wallet', 'cash', 'card','upi'], required: true },
    rideId: { type: String, ref: 'RideRequest' },
    description: String,
    timestamp: { type: Date, default: Date.now }
  });

  module.exports = mongoose.model('Transaction', TransactionSchema);