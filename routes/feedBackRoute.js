const express = require('express');
const router = express.Router();
const rideRequestController = require('../controllers/rideRequestController');


router.post('/feedback', rideRequestController.provideFeedback);

module.exports = router;