require('dotenv').config();
const mongoose = require('mongoose');
const Driver = require('./models/Driver');
const Passenger = require('./models/Passenger');

async function migrateLocationData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Update Drivers with valid coordinates
    const driverResult = await Driver.updateMany(
      {
        'location.coordinates': {
          $size: 2, // Ensure coordinates array has exactly 2 elements
          $not: { $elemMatch: { $type: 'array' } }, // Filter out documents with array elements within the coordinates
          $elemMatch: { $type: 'number' } // Ensure elements in the array are numbers
        }
      },
      [
        {
          $set: {
            location: {
              type: 'Point',
              coordinates: ['$location.coordinates.0', '$location.coordinates.1']
            }
          }
        }
      ]
    );
    console.log(`Updated ${driverResult.modifiedCount} drivers`);

    // Update Passengers with valid coordinates
    const passengerResult = await Passenger.updateMany(
      {
        'location.coordinates': {
          $size: 2, // Ensure coordinates array has exactly 2 elements
          $not: { $elemMatch: { $type: 'array' } }, // Filter out documents with array elements within the coordinates
          $elemMatch: { $type: 'number' } // Ensure elements in the array are numbers
        }
      },
      [
        {
          $set: {
            location: {
              type: 'Point',
              coordinates: ['$location.coordinates.0', '$location.coordinates.1']
            }
          }
        }
      ]
    );
    console.log(`Updated ${passengerResult.modifiedCount} passengers`);

    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.connection.close();
  }
}

migrateLocationData();