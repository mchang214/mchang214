const mongoose = require('mongoose');

const bookingSchema = new mongoose.Schema({
    room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room', required: true },
    roomCode: { type: String },
    roomTitle: { type: String },
    guestName: { type: String, required: true },
    guestPhone: { type: String, required: true },
    appointmentTime: { type: Date, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, 
    isGuest: { type: Boolean, default: false }, 
    status: { 
        type: String, 
        enum: ['Chờ xác nhận', 'Đã gửi SĐT', 'Đã đi xem phòng', 'Đã chốt'],
        default: 'Chờ xác nhận' 
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Booking', bookingSchema);