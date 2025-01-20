const express = require('express');
const router = express.Router();
const passengerController = require('../controllers/passengerController');

router.post('/add', passengerController.addPassenger);
router.post('/update/:firebaseId', passengerController.updatePassenger);
module.exports = router;
