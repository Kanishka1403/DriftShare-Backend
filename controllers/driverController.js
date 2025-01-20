const Driver = require('../models/Driver');
const RideRequest = require('../models/RideRequest');
const Passenger = require('../models/Passenger');
const socketHandlers = require('../services/socketHandlers');
const VehicleTypes = require('../enums/vehicle-type-enum');
exports.addDriver = async (req, res) => {
  try {
    const { firebaseId, username, profile_url, vehicleType } = req.body;
    
    if (!Object.values(VehicleTypes).includes(vehicleType)) {
      return res.status(400).json({ message: 'Invalid vehicle type' });
    }

    const newDriver = new Driver({
      _id: firebaseId, 
      username, 
      profile_url, 
      vehicleType 
    });
    await newDriver.save();
    res.status(201).json({ message: 'Driver added successfully', driver: newDriver });
  } catch (error) {
    res.status(500).json({ message: 'Error adding driver', error: error.message });
  }
};

exports.updateAvailability = async (req, res) => {
  try {
    const { firebaseId, isAvailable } = req.body;
    const driver = await Driver.findById(firebaseId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    driver.isAvailable = isAvailable;
    await driver.save();
    res.status(200).json({ message: 'Driver availability updated successfully',isAvailable: driver.isAvailable });
  } catch (error) {
    res.status(500).json({ message: 'Error updating driver availability', error: error.message });
  }
};
exports.getAvailability = async (req, res) => {
  try {
   const { firebaseId } = req.params;
    const driver = await Driver.findById(firebaseId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    driver.isAvailable
    res.status(200).json({isAvailable: driver.isAvailable });
  } catch (error) {
    res.status(500).json({ message: 'Error updating driver availability', error: error.message });
  }
};

exports.updateLocation = async (req, res) => {
  try {
    const { firebaseId, lat, long, isLocationOn } = req.body;
    const driver = await Driver.findById(firebaseId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }
    driver.isLocationOn = isLocationOn;
    if (isLocationOn) {
      driver.location = { type: 'Point', coordinates: [long, lat] };
    }
    await driver.save();
    res.status(200).json({ message: 'Driver location updated successfully', driver });
  } catch (error) {
    res.status(500).json({ message: 'Error updating driver location', error: error.message });
  }
};

exports.completeRide = async (req, res) => {
  try {
    const { firebaseId, rideRequestId } = req.body;
    const driver = await Driver.findById(firebaseId);
    const rideRequest = await RideRequest.findById(rideRequestId);
    if (!driver || !rideRequest) {
      return res.status(404).json({ message: 'Driver or ride request not found' });
    }
    rideRequest.status = 'completed';
    rideRequest.completedAt = new Date();
    await rideRequest.save();
    driver.isAvailable = true;
    driver.currentRide = null;
    driver.rideHistory.push({ ride: rideRequestId });
    await driver.save();
    const passenger = await Passenger.findById(rideRequest.passenger);
    passenger.rideHistory.push({ _id: rideRequestId });
    await passenger.save();
    const io = socketHandlers.getIO();
    io.to(rideRequest.passenger.toString()).emit('rideCompleted', { rideRequestId });
    res.status(200).json({ message: 'Ride completed successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error completing ride', error: error.message });
  }
};
exports.updateDriver = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    console.log(`Updating driver: ${firebaseId} with body: ${JSON.stringify(req.body)}`);
    const updates = req.body;

    // Use findByIdAndUpdate since _id is the Firebase ID
    const driver = await Driver.findByIdAndUpdate(
      firebaseId,
      updates,
      { new: true }
    );

    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    res.status(200).json({ message: 'Driver updated successfully', driver });
  } catch (error) {
    console.error('Error updating Driver:', error);
    res.status(500).json({ message: 'Error updating Driver', error: error.message });
  }
};