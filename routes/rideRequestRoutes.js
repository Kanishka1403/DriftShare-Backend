const express = require('express');
const router = express.Router();
const rideRequestController = require('../controllers/rideRequestController');

router.post('/create', rideRequestController.createRideRequest);
router.post('/accept', rideRequestController.acceptRideRequest);
router.get('/:rideRequestId', rideRequestController.getRideRequestStatus);
router.post('/feedback', rideRequestController.provideFeedback);
router.post('/complete', rideRequestController.completeRide);

module.exports = router;