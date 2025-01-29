const Price = require('../models/Price');
const Discount = require('../models/Discount');
const Notification = require('../models/Notification');
const Passenger = require('../models/Passenger');
const { sendPushNotification } = require('../utils/fcmUtils');
const VehicleTypes = require('../enums/vehicle-type-enum')

// Set Price API
exports.setPrice = async (req, res) => {
  try {
    const { pricePerKilometer, vehicleType } = req.body;
    
    if (typeof pricePerKilometer !== 'number' || pricePerKilometer <= 0) {
      return res.status(400).json({ message: 'Invalid price. Please provide a positive number.' });
    }

    if (!Object.values(VehicleTypes).includes(vehicleType)) {
      return res.status(400).json({ message: 'Invalid vehicle type.' });
    }

    const price = await Price.findOneAndUpdate(
      { vehicleType },
      { pricePerKilometer },
      { upsert: true, new: true }
    );

    res.status(200).json({ message: 'Price updated successfully', price });
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ message: 'Error updating price', error: error.message });
  }
};

// Get Price API
exports.getPrice = async (req, res) => {
  try {
    const { vehicleType } = req.query;

    if (!vehicleType) {
      const prices = await Price.find();
      if (prices.length === 0) {
        return res.status(404).json({ message: 'No prices set' });
      }
      return res.status(200).json(prices);
    }

    if (!Object.values(VehicleTypes).includes(vehicleType)) {
      return res.status(400).json({ message: 'Invalid vehicle type.' });
    }

    const price = await Price.findOne({ vehicleType });
    if (!price) {
      return res.status(404).json({ message: 'Price not set for this vehicle type' });
    }
    res.status(200).json(price);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching price', error: error.message });
  }
};
exports.setDiscount = async (req, res) => {
  try {
    const { code, percentage, validFrom, validTo } = req.body;

    // Deactivate all existing discounts
    await Discount.updateMany({}, { isActive: false });

    // Create new discount
    const discount = new Discount({
      code,
      percentage,
      validFrom,
      validTo,
      isActive: true
    });
    await discount.save();

    // Send notification to all passengers
    const passengers = await Passenger.find();
    console.log(`Found ${passengers.length} passengers`);

    const notificationPromises = passengers.map(async (passenger) => {
      try {
        if (!passenger._id) {
          console.warn(`Passenger ${passenger._id} does not have a firebaseId`);
          return; // Skip this passenger
        }

        const notification = new Notification({
          userId: passenger._id,
          userType: 'passenger',
          title: 'New Discount Available',
          body: `Use code ${code} to get ${percentage}% off your next ride!`,
          type: 'discount'
        });

        console.log(`Creating notification for passenger ${passenger._id}`);
        await notification.save();

        if (passenger.pushToken) {
          console.log(`Sending push notification to passenger ${passenger._id}`);
          await sendPushNotification(
            passenger.pushToken,
            'New Discount Available',
            `Use code ${code} to get ${percentage}% off your next ride!`,
            { type: 'discount', discountCode: code }
          );
        } else {
          console.log(`Passenger ${passenger._id} does not have a push token`);
        }
      } catch (error) {
        console.error(`Failed to process notification for passenger ${passenger._id}:`, error);
        // Continue with other passengers even if one fails
      }
    });

    await Promise.all(notificationPromises);

    res.status(201).json({ message: 'Discount created and notifications sent', discount });
  } catch (error) {
    console.error('Error creating discount:', error);
    res.status(500).json({ message: 'Error creating discount', error: error.message });
  }
};
  
  // Get Notification History API
  exports.getNotificationHistory = async (req, res) => {
    try {
      const { userId, userType } = req.params;
      const notifications = await Notification.find({ userId, userType }).sort({ createdAt: -1 });
      res.status(200).json(notifications);
    } catch (error) {
      res.status(500).json({ message: 'Error fetching notification history', error: error.message });
    }
  };
  // Get Discount API
exports.getDiscount = async (req, res) => {
  try {
    const currentDate = new Date();
    const discount = await Discount.findOne({
      isActive: true,
    });

    if (!discount) {
      return res.status(200).json({ message: 'No active discount found' });
    }

    res.status(200).json({
      message: 'Active discount retrieved successfully',
      discount: discount
    });
  } catch (error) {
    console.error('Error fetching discount:', error);
    res.status(500).json({ message: 'Error fetching discount', error: error.message });
  }
};
