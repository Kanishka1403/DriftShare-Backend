const express = require('express');
const router = express.Router();
const driverController = require('../controllers/driverController');

router.post('/add', driverController.addDriver);
router.post('/update/:firebaseId', driverController.updateDriver);
router.put('/location', driverController.updateLocation);
router.put('/availability', driverController.updateAvailability);
router.get('/availability/:firebaseId', driverController.getAvailability);
router.post('/complete-ride', driverController.completeRide);

module.exports = router;