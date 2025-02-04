const RideRequest = require('../models/RideRequest');
const { findNearbyDriversByVehicleType } = require('../services/locationService');
const socketHandlers = require('../services/socketHandlers');
const Driver = require('../models/Driver');
const Passenger = require('../models/Passenger');
const Price = require('../models/Price');
const Discount = require('../models/Discount');
const VehicleTypes = require('../enums/vehicle-type-enum');
const { sendPushNotification } = require('../utils/fcmUtils');

exports.getRideRequestStatus = async (req, res) => {
  try {
    const { rideRequestId } = req.params;

    const rideRequest = await RideRequest.findOne({_id: rideRequestId})
      .populate('passenger', 'username')
      .populate('driver', 'username location');

    if (!rideRequest) {
      return res.status(404).json({ message: 'Ride request not found' });
    }
     console.log(`rideRequest: ${rideRequest}`);
    res.status(200).json({ rideRequest });
  } catch (error) {
    console.error('Error getting ride request status:', error);
    res.status(500).json({ message: 'Error getting ride request status', error: error.message });
  }
};

exports.createRideRequest = async (req, res) => {
  try {
    const {
      passengerId,
      pickupLocation,
      dropLocation,
      distance,
      passengerMobile,
      paymentMethod,
      vehicleType
    } = req.body;

    if (!passengerId) {
      return res.status(400).json({ message: 'Passenger ID is required' });
    }
    const passenger = await Passenger.findById(passengerId);

    if (!passenger) {
      return res.status(404).json({ message: 'Passenger not found' });
    }
    // Determine which vehicle types to consider
    let consideredTypes = [vehicleType];
    if (vehicleType === VehicleTypes.CAR_ANY) {
      consideredTypes = [VehicleTypes.CAR_MINI, VehicleTypes.CAR_SEDAN , VehicleTypes.CAR_SUV];
    }

    // Fetch prices for considered vehicle types
    const vehiclePrices = await Price.find({ vehicleType: { $in: consideredTypes } });
    const discount = await Discount.findOne({ isActive: true });

    let discountPercentage = 0;
    if (discount && new Date() >= discount.validFrom && new Date() <= discount.validTo) {
      discountPercentage = discount.percentage;
    }

    const calculateDiscountedPrice = (basePrice) => {
      return basePrice - (basePrice * (discountPercentage / 100));
    };

    // Calculate prices for considered vehicle types
    const prices = {};
    const discountedPrices = {};
    vehiclePrices.forEach(vp => {
      const basePrice = vp.pricePerKilometer * distance;
      prices[vp.vehicleType] = basePrice;
      discountedPrices[vp.vehicleType] = calculateDiscountedPrice(basePrice);
    });

    console.log(`Original prices: ${JSON.stringify(prices)}`);
    console.log(`Discounted prices: ${JSON.stringify(discountedPrices)}`);

    const rideRequest = new RideRequest({
      paymentMethod,
      passenger: passengerId,
      passengerName: passenger.username,
      passengerImage: passenger.profile_url,
      vehicleType,
      pickupLocation: {
        type: "Point",
        address: pickupLocation.address,
        coordinates: [pickupLocation.long, pickupLocation.lat]
      },
      dropLocation: {
        type: "Point",
        address: dropLocation.address,
        coordinates: [dropLocation.long, dropLocation.lat],
      },
      distance,
      originalPrices: prices,
      discountedPrices: Object.fromEntries(
        Object.entries(discountedPrices).map(([key, value]) => [key, Number(value)])
      ),
      appliedDiscountPercentage: discountPercentage,
      passengerMobile,
      status: 'pending'
    });
    await rideRequest.save();

    console.log(`New ride request created: ${rideRequest._id}`);
    await Passenger.findByIdAndUpdate(passengerId, {
      $push: { rideHistory: rideRequest._id }
    });

    const nearbyDrivers = await findNearbyDriversByVehicleType(pickupLocation.lat, pickupLocation.long, vehicleType);
    console.log(`Found ${nearbyDrivers.length} nearby drivers for ${vehicleType}`);

    const io = socketHandlers.getIO();
    const driverNamespace = io.of('/driver');
    nearbyDrivers.forEach(async (driver) => {
      console.log(`Notifying driver ${driver._id} about new ride request`);
      const driverPrice = discountedPrices[driver.vehicleType];
      if (driverPrice) {
        driverNamespace.to(driver._id.toString()).emit('newRideRequest', {
          rideRequestId: rideRequest._id,
          pickupLocation,
          passengerName: passenger.username,
          paymentMethod,
          vehicleType: driver.vehicleType,
          passengerImage: passenger.profile_url,
          dropLocation,
          distance,
          price: driverPrice
        });
        if (driver.pushToken) {
          console.log('Sending push notification to driver');
          await sendPushNotification(driver.pushToken, 'New Ride Request', 'You have a new ride request', {
            rideRequestId: rideRequest._id,
            pickupLocation,
            dropLocation,
          },'loud_alarm_sound.mp3');
          console.log('Push notification sent to driver');
        }
      }
    });

    // Set timeout for ride request expiration
    setTimeout(async () => {
      const updatedRideRequest = await RideRequest.findById(rideRequest._id);
      if (updatedRideRequest.status === 'pending') {
        updatedRideRequest.status = 'failed';
        await updatedRideRequest.save();
        io.of('/passenger').to(passengerId).emit('rideRequestFailed', { rideRequestId: rideRequest._id });
      }
    }, 2 * 60 * 1000); // 2 minutes

    res.status(201).json({
      message: 'Ride request created successfully',
      rideRequestId: rideRequest._id
    });
  } catch (error) {
    console.error('Error creating ride request:', error);
    res.status(500).json({ message: 'Error creating ride request', error: error.message });
  }
};

