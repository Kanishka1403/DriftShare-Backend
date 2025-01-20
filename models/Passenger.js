const mongoose = require('mongoose');

const PassengerSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Firebase ID
  username: { type: String, required: true },
  profile_url:{ type: String  ,default: ''  },
  walletBalance: { type: Number, default: 0 },
  pushToken: { type: String },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  rideHistory: [{ type: mongoose.Schema.Types.ObjectId, ref: 'RideRequest' }],
  transactionHistory: [{ type: String, ref: 'Transaction' }]
});
PassengerSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Passenger', PassengerSchema);