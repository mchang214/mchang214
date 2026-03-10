const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    googleId: String,
    name: String,
    email: { type: String, unique: true, sparse: true }, 
    phone: { type: String, unique: true, sparse: true }, 
    password: { type: String }, // Có thể thêm select: false nếu muốn ẩn mặc định
    role: { type: String, default: 'user' }, 
    isProfileComplete: { type: Boolean, default: false }, 
    
    savedRooms: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],
    appointments: [{
        room: { type: mongoose.Schema.Types.ObjectId, ref: 'Room' },
        appointmentTime: Date,
        guestName: String,
        guestPhone: String,
        status: { type: String, default: 'Chờ xác nhận' },
        createdAt: { type: Date, default: Date.now }
    }]
});

userSchema.pre('save', async function () {
    if (!this.isModified('password')) return; 

    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
    } catch (error) {
        throw error; 
    }
});

userSchema.set('autoIndex', true);

module.exports = mongoose.model('User', userSchema);