exports.acceptRideRequest = async (req, res) => {
  try {
    const { driverId, rideRequestId, driverNumber } = req.body;
    
    const driver = await Driver.findById(driverId);
    const rideRequest = await RideRequest.findById(rideRequestId);

    if (!driver || !rideRequest) {
      return res.status(404).json({ message: 'Driver or ride request not found' });
    }

    if (rideRequest.status !== 'pending') {
      return res.status(400).json({ message: 'Ride request is no longer pending' });
    }

console.log('Driver vehicle type:', driver.vehicleType);
    console.log('Ride request vehicle type:', rideRequest.vehicleType);
    console.log('Discounted prices:', JSON.stringify(rideRequest.discountedPrices));

    // Ensure discountedPrices is a plain object
    const discountedPrices = JSON.parse(JSON.stringify(rideRequest.discountedPrices));

    let finalPrice;
    
    if (typeof discountedPrices === 'object' && discountedPrices !== null) {
      if (rideRequest.vehicleType === VehicleTypes.CAR_ANY) {
        finalPrice = discountedPrices[driver.vehicleType];
      } else {
        finalPrice = discountedPrices[rideRequest.vehicleType];
      }

      // If finalPrice is still undefined, try to find any valid price
      if (finalPrice === undefined) {
        const prices = Object.values(discountedPrices);
        finalPrice = prices.length > 0 ? prices[0] : undefined;
      }
    }

    console.log('Calculated final price:', finalPrice);

    if (finalPrice === undefined) {
      return res.status(400).json({ 
        message: 'Unable to determine price for this ride request',
        driverVehicleType: driver.vehicleType,
        rideRequestVehicleType: rideRequest.vehicleType,
        availablePrices: discountedPrices
      });
    }


    rideRequest.driver = driverId;
    rideRequest.status = 'accepted';
    rideRequest.driverImage = driver.profile_url;
    rideRequest.driverName = driver.username;
    rideRequest.driverNumber = driverNumber;
    rideRequest.finalPrice = finalPrice;
    rideRequest.finalVehicleType = driver.vehicleType;
    await rideRequest.save();

    driver.isAvailable = false;
    driver.currentRide = rideRequestId;
    await driver.save();

    console.log(`Passenger ride accepted for ${rideRequest.passenger}`);
    const io = socketHandlers.getIO();
    const passengerNamespace = io.of('/passenger');
    passengerNamespace.to(rideRequest.passenger.toString()).emit('rideRequestAccepted', {
      rideRequestId: rideRequestId,
      driverId: driverId,
      driverLocation: driver.location,
      driverName: driver.username,
      driverImage: driver.profile_url,
      finalPrice: finalPrice,
      finalVehicleType: driver.vehicleType
    });
    const passenger =  await Passenger.findById(rideRequest.passenger);
    if (passenger.pushToken){
      sendPushNotification(passenger.pushToken, 'Ride is Accepted', 'Your ride is acceepted')
    }
    const driverNamespace = io.of('/driver');
    driverNamespace.emit('rideRequestTaken', {
      rideRequestId: rideRequestId,
      message: 'This ride has been accepted by another driver'
    });

    res.status(200).json({ 
      message: 'Ride request accepted successfully',
      finalPrice: finalPrice,
      finalVehicleType: driver.vehicleType
    });
  } catch (error) {
    console.error('Error accepting ride request:', error);
    res.status(500).json({ message: 'Error accepting ride request', error: error.message });
  }
};

