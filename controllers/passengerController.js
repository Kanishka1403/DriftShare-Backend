const Passenger = require('../models/Passenger');

exports.addPassenger = async (req, res) => {
  try {
    const { firebaseId, username ,profile_url} = req.body;
    const newPassenger = new Passenger({ _id: firebaseId, username , profile_url});
    await newPassenger.save();
    res.status(201).json({ message: 'Passenger added successfully', passenger: newPassenger });
  } catch (error) {
    res.status(500).json({ message: 'Error adding passenger', error: error.message });
  }
};

// You may want to add more functions here, such as:

exports.getPassenger = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    const passenger = await Passenger.findById(firebaseId);
    if (!passenger) {
      return res.status(404).json({ message: 'Passenger not found' });
    }
    res.status(200).json({ passenger });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching passenger', error: error.message });
  }
};

exports.updatePassenger = async (req, res) => {
  try {
    const { firebaseId } = req.params;
    console.log(`Passanger update: ${firebaseId} with body: ${JSON.stringify(req.body)}`);
    const updates = req.body;
    const passenger = await Passenger.findByIdAndUpdate(firebaseId, updates, { new: true });
    if (!passenger) {
      return res.status(404).json({ message: 'Passenger not found' });
    }
    res.status(200).json({ message: 'Passenger updated successfully', passenger });
  } catch (error) {
    res.status(500).json({ message: 'Error updating passenger', error: error.message });
  }
};