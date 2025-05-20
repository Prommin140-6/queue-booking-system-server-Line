const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./db');
const bookingRoutes = require('./routes/booking'); // ถูกต้องตามที่คุณยืนยัน
const adminRoutes = require('./routes/admin');

dotenv.config();
const app = express();

// Connect to MongoDB
connectDB().catch(err => {
  console.error('Failed to start server due to DB connection error:', err);
  process.exit(1);
});

// Dynamic CORS middleware
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000',
      'https://queue-booking-system-client.vercel.app'
    ];
    console.log(`Origin received: ${origin}`);
    if (!origin || allowedOrigins.some(allowed => origin === allowed || origin.startsWith(allowed))) {
      callback(null, true);
    } else {
      console.log(`CORS denied for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// จัดการ OPTIONS request
app.options('*', cors(corsOptions));

// Log request and response
app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.url} from ${req.get('Origin') || 'No Origin'}`);
  res.on('finish', () => {
    console.log(`Response: ${res.statusCode} for ${req.method} ${req.url}`);
  });
  next();
});

app.use(express.json());

// Routes
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));