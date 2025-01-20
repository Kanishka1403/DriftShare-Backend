// controllers/withdrawalController.js
const { v4: uuidv4 } = require('uuid');
const Driver = require('../models/Driver');
const WithdrawalRequest = require('../models/Withdrawal');
const Transaction = require('../models/Transaction');
const { sendPushNotification } = require('../utils/fcmUtils');

exports.createWithdrawalRequest = async (req, res) => {
  try {
    const { driverId, amount, upiId, mobileNumber } = req.body;

    const driver = await Driver.findById(driverId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    // Check minimum balance requirement
    if (driver.walletBalance < 200) {
      return res.status(400).json({ 
        message: 'Minimum balance requirement not met. Need at least ₹200 to make a withdrawal request' 
      });
    }

    // Check if amount is valid
    if (amount > driver.walletBalance) {
      return res.status(400).json({ message: 'Insufficient balance for withdrawal' });
    }

    // Create withdrawal request
    const withdrawalRequest = new WithdrawalRequest({
      _id: uuidv4(),
      driverId,
      amount,
      upiId,
      mobileNumber,
      status: 'pending'
    });

    await withdrawalRequest.save();

    // Update driver's UPI and mobile if provided
    if (upiId) driver.upiId = upiId;
    if (mobileNumber) driver.mobileNumber = mobileNumber;
    await driver.save();

    // Send notification to driver
    if (driver.pushToken) {
      await sendPushNotification(
        driver.pushToken,
        'Withdrawal Request Created',
        `Your withdrawal request for ₹${amount} has been created and is pending approval.`,
        { type: 'withdrawal_request_created' }
      );
    }

    res.status(201).json({
      message: 'Withdrawal request created successfully',
      withdrawalRequest
    });
  } catch (error) {
    res.status(500).json({ message: 'Error creating withdrawal request', error: error.message });
  }
};

exports.processWithdrawalRequest = async (req, res) => {
  try {
    const { requestId, action, remarks } = req.body;

    const withdrawalRequest = await WithdrawalRequest.findById(requestId);
    if (!withdrawalRequest) {
      return res.status(404).json({ message: 'Withdrawal request not found' });
    }

    // Check if request is already processed
    if (withdrawalRequest.status === 'completed' || withdrawalRequest.status === 'rejected') {
      return res.status(400).json({ 
        message: `This withdrawal request has already been ${withdrawalRequest.status}. Request ID: ${requestId}`,
        status: withdrawalRequest.status,
        processedDate: withdrawalRequest.processedDate,
        remarks: withdrawalRequest.remarks
      });
    }

    // Check if request is in pending state
    if (withdrawalRequest.status !== 'pending') {
      return res.status(400).json({ 
        message: `Invalid request status: ${withdrawalRequest.status}. Only pending requests can be processed.`
      });
    }

    const driver = await Driver.findById(withdrawalRequest.driverId);
    if (!driver) {
      return res.status(404).json({ message: 'Driver not found' });
    }

    if (action === 'approve') {
      // Additional check for minimum balance requirement
      if ((driver.walletBalance - withdrawalRequest.amount) < 200) {
        await WithdrawalRequest.updateOne(
          { _id: requestId },
          { 
            status: 'rejected',
            processedDate: new Date(),
            remarks: 'Insufficient balance to maintain minimum account requirement of ₹200'
          }
        );
        
        if (driver.pushToken) {
          await sendPushNotification(
            driver.pushToken,
            'Withdrawal Failed',
            'Your withdrawal request was rejected due to insufficient balance. Minimum balance of ₹200 must be maintained.',
            { type: 'withdrawal_rejected' }
          );
        }
        
        return res.status(400).json({ 
          message: 'Insufficient balance to maintain minimum account requirement of ₹200'
        });
      }

      // Check if driver still has sufficient balance
      if (driver.walletBalance < withdrawalRequest.amount) {
        await WithdrawalRequest.updateOne(
          { _id: requestId },
          { 
            status: 'rejected',
            processedDate: new Date(),
            remarks: 'Insufficient balance'
          }
        );
        
        if (driver.pushToken) {
          await sendPushNotification(
            driver.pushToken,
            'Withdrawal Failed',
            'Your withdrawal request was rejected due to insufficient balance.',
            { type: 'withdrawal_rejected' }
          );
        }
        
        return res.status(400).json({ message: 'Insufficient balance' });
      }

      // Create transaction record first
      const transaction = new Transaction({
        _id: uuidv4(),
        userId: driver._id,
        userType: 'driver',
        amount: -withdrawalRequest.amount,
        type: 'debit',
        paymentMethod: 'upi',
        description: `Withdrawal to UPI (${withdrawalRequest.upiId})`,
        timestamp: new Date()
      });

      await transaction.save();

      try {
        // Update withdrawal request
        withdrawalRequest.status = 'completed';
        withdrawalRequest.processedDate = new Date();
        withdrawalRequest.transactionId = transaction._id;
        withdrawalRequest.remarks = remarks;
        await withdrawalRequest.save();

        // Deduct amount from driver's wallet
        driver.walletBalance -= withdrawalRequest.amount;
        driver.transactionHistory.push(transaction._id);
        await driver.save();

        // Send notification to driver
        if (driver.pushToken) {
          await sendPushNotification(
            driver.pushToken,
            'Withdrawal Completed',
            `Your withdrawal request for ₹${withdrawalRequest.amount} has been processed successfully to UPI ID: ${withdrawalRequest.upiId}`,
            { 
              type: 'withdrawal_completed',
              amount: withdrawalRequest.amount,
              transactionId: transaction._id
            }
          );
        }
      } catch (error) {
        // If something fails after transaction creation, mark the request as failed
        await Transaction.findByIdAndDelete(transaction._id);
        await WithdrawalRequest.updateOne(
          { _id: requestId },
          { 
            status: 'failed',
            processedDate: new Date(),
            remarks: 'Transaction processing failed'
          }
        );
        throw error;
      }

    } else if (action === 'reject') {
      withdrawalRequest.status = 'rejected';
      withdrawalRequest.processedDate = new Date();
      withdrawalRequest.remarks = remarks || 'Request rejected by admin';
      await withdrawalRequest.save();

      // Send notification to driver
      if (driver.pushToken) {
        await sendPushNotification(
          driver.pushToken,
          'Withdrawal Rejected',
          `Your withdrawal request for ₹${withdrawalRequest.amount} has been rejected. ${remarks ? `Reason: ${remarks}` : ''}`,
          { 
            type: 'withdrawal_rejected',
            amount: withdrawalRequest.amount,
            reason: remarks
          }
        );
      }
    } else {
      return res.status(400).json({ message: 'Invalid action. Use "approve" or "reject"' });
    }

    res.status(200).json({
      message: `Withdrawal request ${action}ed successfully`,
      withdrawalRequest
    });
  } catch (error) {
    res.status(500).json({ 
      message: 'Error processing withdrawal request', 
      error: error.message 
    });
  }
};

exports.getWithdrawalRequests = async (req, res) => {
  try {
    const { driverId, status } = req.query;
    const query = {};
    
    if (driverId) query.driverId = driverId;
    if (status) query.status = status;
    console.log(`Driver :${driverId} and status: ${status}`);
    const withdrawalRequests = await WithdrawalRequest.find(query);
    console.log(withdrawalRequests);

    res.status(200).json({ withdrawalRequests });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching withdrawal requests', error: error.message });
  }
};