const express = require('express');
const router = express.Router();
const axios = require('axios');
const Booking = require('../models/Booking');
const authMiddleware = require('../middleware/auth');

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const ADMIN_USER_ID = process.env.ADMIN_USER_ID;

// Create a new booking
router.post('/', async (req, res) => {
  const { name, phone, carModel, licensePlate, date, time } = req.body;

  try {
    if (!name || !phone || !carModel || !licensePlate || !date || !time) {
      return res.status(400).json({ message: 'กรุณาระบุข้อมูลทั้งหมด' });
    }

    const phoneRegex = /^0[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'เบอร์โทรต้องมี 10 หลัก เริ่มต้นด้วย 0' });
    }

    const bookingDate = new Date(date);
    bookingDate.setHours(0, 0, 0, 0);
    const existingBooking = await Booking.findOne({
      date: bookingDate,
      time,
      status: { $in: ['pending', 'accepted'] },
    });

    if (existingBooking) {
      return res.status(400).json({ message: 'เวลาเต็ม' });
    }

    const booking = new Booking({
      name,
      phone,
      carModel,
      licensePlate,
      date: bookingDate,
      time,
      status: 'pending',
    });
    await booking.save();

    if (ADMIN_USER_ID && CHANNEL_ACCESS_TOKEN) {
      try {
        // Format date to Thai format
        const thaiDate = new Date(date).toLocaleDateString('th-TH', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        // Format time to include ".00"
        const formattedTime = `${time}.00`;

        const message = `มีคำขอ ล้างรถ ใหม่\n` +
                       `ชื่อ: ${name}\n` +
                       `เบอร์โทร: ${phone}\n` +
                       `รุ่นรถ: ${carModel}\n` +
                       `ทะเบียน: ${licensePlate}\n` +
                       `วันที่สะดวก: ${thaiDate}\n` +
                       `เวลา ${formattedTime}\n` +
                       `กรุณาโทรไปคอนเฟิร์ม`;

        const adminResponse = await axios.post(
          'https://api.line.me/v2/bot/message/push',
          {
            to: ADMIN_USER_ID,
            messages: [
              {
                type: 'text',
                text: message,
              },
            ],
          },
          { headers: { Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}` } }
        );
        console.log('LINE notification to admin sent successfully:', adminResponse.data);
      } catch (lineError) {
        console.error('Failed to send LINE notification to admin:', {
          status: lineError.response?.status,
          data: lineError.response?.data,
          message: lineError.message,
        });
      }
    } else {
      console.warn('Cannot send LINE notification to admin: ADMIN_USER_ID or CHANNEL_ACCESS_TOKEN is missing');
    }

    res.status(201).json({ message: 'จองสำเร็จ', booking });
  } catch (error) {
    console.error('Error creating booking:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Check status by phone
router.post('/check-status', async (req, res) => {
  const { phone } = req.body;

  try {
    if (!phone) {
      return res.status(400).json({ message: 'กรุณาระบุเบอร์โทร' });
    }

    const phoneRegex = /^0[0-9]{9}$/;
    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ message: 'เบอร์โทรต้องมี 10 หลัก เริ่มต้นด้วย 0' });
    }

    const bookings = await Booking.find({ phone }).sort({ createdAt: -1 });
    if (bookings.length > 0) {
      res.json(bookings);
    } else {
      res.json([]);
    }
  } catch (error) {
    console.error('Error checking status:', error.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all bookings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get booking summary
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const summary = {
      todayBookings: await Booking.countDocuments({
        date: { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
      }),
      pendingBookings: await Booking.countDocuments({ status: 'pending' }),
      statusBreakdown: await Booking.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    };
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update booking status
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    res.json(booking);
  } catch (error) {
    console.error('PATCH /api/bookings/:id error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete a booking
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const booking = await Booking.findByIdAndDelete(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    res.json({ message: 'Booking deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get booked times for a specific date
router.get('/booked-times', async (req, res) => {
  try {
    const dateParam = req.query.date;
    if (!dateParam) {
      return res.status(400).json({ message: 'Missing date parameter' });
    }

    const date = new Date(dateParam);
    date.setHours(0, 0, 0, 0);
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    const bookings = await Booking.find({
      date: { $gte: date, $lt: nextDate },
      status: { $in: ['pending', 'accepted'] },
    });

    const bookedTimes = bookings.map((b) => b.time);

    res.json({ bookedTimes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;