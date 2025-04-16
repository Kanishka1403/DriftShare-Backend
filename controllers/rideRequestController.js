const RideRequest = require("../models/RideRequest");
const {
  findNearbyDriversByVehicleType,
} = require("../services/locationService");
const socketHandlers = require("../services/socketHandlers");
const Driver = require("../models/Driver");
const Passenger = require("../models/Passenger");
const Price = require("../models/Price");
const Discount = require("../models/Discount");
const VehicleTypes = require("../enums/vehicle-type-enum");
const { sendPushNotification } = require("../utils/fcmUtils");
const Transaction = require('../models/Transaction');
const { v4: uuidv4 } = require('uuid');

exports.getRideRequestStatus = async (req, res) => {
  try {
    const { rideRequestId } = req.params;

    const rideRequest = await RideRequest.findOne({ _id: rideRequestId })
      .populate("passenger", "username")
      .populate("driver", "username location");

    if (!rideRequest) {
      return res.status(404).json({ message: "Ride request not found" });
    }
    console.log(`rideRequest: ${rideRequest}`);
    res.status(200).json({ rideRequest });
  } catch (error) {
    console.error("Error getting ride request status:", error);
    res
      .status(500)
      .json({
        message: "Error getting ride request status",
        error: error.message,
      });
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
      vehicleType,
      preferredGender = "any",
      isSharing = false,
    } = req.body;

    if (!passengerId || !pickupLocation?.coordinates || !dropLocation?.coordinates || !distance) {
      return res.status(400).json({ message: "Missing required fields or coordinates" });
    }

    const passenger = await Passenger.findById(passengerId);
    if (!passenger) return res.status(404).json({ message: "Passenger not found" });

    if (isSharing && vehicleType === VehicleTypes.CAR_ANY) {
      return res.status(400).json({ message: "Shared rides require a specific vehicle type" });
    }

    const consideredTypes = vehicleType === VehicleTypes.CAR_ANY
      ? [VehicleTypes.CAR_MINI, VehicleTypes.CAR_SEDAN, VehicleTypes.CAR_SUV]
      : [vehicleType];

    const vehiclePrices = await Price.find({ vehicleType: { $in: consideredTypes } });
    const discount = await Discount.findOne({ isActive: true });

    const discountPercentage = (discount && new Date() >= discount.validFrom && new Date() <= discount.validTo)
      ? discount.percentage
      : 0;

    const calculatePrice = (base) => base - (base * discountPercentage / 100);

    const prices = {};
    const discountedPrices = {};
    const perPassengerPrices = {};

    vehiclePrices.forEach(vp => {
      const basePrice = vp.pricePerKilometer * distance;
      const finalPrice = calculatePrice(basePrice);
      prices[vp.vehicleType] = basePrice;
      discountedPrices[vp.vehicleType] = finalPrice;
      perPassengerPrices[vp.vehicleType] = finalPrice;
    });

    const getMaxPassengers = (vt) => vt === VehicleTypes.CAR_SUV ? 6 : 4;

    // Try to join shared ride
    if (isSharing) {
      const existingRide = await RideRequest.findOne({
        isShareable: true,
        vehicleType,
        status: 'pending',
        currentPassengers: { $lt: getMaxPassengers(vehicleType) },
        "pickupLocation.coordinates": {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: pickupLocation.coordinates,
            },
            $maxDistance: 1000,
          },
        },
        "dropLocation.coordinates": {
          $nearSphere: {
            $geometry: {
              type: "Point",
              coordinates: dropLocation.coordinates,
            },
            $maxDistance: 1000,
          },
        },
      });

      if (existingRide) {
        existingRide.passengers.push(passengerId);
        existingRide.currentPassengers += 1;

        Object.keys(existingRide.discountedPrices).forEach(vt => {
          const newPrice = existingRide.discountedPrices[vt] / existingRide.currentPassengers;
          existingRide.perPassengerPrices[vt] = newPrice;
        });

        await existingRide.save();
        await Passenger.findByIdAndUpdate(passengerId, { $push: { rideHistory: existingRide._id } });

        return res.status(201).json({
          message: "Joined existing shared ride",
          rideRequestId: existingRide._id,
          price: existingRide.perPassengerPrices[vehicleType],
        });
      }
    }

    // Create new ride request
    const rideRequest = new RideRequest({
      paymentMethod,
      passengers: [passengerId],
      isShareable: isSharing,
      currentPassengers: 1,
      maxPassengers: isSharing ? getMaxPassengers(vehicleType) : 1,
      passengerName: passenger.username,
      passengerImage: passenger.profile_url,
      vehicleType,
      pickupLocation: {
        type: "Point",
        address: pickupLocation.address,
        coordinates: pickupLocation.coordinates,
      },
      dropLocation: {
        type: "Point",
        address: dropLocation.address,
        coordinates: dropLocation.coordinates,
      },
      distance,
      originalPrices: prices,
      discountedPrices,
      perPassengerPrices,
      appliedDiscountPercentage: discountPercentage,
      passengerMobile,
      status: "pending",
      preferredGender,
    });

    await rideRequest.save();
    await Passenger.findByIdAndUpdate(passengerId, { $push: { rideHistory: rideRequest._id } });

    const nearbyDrivers = await findNearbyDriversByVehicleType(
      pickupLocation.coordinates[1],
      pickupLocation.coordinates[0],
      vehicleType,
      preferredGender
    );

    const io = socketHandlers.getIO();
    nearbyDrivers.forEach(driver => {
      const driverPrice = discountedPrices[driver.vehicleType];
      if (driverPrice) {
        io.of("/driver").to(driver._id.toString()).emit("newRideRequest", {
          rideRequestId: rideRequest._id,
          pickupLocation,
          passengerName: passenger.username,
          paymentMethod,
          vehicleType: driver.vehicleType,
          passengerImage: passenger.profile_url,
          dropLocation,
          distance,
          price: driverPrice,
          isShareable: isSharing,
          currentPassengers: rideRequest.currentPassengers,
        });
      }
    });

    // Timeout fallback
    setTimeout(async () => {
      const updatedRide = await RideRequest.findById(rideRequest._id);
      if (updatedRide?.status === "pending") {
        updatedRide.status = "failed";
        await updatedRide.save();
        io.of("/passenger").to(passengerId).emit("rideRequestFailed", { rideRequestId: rideRequest._id });
      }
    }, 120000);

    res.status(201).json({
      message: "Ride request created successfully",
      rideRequestId: rideRequest._id,
      price: perPassengerPrices[vehicleType],
    });

  } catch (error) {
    console.error("Error creating ride request:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



exports.acceptRideRequest = async (req, res) => {
  try {
    const { driverId, rideRequestId, driverNumber } = req.body;

    const driver = await Driver.findById(driverId);
    const rideRequest = await RideRequest.findById(rideRequestId);

    if (!driver || !rideRequest) {
      return res
        .status(404)
        .json({ message: "Driver or ride request not found" });
    }

    if (rideRequest.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Ride request is no longer pending" });
    }

    console.log("Driver vehicle type:", driver.vehicleType);
    console.log("Ride request vehicle type:", rideRequest.vehicleType);
    console.log(
      "Discounted prices:",
      JSON.stringify(rideRequest.discountedPrices)
    );

    // Ensure discountedPrices is a plain object
    const discountedPrices = rideRequest.totalDiscountedPrices || rideRequest.discountedPrices;

    let finalPrice;
    if (typeof discountedPrices === "object" && discountedPrices !== null) {
      // Use driver's vehicle type for shared rides
      if (rideRequest.isShareable) {
        finalPrice = discountedPrices.get(driver.vehicleType);
      } else if (rideRequest.vehicleType === VehicleTypes.CAR_ANY) {
        finalPrice = discountedPrices.get(driver.vehicleType);
      } else {
        finalPrice = discountedPrices.get(rideRequest.vehicleType);
      }
    }

    console.log("Calculated final price:", finalPrice);

    if (finalPrice === undefined) {
      return res.status(400).json({
        message: "Unable to determine price for this ride request",
        driverVehicleType: driver.vehicleType,
        rideRequestVehicleType: rideRequest.vehicleType,
        availablePrices: discountedPrices,
      });
    }

    rideRequest.driver = driverId;
    rideRequest.status = "accepted";
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
    const passengerNamespace = io.of("/passenger");
    passengerNamespace.to(rideRequest.passengers[0].toString()).emit("rideRequestAccepted", {
        rideRequestId: rideRequestId,
        driverId: driverId,
        driverLocation: driver.location,
        driverName: driver.username,
        driverImage: driver.profile_url,
        finalPrice: finalPrice,
        finalVehicleType: driver.vehicleType,
        isSharedRide: rideRequest.isShareable,
        totalPassengers: rideRequest.currentPassengers

      });
    const passenger = await Passenger.findById(rideRequest.passenger);
    if (passenger.pushToken) {
      sendPushNotification(
        passenger.pushToken,
        "Ride is Accepted",
        "Your ride is acceepted"
      );
    }
    const driverNamespace = io.of("/driver");
    driverNamespace.emit("rideRequestTaken", {
      rideRequestId: rideRequestId,
      message: "This ride has been accepted by another driver",
    });

    res.status(200).json({
      message: "Ride request accepted successfully",
      finalPrice: finalPrice,
      finalVehicleType: driver.vehicleType,
    });
  } catch (error) {
    console.error("Error accepting ride request:", error);
    res
      .status(500)
      .json({ message: "Error accepting ride request", error: error.message });
  }
};

exports.provideFeedback = async (req, res) => {
  try {
    const { userId, userType, rideRequestId, rating, comment } = req.body;

    const rideRequest = await RideRequest.findById(rideRequestId);
    console.log(`Ride request ${rideRequestId}`);
    if (!rideRequest) {
      return res.status(404).json({ message: "Ride request not found" });
    }

    const feedback = { rating, comment };

    if (userType === "passenger") {
      const passenger = await Passenger.findById(userId);
      const rideIndex = passenger.rideHistory.findIndex(
        (ride) => ride.ride && ride.ride.toString() === rideRequestId
      ); // {{ edit_1 }}
      if (rideIndex !== -1) {
        passenger.rideHistory[rideIndex].feedback = feedback;
        await passenger.save();
      }
    } else if (userType === "driver") {
      const driver = await Driver.findById(userId);
      const rideIndex = driver.rideHistory.findIndex(
        (ride) => ride.ride && ride.ride.toString() === rideRequestId
      ); // {{ edit_2 }}
      if (rideIndex !== -1) {
        driver.rideHistory[rideIndex].feedback = feedback;
        await driver.save();
      }
    } else {
      return res.status(400).json({ message: "Invalid user type" });
    }

    res.status(200).json({ message: "Feedback provided successfully" });
  } catch (error) {
    console.error("Error providing feedback:", error);
    res
      .status(500)
      .json({ message: "Error providing feedback", error: error.message });
  }
};

exports.completeRide = async (req, res) => {
  try {
    const { rideRequestId } = req.body;
    const rideRequest = await RideRequest.findById(rideRequestId);

    if (!rideRequest) {
      return res.status(404).json({ message: "Ride request not found" });
    }

    if (
      rideRequest.status !== "accepted" &&
      rideRequest.status !== "in_progress"
    ) {
      return res
        .status(400)
        .json({ message: "Ride is not in progress or accepted" });
    }

    rideRequest.status = "completed";
    rideRequest.completedAt = new Date();
    await rideRequest.save();

    const finalPrice = rideRequest.finalPrice;

    if (!finalPrice || finalPrice <= 0) {
      return res.status(400).json({ message: "Invalid ride price" });
    }

    if (rideRequest.paymentMethod === "wallet") {
      const passenger = await Passenger.findById(rideRequest.passenger);
      const driver = await Driver.findById(rideRequest.driver);

      if (passenger.walletBalance < finalPrice) {
        return res.status(400).json({ message: "Insufficient wallet balance" });
      }

      passenger.walletBalance -= finalPrice;
      await passenger.save();

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
      passenger.rideHistory.push(rideRequestId);

      const transaction = new Transaction({
        _id: uuidv4(),
        userId: rideRequest.passenger,
        userType: 'passenger',
        amount: finalPrice,
        type: 'debit',
        paymentMethod: rideRequest.paymentMethod,
        rideId: rideRequestId,
        description: `⁠ Payment for ride ${rideRequestId} ⁠`,
        timestamp: new Date()
      });
      await transaction.save();

      passenger.transactionHistory.push(transaction._id);
      await passenger.save();
    }

    const io = socketHandlers.getIO();
    const passengerNamespace = io.of("/passenger");
    passengerNamespace
      .to(rideRequest.passenger.toString())
      .emit("rideCompleted", { rideRequestId });
    if (passenger.pushToken) {
      await sendPushNotification(
        passenger.pushToken,
        "Ride is Completed",
        "Thank you for using our service"
      );
    }
    res.status(200).json({ message: "Ride completed successfully" });
  } catch (error) {
    console.error("Error completing ride:", error);
    res
      .status(500)
      .json({ message: "Error completing ride", error: error.message });
  }
};