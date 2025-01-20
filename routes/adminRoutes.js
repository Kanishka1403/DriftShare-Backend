const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Price APIs
router.post('/price', adminController.setPrice);
router.get('/price', adminController.getPrice);

// Discount APIs
router.post('/discount', adminController.setDiscount);
router.get('/discount', adminController.getDiscount);

// Notification History API
router.get('/notifications/:userType/:userId', adminController.getNotificationHistory);

module.exports = router;