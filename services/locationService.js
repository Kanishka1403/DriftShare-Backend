const Driver = require('../models/Driver');
const Passenger = require('../models/Passenger');
const VehicleTypes = require('../enums/vehicle-type-enum');

exports.findNearbyDrivers = async (lat, long, maxDistance = 2000) => {
  try {
    const nearbyDrivers = await Driver.find({
      isLocationOn: true,
      isAvailable: true,
      location: {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [long, lat],
          },
          $maxDistance: maxDistance,
        },
      },
    }).select('_id username profile_url location vehicleType');
    
    console.log(`Found ${nearbyDrivers.length} nearby drivers`);
    return nearbyDrivers;
  } catch (error) {
    console.error('Error finding nearby drivers:', error);
    throw error;
  }
};

exports.findNearbyPassengers = async (lat, long, maxDistance = 2000) => {
  try {
    const nearbyPassengers = await Passenger.find({
      location: {
        $nearSphere: {
          $geometry: {
            type: "Point",
            coordinates: [long, lat]
          },
          $maxDistance: maxDistance
        }
      }
    }).select('_id username profile_url');
    
    console.log(`Found ${nearbyPassengers.length} nearby passengers`);
    return nearbyPassengers;
  } catch (error) {
    console.error('Error finding nearby passengers:', error);
    throw error;
  }
};

exports.findNearbyDriversByVehicleType = async (lat, long, vehicleType, maxDistance = 2000) => {
  try {
    let vehicleTypes = [vehicleType];
    if (vehicleType === VehicleTypes.CAR_ANY) {
      vehicleTypes = [VehicleTypes.CAR_MINI, VehicleTypes.CAR_SEDAN, VehicleTypes.CAR_SUV];
    }

    const nearbyDrivers = await Driver.find({
      isLocationOn: true,
      isAvailable: true,
      vehicleType: { $in: vehicleTypes },
      location: {
        $nearSphere: {
          $geometry: {
            type: 'Point',
            coordinates: [long, lat],
          },
          $maxDistance: maxDistance,
        },
      },
    }).select('_id username profile_url location vehicleType');

    console.log(`Found ${nearbyDrivers.length} nearby drivers for ${vehicleType}`);
    return nearbyDrivers;
  } catch (error) {
    console.error('Error finding nearby drivers:', error);
    throw error;
  }
};

exports.updateDriverLocation = async (driverId, lat, long) => {
  try {
   const driver = await Driver.findByIdAndUpdate(driverId, {
      location: {
        type: 'Point',
        coordinates: [long, lat]
      }
    });
    console.log(`Driver ${driverId} updated location to (${lat}, ${long})`);
    return driver;
  } catch (error) {
    console.error('Error updating driver location:', error);
    throw error;
  }
};

exports.updatePassengerLocation = async (passengerId, lat, long) => {
  try {
    await Passenger.findByIdAndUpdate(passengerId, {
      location: {
        type: 'Point',
        coordinates: [long, lat]
      }
    });
    console.log(`Passenger ${passengerId} updated location to (${lat}, ${long})`);
  } catch (error) {
    console.error('Error updating passenger location:', error);
    throw error;
  }
};

// Helper function to calculate distance between two points
exports.calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of the Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers
  return distance;
};