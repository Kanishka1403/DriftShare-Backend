const mongoose = require('mongoose');
const VehicleTypes = require('../enums/vehicle-type-enum');

const RideRequestSchema = new mongoose.Schema({
  passenger: { type: String, ref: 'Passenger', required: true },
  driver: { type: String, ref: 'Driver' },
  driverNumber:{type: String},
  driverImage: { type: String },
  driverName: { type: String },
  passengerImage: { type: String },
  passengerName: { type: String },
  originalPrices: {
    type: Map,
    of: Number
  },
  discountedPrices: {
    type: Map,
    of: Number
  },
  appliedDiscountPercentage: {
    type: Number,
    default: 0
  },
  finalVehicleType: {
    type: String,
    enum: Object.values(VehicleTypes)
  },
  finalPrice: {
    type: Number
  },
  vehicleType: {
    type: String,
    enum: Object.values(VehicleTypes),
    required: true
  },
  pickupLocation: {
    type: { type: String, enum: ['Point'], required: true },
    address: { type: String, required: true },
    coordinates: { type: [Number], required: true }
  },
  dropLocation: {
    type: { type: String, enum: ['Point'], required: true },
    address: { type: String, required: true },
    coordinates: { type: [Number], required: true }
  },
  preferredGender: { type: String, enum: ['male', 'female', 'any'], default: 'any' }, // Added preferred gender field

  distance: { type: Number, required: true },
  price: { type: Number, required: false },
  status: { type: String, enum: ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'failed'], default: 'pending' },
  paymentStatus: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  paymentMethod: { type: String, enum: ['wallet', 'cash', 'card'] },
  notifiedDrivers: [{ type: String, ref: 'Driver' }],
  feedback: {
    rating: { type: Number, min: 1, max: 5 },
    comment: String
  },
  createdAt: { type: Date, default: Date.now },
  completedAt: { type: Date }
});

RideRequestSchema.index({ pickupLocation: '2dsphere' });
RideRequestSchema.index({ dropLocation: '2dsphere' });

module.exports = mongoose.model('RideRequest', RideRequestSchema);
