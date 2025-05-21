const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const connectDB = require('./db');
const bookingRoutes = require('./routes/booking');
const adminRoutes = require('./routes/admin');

dotenv.config();

const app = express();

// Connect to MongoDB
const connectDatabase = async () => {
  try {
    await connectDB();
    console.log('MongoDB connected');
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
  }
};
connectDatabase();

// Dynamic CORS middleware
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = [
      'http://localhost:3000', // สำหรับการพัฒนา local
      'https://queue-booking-system-client-line.vercel.app', // Frontend ที่ deploy
    ];
    console.log(`Origin received: ${origin}`);
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.log(`CORS denied for origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  console.log(`Request: ${req.method} ${req.url} from ${req.get('Origin') || 'No Origin'}`);
  res.on('finish', () => {
    console.log(`Response: ${res.statusCode} for ${req.method} ${req.url}`);
  });
  next();
});

app.use(express.json());

// LINE Login Callback
app.post('/auth/line/callback', async (req, res) => {
  const { code } = req.body;

  if (!code) {
    console.error('Missing code in request body');
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  try {
    const lineConfig = {
      LINE_CHANNEL_ID: process.env.LINE_CHANNEL_ID,
      LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET,
      LINE_REDIRECT_URI: process.env.LINE_REDIRECT_URI || 'https://queue-booking-system-client-line.vercel.app/auth/line/callback',
    };
    console.log('LINE callback - Environment variables:', lineConfig);

    if (!lineConfig.LINE_CHANNEL_ID || !lineConfig.LINE_CHANNEL_SECRET || !lineConfig.LINE_REDIRECT_URI) {
      throw new Error('Missing LINE environment variables');
    }

    const tokenResponse = await axios.post(
      'https://api.line.me/oauth2/v2.1/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: lineConfig.LINE_REDIRECT_URI,
        client_id: lineConfig.LINE_CHANNEL_ID,
        client_secret: lineConfig.LINE_CHANNEL_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenResponse.data.access_token;
    console.log('LINE Access Token:', accessToken);

    const userResponse = await axios.get('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const userId = userResponse.data.userId;
    console.log('Fetched LINE userId:', userId);

    res.json({ userId });
  } catch (error) {
    console.error('LINE Login failed:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    res.status(500).json({ error: 'Failed to authenticate with LINE', details: error.response?.data || error.message });
  }
});

// Routes
app.use('/api/bookings', bookingRoutes);
app.use('/api/admin', adminRoutes);

// Default route for health check or root
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Queue Booking System API is running' });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong!', error: err.message });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});