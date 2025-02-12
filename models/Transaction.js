const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // Generated unique ID
    userId: { type: String, required: true }, // Driver or Passenger ID
    userType: { type: String, enum: ['driver', 'passenger'], required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: false },
    type: { type: String, enum: ['credit', 'debit'], required: true },
    paymentMethod: { type: String, enum: ['Wallet', 'Cash', 'card','upi'], required: true },
    rideId: { type: String, ref: 'RideRequest' },
    timestamp: { type: Date, default: Date.now }
  });

  module.exports = mongoose.model('Transaction', TransactionSchema);