exports.provideFeedback = async (req, res) => {
  try {
    const { userId, userType, rideRequestId, rating, comment } = req.body;

    const rideRequest = await RideRequest.findById(rideRequestId);
    console.log(`Ride request ${rideRequestId}`);
    if (!rideRequest) {
      return res.status(404).json({ message: 'Ride request not found' });
    }

    const feedback = { rating, comment };

    if (userType === 'passenger') {
      const passenger = await Passenger.findById(userId);
      const rideIndex = passenger.rideHistory.findIndex(ride => ride.ride && ride.ride.toString() === rideRequestId); // {{ edit_1 }}
      if (rideIndex !== -1) {
        passenger.rideHistory[rideIndex].feedback = feedback;
        await passenger.save();
      }
    } else if (userType === 'driver') {
      const driver = await Driver.findById(userId);
      const rideIndex = driver.rideHistory.findIndex(ride => ride.ride && ride.ride.toString() === rideRequestId); // {{ edit_2 }}
      if (rideIndex !== -1) {
        driver.rideHistory[rideIndex].feedback = feedback;
        await driver.save();
      }
    } else {
      return res.status(400).json({ message: 'Invalid user type' });
    }

    res.status(200).json({ message: 'Feedback provided successfully' });
  } catch (error) {
    console.error('Error providing feedback:', error);
    res.status(500).json({ message: 'Error providing feedback', error: error.message });
  }
};
exports.completeRide = async (req, res) => {
  try {
    const { rideRequestId } = req.body;
    const rideRequest = await RideRequest.findById(rideRequestId);

    if (!rideRequest) {
      return res.status(404).json({ message: 'Ride request not found' });
    }

    if (rideRequest.status !== 'accepted' && rideRequest.status !== 'in_progress') {
      return res.status(400).json({ message: 'Ride is not in progress or accepted' });
    }

    rideRequest.status = 'completed';
    rideRequest.completedAt = new Date();
    await rideRequest.save();

     // Final price of the ride
     const finalPrice = rideRequest.finalPrice;

     if (!finalPrice || finalPrice <= 0) {
       return res.status(400).json({ message: 'Invalid ride price' });
     }
 
     // Payment processing if wallet method is used
     if (rideRequest.paymentMethod === 'wallet') {
    const passenger = await Passenger.findById(rideRequest.passenger);
    const driver = await Driver.findById(rideRequest.driver);
 
       // Check if passenger has enough balance
       if (passenger.walletBalance < finalPrice) {
         return res.status(400).json({ message: 'Insufficient wallet balance' });
       }
 
       // Deduct amount from passenger's wallet
       passenger.walletBalance -= finalPrice;
       await passenger.save();
 
       // Add amount to driver's wallet
       driver.walletBalance += finalPrice;
       await driver.save();
     }

    const driver = await Driver.findById(rideRequest.driver);
    if (driver) {
      driver.isAvailable = true;
      driver.currentRide = null;
      driver.rideHistory.push(rideRequestId);
      await driver.save();
    }

    const passenger = await Passenger.findById(rideRequest.passenger);
    if (passenger) {
      driver.rideHistory.push(rideRequestId);
      await passenger.save();
    }

    const io = socketHandlers.getIO();
    const passengerNamespace = io.of('/passenger');
    passengerNamespace.to(rideRequest.passenger.toString()).emit('rideCompleted', { rideRequestId });
    if (passenger.pushToken){
    await sendPushNotification(passenger.pushToken, 'Ride is Completed', 'Thank you for using our service')
    }
    res.status(200).json({ message: 'Ride completed successfully' });
  } catch (error) {
    console.error('Error completing ride:', error);
    res.status(500).json({ message: 'Error completing ride', error: error.message });
  }
};