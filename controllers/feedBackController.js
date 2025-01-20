const RideRequest = require('../models/RideRequest');
const Driver = require('../models/Driver');

exports.provideFeedback = async (req, res) => {
  try {
    const { rideId, rating, comment , passengerId} = req.body;

    const rideRequest = await RideRequest.findById(rideId);
    if (!rideRequest) {
      return res.status(404).json({ message: 'Ride not found' });
    }

    if (rideRequest.passenger !== passengerId) {
      return res.status(403).json({ message: 'Not authorized to provide feedback for this ride' });
    }

    if (rideRequest.status !== 'completed') {
      return res.status(400).json({ message: 'Can only provide feedback for completed rides' });
    }

    if (rideRequest.feedback) {
      return res.status(400).json({ message: 'Feedback already provided for this ride' });
    }

    rideRequest.feedback = { rating, comment };
    await rideRequest.save();

    // Update driver's average rating
    const driver = await Driver.findById(rideRequest.driver);
    if (driver) {
      const totalRating = driver.averageRating * driver.totalRides + rating;
      driver.totalRides += 1;
      driver.averageRating = totalRating / driver.totalRides;
      await driver.save();
    }

    res.status(200).json({ message: 'Feedback provided successfully' });
  } catch (error) {
    console.error('Error providing feedback:', error);
    res.status(500).json({ message: 'Error providing feedback', error: error.message });
  }
};