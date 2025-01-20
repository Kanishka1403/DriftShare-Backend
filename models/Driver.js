const mongoose = require('mongoose');
const VehicleTypes = require('../enums/vehicle-type-enum');
const DriverSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Firebase ID
  username: { type: String, required: true },
  profile_url: { type: String,default: ''  },
  walletBalance: { type: Number, default: 0 },
  isAvailable: { type: Boolean, default: true },
  isLocationOn: { type: Boolean, default: false },
  upiId: { type: String },
  mobileNumber: { type: String },
  vehicleType: {
    type: String,
    enum: Object.values(VehicleTypes),
    required: true
  },
  pushToken: { type: String },
  location: {
    type: { type: String, default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }
  },
  currentRide: { type: String, ref: 'RideRequest' },
  rideHistory: [{ type: String, ref: 'RideRequest' }],
  transactionHistory: [{ type: String, ref: 'Transaction' }],
  averageRating: { type: Number, default: 0 },
  totalRides: { type: Number, default: 0 }
});

DriverSchema.index({ location: '2dsphere' });
DriverSchema.index({ isLocationOn: 1, isAvailable: 1, vehicleType: 1 });

module.exports = mongoose.model('Driver', DriverSchema);