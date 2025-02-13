const Driver = require('../models/Driver');
const Passenger = require('../models/Passenger');
const Transaction = require('../models/Transaction');
const RideRequest = require('../models/RideRequest');
const { v4: uuidv4 } = require('uuid');
const { sendPushNotification } = require('../utils/fcmUtils');

const AUTH_KEY = process.env.AUTH_KEY; // Store this securely, preferably in environment variables

exports.addFunds = async (req, res) => {
  try {
    const { authKey, userId, userType, amount, paymentId } = req.body;

    if (authKey !== AUTH_KEY) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    let user;
    if (userType === 'driver') {
      user = await Driver.findById(userId);
    } else if (userType === 'passenger') {
      user = await Passenger.findById(userId);
    } else {
      return res.status(400).json({ message: 'Invalid user type' });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.walletBalance += amount;
    await user.save();

    const transaction = new Transaction({
      _id: uuidv4(),
      userId,
      userType,
      amount,
      type: 'credit',
      paymentMethod: 'card',
      description: 'Wallet top-up',
      timestamp: new Date()
    });
    await transaction.save();

    user.transactionHistory.push(transaction._id);
    await user.save();
    if (user.pushToken) {
   await sendPushNotification(
      user.pushToken,
      'Payment Received',
      `You have received ${amount.toFixed(2)} as a payment`,
      { type: 'payment_received' }
   );
   console.log('Push notification sent to user');
    }
    res.status(200).json({ message: 'Funds added successfully', newBalance: user.walletBalance });
  } catch (error) {
    res.status(500).json({ message: 'Error adding funds', error: error.message });
  }
};

exports.processRidePayment = async (req, res) => {
  try {
    const { rideRequestId } = req.body;

    console.log("Ride Request ID", rideRequestId);
    const ride = await RideRequest.findById(rideRequestId);
    if (!ride) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    const paymentMethod = ride.paymentMethod;
    console.log("Payment Method", paymentMethod);

    const passenger = await Passenger.findById(ride.passenger);
    const driver = await Driver.findById(ride.driver);

    if (!passenger || !driver) {
      return res.status(404).json({ message: 'Passenger or driver not found' });
    }

    const rideAmount = ride.finalPrice;
    const driverAmount = rideAmount * 0.93; // 7% platform fee
    const platformFee = rideAmount * 0.07;
    const driverTotalAmount = rideAmount; // Store full amount first
    const driverFinalAmount = rideAmount - platformFee; // After platform fee cut

    if (paymentMethod === 'wallet') {
      if (passenger.walletBalance < rideAmount) {
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }

      passenger.walletBalance -= rideAmount;
      driver.walletBalance += driverAmount;

      const driverTotalTransaction = new Transaction({
        _id: uuidv4(),
        userId: driver._id,
        userType: 'driver',
        amount: driverTotalAmount,
        type: 'credit',
        paymentMethod: 'wallet',
        rideId: ride._id,
        description: 'Ride earnings'
      });

      console.log("Ride Amount added", rideAmount);
      await driverTotalTransaction.save();
      driver.transactionHistory.push(driverTotalTransaction._id);

      const passengerTransaction = new Transaction({
        _id: uuidv4(),
        userId: passenger._id,
        userType: 'passenger',
        amount: -rideAmount,
        type: 'debit',
        paymentMethod: 'wallet',
        rideId: ride._id,
        description: 'Ride payment'
      });

      const driverTransaction = new Transaction({
        _id: uuidv4(),
        userId: driver._id,
        userType: 'driver',
        amount: driverAmount,
        type: 'credit',
        paymentMethod: 'wallet',
        rideId: ride._id,
        description: 'Ride earnings'
      });

      await passengerTransaction.save();
      await driverTransaction.save();

      passenger.transactionHistory.push(passengerTransaction._id);
      driver.transactionHistory.push(driverTransaction._id);

    } else if (paymentMethod === 'cash') {
      if (driver.walletBalance < platformFee) {
        return res.status(400).json({ message: 'Insufficient driver wallet balance for platform fee' });
      }

      driver.walletBalance -= platformFee;

      const driverTransaction = new Transaction({
        _id: uuidv4(),
        userId: driver._id,
        userType: 'driver',
        amount: -platformFee,
        type: 'debit',
        paymentMethod: 'wallet',
        rideId: ride._id,
        description: 'Platform fee for cash ride'
      });

      await driverTransaction.save();
      driver.transactionHistory.push(driverTransaction._id);
    } else {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    ride.paymentStatus = 'completed';
    ride.paymentMethod = paymentMethod;
    await ride.save();

    await passenger.save();
    await driver.save();

    // Check if driver's wallet balance is below 200 rupees
    if (driver.walletBalance < 200) {
      driver.isAvailable = false;
      driver.isLocationOn = false;
      await driver.save();
    }

    // After successful payment processing
    try {
      if (passenger.pushToken) {
        await sendPushNotification(
          passenger.pushToken,
          'Payment Processed',
          `Your payment of ${rideAmount} has been processed successfully.`,
          { rideRequestId: ride._id.toString(), type: 'payment_processed' }
        );
      }

      if (driver.pushToken) {
        await sendPushNotification(
          driver.pushToken,
          'Payment Received',
          `You have received a payment of ${driverAmount} for your ride.`,
          { rideRequestId: ride._id.toString(), type: 'payment_received' }
        );
      }
    } catch (notificationError) {
      console.error('Error sending push notification:', notificationError);
    }

    res.status(200).json({ message: 'Ride payment processed successfully' });
  } catch (error) {
    console.log("error", error);
    res.status(500).json({ message: 'Error processing ride payment', error: error.message });
  }
};

exports.getTransactionHistory = async (req, res) => {
  try {
    const { userId, userType } = req.params;

    let user;
    if (userType === 'driver') {
      user = await Driver.findById(userId).populate('transactionHistory');
    } else if (userType === 'passenger') {
      user = await Passenger.findById(userId).populate('transactionHistory');
    } else {
      return res.status(400).json({ message: 'Invalid user type' });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ transactionHistory: user.transactionHistory });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching transaction history', error: error.message });
  }
};

exports.getRideHistory = async (req, res) => {
  try {
    const { userId, userType } = req.params;

    let user;
    if (userType === 'driver') {
      user = await Driver.findById(userId).populate('rideHistory');
    } else if (userType === 'passenger') {
      user = await Passenger.findById(userId).populate('rideHistory');
    } else {
      return res.status(400).json({ message: 'Invalid user type' });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ rideHistory: user.rideHistory });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching ride history', error: error.message });
  }
};

exports.getAmmount = async (req, res) => {
  try {
    const { userId, userType } = req.params;

    let user;
    if (userType === 'driver') {
      user = await Driver.findById(userId);
    } else if (userType === 'passenger') {
      user = await Passenger.findById(userId);
    } else {
      return res.status(400).json({ message: 'Invalid user type' });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ amount: user.walletBalance });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching Available amount', error: error.message });
  }
};