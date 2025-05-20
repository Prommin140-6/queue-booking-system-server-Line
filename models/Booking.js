const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { 
    type: String, 
    required: true,
    match: [/^0[0-9]{9}$/, 'เบอร์โทรต้องมี 10 หลัก เริ่มต้นด้วย 0 และเป็นตัวเลขเท่านั้น']
  },
  carModel: { type: String, required: true },
  licensePlate: { type: String, required: true },
  date: { type: Date, required: true },
  time: { 
    type: String, 
    required: true,
    enum: ['10:00', '11:00', '13:00'] // รายการเวลาที่อนุญาต
  },
  status: { 
    type: String, 
    default: 'pending', 
    enum: ['pending', 'accepted', 'rejected']
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('Booking', bookingSchema);