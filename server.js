require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const socketIo = require('socket.io');
const driverRoutes = require('./routes/driverRoutes');
const passengerRoutes = require('./routes/passengerRoutes');
const rideRequestRoutes = require('./routes/rideRequestRoutes');
const { connectDB } = require('./config/database');
const socketHandlers = require('./services/socketHandlers');
const walletRoutes = require('./routes/walletRoutes');
const userRoutes = require('./routes/userRoutes');
const feedBack = require('./routes/feedBackRoute');
const adminRoutes = require('./routes/adminRoutes');
const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());

// Routes
app.use('/api/drivers', driverRoutes);
app.use('/api/passengers', passengerRoutes);
app.use('/api/ride-requests', rideRequestRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/ride', feedBack);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
// Serve static files (if you have a frontend)
app.use(express.static('public'));

// Basic route for testing
app.get('/', (req, res) => {
  res.send('Taxi App Backend is running!');
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const startServer = async () => {
  try {
    await connectDB();
    console.log('MongoDB connected successfully');

    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));

    // Initialize Socket.IO
    socketHandlers.init(io);
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
startServer();

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = { app, server, io };