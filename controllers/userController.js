const Driver = require('../models/Driver');
const Passenger = require('../models/Passenger');

exports.addPushToken = async (req, res) => {
  try {
    const { userId, pushToken, userType } = req.body;

    if (!userId || !pushToken || !userType) {
      return res.status(400).json({ message: 'User ID, push token, and user type are required' });
    }

    if (!['driver', 'passenger'].includes(userType.toLowerCase())) {
      return res.status(400).json({ message: 'Invalid user type. Must be either "driver" or "passenger"' });
    }

    let user;
    if (userType.toLowerCase() === 'driver') {
      user = await Driver.findByIdAndUpdate(
        userId,
        { $set: { pushToken: pushToken } },
        { new: true }
      );
    } else {
      user = await Passenger.findByIdAndUpdate(
        userId,
        { $set: { pushToken: pushToken } },
        { new: true }
      );
    }

    if (!user) {
      return res.status(404).json({ message: `${userType.charAt(0).toUpperCase() + userType.slice(1)} not found` });
    }

    res.status(200).json({ message: 'Push token added successfully', user });
  } catch (error) {
    console.error('Error adding push token:', error);
    res.status(500).json({ message: 'Error adding push token', error: error.message });
  }
};