const express = require('express');
const router = express.Router();
const Booking = require('../models/Booking');
const authMiddleware = require('../middleware/auth');

// Create a new booking
router.post('/', async (req, res) => {
  const { name, phone, carModel, licensePlate, date, time } = req.body;
  try {
    // ตรวจสอบว่ามีคิวในวันที่และเวลาเดียวกันที่เป็น pending หรือ accepted หรือไม่
    const existingBooking = await Booking.findOne({
      date: new Date(date),
      time,
      status: { $in: ['pending', 'accepted'] } // ตรวจสอบทั้ง pending และ accepted
    });
    if (existingBooking) {
      return res.status(400).json({ message: 'เวลา\nเต็ม' });
    }

    const booking = new Booking({ name, phone, carModel, licensePlate, date, time, status: 'pending' });
    await booking.save();
    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get all bookings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const bookings = await Booking.find();
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
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
      statusBreakdown: await Booking.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
    };
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Update booking status
router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    console.log('PATCH /api/bookings/:id received body:', req.body);
    const { status } = req.body;
    if (!['pending', 'accepted', 'rejected'].includes(status)) {
      console.log('Invalid status:', status);
      return res.status(400).json({ message: 'Invalid status value' });
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );
    if (!booking) {
      console.log('Booking not found for ID:', req.params.id);
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
    await Booking.findByIdAndDelete(req.params.id);
    res.json({ message: 'Booking deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Get booked times for a specific date
router.get('/booked-times', async (req, res) => {
  try {
    const dateParam = req.query.date;
    if (!dateParam) {
      return res.status(400).json({ message: 'Missing date parameter' });
    }

    // แปลงวันที่เป็น Date object และ normalize เวลาเป็น 00:00:00
    const date = new Date(dateParam);
    date.setHours(0, 0, 0, 0);

    // หาวันถัดไปเพื่อใช้เป็นช่วงเวลาค้นหา
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);

    // ค้นหาการจองที่อยู่ในวันนั้นและมี status: pending หรือ accepted
    const bookings = await Booking.find({
      date: { $gte: date, $lt: nextDate },
      status: { $in: ['pending', 'accepted'] }, // กรองเฉพาะ pending และ accepted
    });

    // สร้าง array รายการเวลาที่ถูกจองไปแล้ว
    const bookedTimes = bookings.map(b => b.time);

    res.json({ bookedTimes });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Export router
module.exports = router;