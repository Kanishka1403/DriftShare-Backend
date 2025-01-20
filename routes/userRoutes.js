const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.post('/add-push-token', userController.addPushToken);

module.exports = router;