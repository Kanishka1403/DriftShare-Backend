const { findNearbyDrivers , findNearbyPassengers , updateDriverLocation} = require('./locationService');
const RideRequest = require('../models/RideRequest');
const Driver = require('../models/Driver');
const Passenger = require('../models/Passenger');

let io;
const activeRideRequests = new Map();

const init = (socketIo) => {
  io = socketIo;

  const driverNamespace = io.of('/driver');
  const passengerNamespace = io.of('/passenger');

  driverNamespace.on('connection', (socket) => {
    console.log('Driver connected:', socket.id);

    socket.on('driverConnect', async (data) => {
      const { driverId } = data;
      socket.driverId = driverId;
      socket.join(driverId);
      console.log(`Driver ${driverId} connected and joined room`);
    });

    socket.on('updateLocation', async (data) => {
      try {
        const { driverId, lat, long, isAvailable } = data;
        console.log(`Driver ${driverId} updated location to (${lat}, ${long})`);
       const driver = await updateDriverLocation(driverId, lat, long);
        if (driver) {
          // const driverInfo = {
          //   driverId: driver._id,
          //   firebaseId: driver.firebaseId,
          //   location: { lat, long },
          //   isAvailable
          // };
          
          // Broadcast to all passengers
          passengerNamespace.emit('driverLocationUpdated', driver);
          
          // Notify nearby passengers about this driver's updated location
          const nearbyPassengers = await findNearbyPassengers(lat, long);
          nearbyPassengers.forEach(passenger => {
            passengerNamespace.to(passenger._id.toString()).emit('nearbyDriverUpdate', driver);
          });
        }
      } catch (error) {
        console.error('Error updating driver location:', error);
      }
    });

    socket.on('acceptRide', async (data) => {
      try {
        const { driverId, rideRequestId } = data;
        const rideRequest = await RideRequest.findById(rideRequestId);
        if (rideRequest && rideRequest.status === 'pending') {
          const driver = await Driver.findById(driverId);
          rideRequest.status = 'accepted';
          rideRequest.driver = driverId;
          rideRequest.driverImage = driver.profile_url;
          rideRequest.driverName = driver.username;
          await rideRequest.save();
          
          
          driver.isAvailable = false;
          driver.currentRide = rideRequestId;
          await driver.save();
          
          passengerNamespace.to(rideRequest.passenger.toString()).emit('rideAccepted', {
            rideRequestId,
            driver_image: driver.profile_url,
            driverName: driver.username,
            driverId,
            driverLocation: driver.location,
            driverFirebaseId: driver.firebaseId
          });
              // Send push notification to passenger
      if (rideRequest.passenger.pushToken) {
        // await sendPushNotification(
        //   rideRequest.passenger.pushToken,
        //   'Ride Accepted',
        //   `${driver.username} has accepted your ride request!`,
        //   { rideRequestId: rideRequestId.toString(), type: 'ride_accepted' }
        // );
      }
          socket.emit('rideAcceptedConfirmation', { rideRequestId });
        }
      } catch (error) {
        console.error('Error accepting ride:', error);
      }
    });

    socket.on('arrivedAtPickup', async (data) => {
      try {
        const { rideRequestId } = data;
        const rideRequest = await RideRequest.findById(rideRequestId);
        if (rideRequest) {
          passengerNamespace.to(rideRequest.passenger.toString()).emit('driverArrived', { rideRequestId });
          if (rideRequest.passenger.pushToken) {
            // await sendPushNotification(
            //   rideRequest.passenger.pushToken,
            //   'Driver Arrived',
            //   'Your driver has arrived at the pickup location.',
            //   { rideRequestId: rideRequestId.toString(), type: 'driver_arrived' }
            // );
          }
        }
      } catch (error) {
        console.error('Error notifying arrival:', error);
      }
    });

    socket.on('startRide', async (data) => {
      try {
        const { rideRequestId } = data;
        const rideRequest = await RideRequest.findByIdAndUpdate(rideRequestId, 
          { status: 'in_progress', startTime: new Date() },
          { new: true }
        );
        if (rideRequest) {
          passengerNamespace.to(rideRequest.passenger.toString()).emit('rideStarted', { rideRequestId });
          if (rideRequest.passenger.pushToken) {
            // await sendPushNotification(
            //   rideRequest.passenger.pushToken,
            //   'Ride Started',
            //   'Your ride has started.',
            //   { rideRequestId: rideRequestId.toString(), type: 'ride_started' }
            // );
          }
        }
      } catch (error) {
        console.error('Error starting ride:', error);
      }
    });

    socket.on('completeRide', async (data) => {
      try {
        const { rideRequestId } = data;
        const rideRequest = await RideRequest.findByIdAndUpdate(rideRequestId, 
          { status: 'completed', endTime: new Date() },
          { new: true }
        );
        if (rideRequest) {
          const driver = await Driver.findById(rideRequest.driver);
          driver.isAvailable = true;
          driver.currentRide = null;
          await driver.save();

          passengerNamespace.to(rideRequest.passenger.toString()).emit('rideCompleted', { rideRequestId });
          socket.emit('rideCompletedConfirmation', { rideRequestId });
          if (rideRequest.passenger.pushToken) {
            // await sendPushNotification(
            //   rideRequest.passenger.pushToken,
            //   'Ride Completed',
            //   'Your ride has been completed. Thanks for riding with us!',
            //   { rideRequestId: rideRequestId.toString(), type: 'ride_completed' }
            // );
          }
    
          // Send push notification to driver
          if (driver.pushToken) {
            // await sendPushNotification(
            //   driver.pushToken,
            //   'Ride Completed',
            //   'You have completed the ride. Great job!',
            //   { rideRequestId: rideRequestId.toString(), type: 'ride_completed' }
            // );
          }
        }
      } catch (error) {
        console.error('Error completing ride:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('Driver disconnected:', socket.id);
    });
  });

  passengerNamespace.on('connection', (socket) => {
    console.log('Passenger connected:', socket.id);

    socket.on('passengerConnect', async (data) => {
      const { passengerId } = data;
      socket.passengerId = passengerId;
      socket.join(passengerId);
      console.log(`Passenger ${passengerId} connected and joined room`);
    });

    socket.on('requestNearbyDrivers', async (data) => {
      try {
        const { passengerId, lat, long } = data;
        console.log(`Passenger ${passengerId} requesting nearby drivers at (${lat}, ${long})`);

        // Update passenger's location
        await Passenger.findByIdAndUpdate(passengerId, {
          location: {
            type: 'Point',
            coordinates: [long, lat]
          }
        });
        console.log('Passenger requesting nearby drivers:');
        const nearbyDrivers = await findNearbyDrivers(lat, long);
        console.log('nearby drivers:', nearbyDrivers);
        socket.emit('nearbyDrivers', nearbyDrivers);
      } catch (error) {
        console.error('Error fetching nearby drivers:', error);
      }
    });

    socket.on('requestRide', async (data) => {
      try {
        const { passengerId, pickupLocation, dropLocation, distance, price } = data;
        const passenger = await Passenger.findById(passengerId);
        if(!passenger){
          return socket.emit('error', 'Passenger not found');
        }
        const rideRequest = new RideRequest({
          passenger: passenger._id,
          pickupLocation: {
            type: 'Point',
            address:pickupLocation.address,
            coordinates: [pickupLocation.long, pickupLocation.lat]
          },
          dropLocation: {
            type: 'Point',
            address: dropLocation.address,
            coordinates: [dropLocation.long, dropLocation.lat]
          },
          distance,
          price,
          status: 'pending'
        });
        await rideRequest.save();
        
        const nearbyDrivers = await findNearbyDrivers(pickupLocation.lat, pickupLocation.long);
        nearbyDrivers.forEach(driver => {
          if (driver.isAvailable) {
            driverNamespace.to(driver._id.toString()).emit('newRideRequest', {
              rideRequestId: rideRequest._id,
              passengerName: passenger.username,
              passengerImage: passenger.profile_url,
              pickupLocation,
              dropLocation,
              distance,
              price
            });
          }
        });

        setTimeout(async () => {
          const updatedRequest = await RideRequest.findById(rideRequest._id);
          if (updatedRequest.status === 'pending') {
            updatedRequest.status = 'failed';
            await updatedRequest.save();
            socket.emit('rideRequestFailed', { rideRequestId: rideRequest._id });
          }
        }, 2 * 60 * 1000); // 2 minutes

        socket.emit('rideRequestCreated', { rideRequestId: rideRequest._id });
      } catch (error) {
        console.error('Error creating ride request:', error);
      }
    });

    socket.on('cancelRide', async (data) => {
      try {
        const { rideRequestId } = data;
        const rideRequest = await RideRequest.findByIdAndUpdate(rideRequestId, 
          { status: 'cancelled' },
          { new: true }
        );
        if (rideRequest && rideRequest.driver) {
          driverNamespace.to(rideRequest.driver.toString()).emit('rideCancelled', { rideRequestId });
        }
      } catch (error) {
        console.error('Error cancelling ride:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('Passenger disconnected:', socket.id);
    });
  });
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.IO not initialized!');
  }
  return io;
};

module.exports = { init, getIO };