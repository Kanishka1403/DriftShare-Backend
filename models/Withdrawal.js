const mongoose = require('mongoose');

const WithdrawalRequestSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    driverId: { type: String, ref: 'Driver', required: true },
    amount: { type: Number, required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'completed'],
      default: 'pending'
    },
    upiId: { type: String, required: true },
    mobileNumber: { type: String, required: true },
    requestDate: { type: Date, default: Date.now },
    processedDate: { type: Date },
    transactionId: { type: String },
    remarks: { type: String }
  });
  
  module.exports = mongoose.model('WithdrawalRequest', WithdrawalRequestSchema);