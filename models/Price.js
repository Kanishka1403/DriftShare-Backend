const mongoose = require('mongoose');
const VehicleTypes = require('../enums/vehicle-type-enum');

const PriceSchema = new mongoose.Schema({
  vehicleType: {
    type: String,
    enum: Object.values(VehicleTypes),
    required: true
  },
  pricePerKilometer: {
    type: Number,
    required: true
  }
}, { timestamps: true });

module.exports = mongoose.model('Price', PriceSchema);