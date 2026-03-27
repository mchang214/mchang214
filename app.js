const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const crypto = require('crypto');
const flash = require('connect-flash');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

require('dotenv').config(); 

const User = require('./model/user'); 
const Booking = require('./model/booking'); 

const app = express();
const chatbotMemory = {};

// --- 1. KẾT NỐI MONGODB ---
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/PhongTroDB')
.then(() => console.log('✅ Đã kết nối MongoDB thành công!'))
.catch(err => console.error('❌ Lỗi kết nối MongoDB!'));

// --- 2. ĐỊNH NGHĨA MODEL ROOM ---

const roomSchema = new mongoose.Schema({
    code: String,
    title: String,
    price: Number,
    area: Number,
    direction: String,
    location: String, 
    type: String,
    mapsUrl: String,
    description: String,
    images: [String],
    status: { type: Boolean, default: true }
}, { timestamps: true });

// Đã gỡ bỏ geometry và index 2dsphere ở đây

const Room = mongoose.model('Room', roomSchema);
module.exports = Room;

// --- 3. CẤU HÌNH CLOUDINARY ---
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_NAME,
    api_key: process.env.CLOUDINARY_KEY,
    api_secret: process.env.CLOUDINARY_SECRET
});

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'phong_tro_he_thong',
        allowed_formats: ['jpg', 'png', 'jpeg']
    }
});
const upload = multer({ storage: storage });

// --- 4. MIDDLEWARE & PASSPORT ---
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

app.use(session({ 
    secret: process.env.SESSION_SECRET, 
    resave: false, 
    saveUninitialized: true 
}));
app.use(flash());

app.use(passport.initialize());
app.use(passport.session());

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) { done(err, null); }
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                name: profile.displayName,
                email: profile.emails[0].value,
                isProfileComplete: false
            });
        }
        return done(null, user);
    } catch (err) { return done(err, null); }
}));

// Local Variables Middleware
app.use(async (req, res, next) => {
    res.locals.user = req.user || null;
    const isRootAdmin = (req.user && (req.user.email === process.env.ADMIN_EMAIL || req.user.phone === process.env.ADMIN_PHONE));
    res.locals.isAdmin = isRootAdmin || req.session.isAdmin || (req.user && req.user.role === 'admin') || false;
    res.locals.message = req.flash('message');
    res.locals.message_type = req.flash('message_type');

    if (res.locals.isAdmin) {
        try {
            const count = await Booking.countDocuments({ status: 'Chờ xác nhận' });
            res.locals.bookingCount = count; 
        } catch (err) { 
            res.locals.bookingCount = 0; 
        }
    } else {
        res.locals.bookingCount = 0;
    }
    next();
});

const isAdminMiddleware = (req, res, next) => {
    const isRootAdmin = (req.user && (req.user.email === process.env.ADMIN_EMAIL || req.user.phone === process.env.ADMIN_PHONE));
    if (isRootAdmin || req.session.isAdmin || (req.user && req.user.role === 'admin')) return next();
    res.redirect('/login');
};

// --- 5. ROUTES AUTH ---
app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/auth/google/callback', 
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
        if (!req.user.isProfileComplete) return res.redirect('/update-phone');
        res.redirect('/');
    }
);

app.get('/update-phone', (req, res) => {
    if (!req.user) return res.redirect('/login');
    res.render('update-phone', { page: 'auth' });
});

app.post('/update-phone', async (req, res) => {
    const { phone } = req.body;
    try {
        const existingUser = await User.findOne({ phone, googleId: { $exists: false } });
        if (existingUser) {
            existingUser.googleId = req.user.googleId;
            existingUser.isProfileComplete = true;
            await existingUser.save();
            await User.findByIdAndDelete(req.user._id);
            req.login(existingUser, (err) => res.redirect('/'));
        } else {
            await User.findByIdAndUpdate(req.user._id, { phone, isProfileComplete: true });
            res.redirect('/');
        }
    } catch (err) { res.send("Lỗi cập nhật SĐT"); }
});

// --- 6. ROUTES NGƯỜI DÙNG & PHÒNG ---
app.get('/', async (req, res) => {
    try {
        let filter = {};
        const { location, maxPrice, type, direction, minArea, keyword } = req.query;
        if (location) {
            filter.location = { $regex: location, $options: 'i' }; 
        }
        if (type) filter.type = type;
        if (direction) filter.direction = direction;
        if (maxPrice) filter.price = { $lte: parseInt(maxPrice) };
        if (minArea) filter.area = { $gte: parseInt(minArea) };
        if (keyword) {
            filter.$or = [
                { code: { $regex: keyword, $options: 'i' } }, 
                { title: { $regex: keyword, $options: 'i' } },
                { description: { $regex: keyword, $options: 'i' } } 
            ];
        }
        const locations = await Room.distinct('location');
        const rooms = await Room.find(filter);

        res.render('index', { 
            rooms: rooms, 
            locations: locations,
            page: 'home', 
            user: req.user, 
            isAdmin: res.locals.isAdmin,
            query: req.query 
        });
    } catch (err) { 
        console.error(err);
        res.status(500).send("Lỗi trang chủ"); 
    }
});

app.get('/room/:id', async (req, res) => {
    const room = await Room.findById(req.params.id);
    res.render('detail', { room, page: 'detail' });
});

app.get('/login', (req, res) => res.render('login', { page: 'login' }));

app.post('/login', async (req, res) => {
    try {
        const phoneInput = req.body.phone ? req.body.phone.trim() : "";
        const passwordInput = req.body.password ? req.body.password.trim() : "";

        if (phoneInput === process.env.ADMIN_PHONE && passwordInput === process.env.ADMIN_RAW_PASS) {
            let admin = await User.findOne({ phone: process.env.ADMIN_PHONE });
            if (!admin) {
                admin = await User.create({ 
                    phone: process.env.ADMIN_PHONE, 
                    password: passwordInput, 
                    role: 'admin',
                    isProfileComplete: true 
                });
            }
            req.session.isAdmin = true;
            return req.login(admin, (err) => {
                if (err) return res.redirect('/login');
                return res.redirect('/admin');
            });
        }

        const searchQuery = phoneInput.includes('@') ? phoneInput.toLowerCase() : phoneInput;
        const user = await User.findOne({ $or: [{ phone: searchQuery }, { email: searchQuery }] });

        if (!user || !user.password) {
            req.flash('message', 'Tài khoản không tồn tại hoặc chưa đặt mật khẩu!');
            req.flash('message_type', 'error');
            return res.redirect('/login');
        }

        let isMatch = false;
        if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
            isMatch = await bcrypt.compare(passwordInput, user.password);
        } else {
            isMatch = (passwordInput === user.password);
            if (isMatch) {
                user.password = passwordInput; 
                await user.save(); 
            }
        }
        if (isMatch) {
            req.login(user, (err) => {
                if (err) return res.redirect('/login');
                return res.redirect('/');
            });
        } else {
            req.flash('message', 'Mật khẩu không chính xác!');
            req.flash('message_type', 'error');
            return res.redirect('/login');
        }
    } catch (error) { 
        console.error("Lỗi Login:", error);
        res.redirect('/login'); 
    }
});

app.get('/register', (req, res) => res.render('register', { user: req.user || null, isAdmin: false, page: 'register' }));

app.post('/register', async (req, res) => {
    try {
        let { phone, email, password } = req.body;
        phone = phone ? phone.trim() : "";
        email = email ? email.trim().toLowerCase() : "";

        const conditions = [];
        if (phone) conditions.push({ phone: phone });
        if (email) conditions.push({ email: email });

        if (conditions.length > 0) {
            const userExists = await User.findOne({ $or: conditions });
            if (userExists) {
                req.flash('message', 'Số điện thoại hoặc Email này đã được sử dụng!');
                req.flash('message_type', 'error');
                return res.redirect('/register');
            }
        }

        const newUser = new User({ phone, email, password });
        await newUser.save();
        
        req.flash('message', 'Đăng ký thành công! Hãy đăng nhập.');
        req.flash('message_type', 'success');
        res.redirect('/login');

    } catch (error) {
        console.error("LỖI ĐĂNG KÝ:", error);
        req.flash('message', 'Có lỗi xảy ra, vui lòng thử lại.');
        req.flash('message_type', 'error');
        res.redirect('/register');
    }
});

// --- FORGOT PASSWORD & OTP ---
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.ADMIN_EMAIL, pass: process.env.ADMIN_PASS }
});

app.get('/forgot-password', (req, res) => res.render('forgot-password', { page: 'auth' }));

app.post('/forgot-password', async (req, res) => {
    try {
        const { phone } = req.body; 
        const user = await User.findOne({ $or: [{ email: phone }, { phone: phone }] });
        if (!user || !user.email) {
            req.flash('message', 'Không tìm thấy tài khoản có email!');
            return res.redirect('/forgot-password');
        }
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        req.session.otp = otp;
        req.session.resetPhone = user.phone; 
        req.session.otpExpires = Date.now() + 300000;

        await transporter.sendMail({
            // SỬA LỖI: Thêm dấu backtick quanh chuỗi có biến
            from: `"PHONGTROHN" <${process.env.ADMIN_EMAIL}>`,
            to: user.email,
            subject: '[PHONGTROHN] Mã xác thực OTP',
            // SỬA LỖI: Thêm dấu backtick quanh HTML
            html: `<h3>Mã OTP của bạn là: ${otp}</h3><p>Hiệu lực trong 5 phút.</p>`
        });
        res.redirect('/verify-otp');
    } catch (err) { res.redirect('/forgot-password'); }
});

app.get('/verify-otp', (req, res) => res.render('verify-otp', { page: 'auth' }));
app.post('/verify-otp', (req, res) => {
    if (Date.now() > req.session.otpExpires) return res.redirect('/forgot-password');
    if (req.body.otp === req.session.otp) {
        req.session.otpVerified = true;
        res.redirect('/reset-password');
    } else { res.redirect('/verify-otp'); }
});

app.get('/reset-password', (req, res) => res.render('reset-password', { page: 'auth' }));
app.post('/reset-password', async (req, res) => {
    if (!req.session.otpVerified) return res.redirect('/forgot-password');
    try {
        const user = await User.findOne({ phone: req.session.resetPhone });
        if (user) {
            user.password = req.body.password; 
            await user.save();
        }
        delete req.session.otp;
        delete req.session.otpVerified;
        req.flash('message', 'Đặt lại mật khẩu thành công!');
        res.redirect('/login');
    } catch (err) { res.redirect('/forgot-password'); }
});

app.get('/logout', (req, res) => {
    req.logout(() => {
        req.session.destroy();
        res.redirect('/');
    });
});

app.post('/save-room/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ success: false, msg: "Cần đăng nhập" });
    try {
        const user = await User.findById(req.user._id);
        const roomId = req.params.id;
        const isSaved = user.savedRooms.includes(roomId);

        if (isSaved) {
            user.savedRooms.pull(roomId);
            await user.save();
            return res.json({ success: true, saved: false }); 
        } else {
            user.savedRooms.push(roomId);
            await user.save();
            return res.json({ success: true, saved: true }); 
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.get('/da-luu', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    const userData = await User.findById(req.user._id).populate('savedRooms');
    res.render('da-luu', { userData, user: req.user, page: 'saved' });
});

app.post('/book', async (req, res) => {
    const { roomId, appointmentTime, guestName, roomCode, guestPhone, roomTitle } = req.body;
    try {
        let finalPhone = "";
        let userId = null;
        if (req.user) {
            finalPhone = req.user.phone || "N/A";
            userId = req.user._id;
            await User.findByIdAndUpdate(req.user._id, {
                $push: { 
                    appointments: { 
                        room: roomId, 
                        appointmentTime, 
                        guestName,
                        guestPhone: finalPhone 
                    } 
                }
            });
        } else {
            finalPhone = guestPhone;
        }

        const newBooking = new Booking({
            room: roomId, roomCode, guestName, guestPhone: finalPhone,
            appointmentTime, user: userId, isGuest: req.user ? false : true, roomTitle 
        });
        await newBooking.save();

        // SỬA LỖI: Thêm dấu backtick cho roomLink
        const roomLink = `${req.protocol}://${req.get('host')}/room/${roomId}`;
        const formattedTime = new Date(appointmentTime).toLocaleString('vi-VN');

        await transporter.sendMail({
            from: '"Hệ thống Phòng Trọ" <no-reply@phongtrohn.com>',
            to: process.env.ADMIN_EMAIL,
            // SỬA LỖI: Thêm dấu backtick cho subject
            subject: `[Lịch hẹn] ${roomCode} - ${roomTitle} - Khách: ${guestName}`,
            html: `
                <div style="font-family: sans-serif; line-height: 1.6; border: 1px solid #eee; padding: 20px; max-width: 600px;">
                    <h2 style="color: #0066ff; border-bottom: 2px solid #0066ff; padding-bottom: 10px;">Yêu cầu xem phòng mới</h2>
                    <p><b>Tiêu đề:</b> ${roomTitle}</p>
                    <p><b>Khách hàng:</b> ${guestName} - ${finalPhone}</p>
                    <p><b>Mã phòng:</b> <a href="${roomLink}">${roomCode}</a></p>
                    <p><b>Giờ hẹn:</b> ${formattedTime}</p>
                </div>
            `
        });

        req.flash('message', 'Bạn đã yêu cầu xem phòng thành công!');
        req.flash('message_type', 'success');
        // SỬA LỖI: Thêm dấu backtick cho redirect
        res.redirect(`/room/${roomId}`);
    } catch (err) {
        req.flash('message', 'Đã có lỗi xảy ra.');
        res.redirect(`/room/${roomId}`);
    }
});

app.get('/lich-hen', async (req, res) => {
    if (!req.user) return res.redirect('/login');
    try {
        const userData = await User.findById(req.user._id).populate('appointments.room');
        if (userData && userData.appointments) {
            userData.appointments.sort((a, b) => {
                return b._id.getTimestamp() - a._id.getTimestamp();
            });
        }

        res.render('lich-hen', { 
            userData, 
            user: req.user, 
            page: 'appointments' 
        });
    } catch (error) {
        console.error("Lỗi khi lấy lịch hẹn:", error);
        res.status(500).send("Có lỗi xảy ra khi tải lịch hẹn.");
    }
});
// --- 7 ROUTES ADMIN ---
app.get('/admin', isAdminMiddleware, async (req, res) => {
    const { search } = req.query; 
    let query = search ? { $or: [{ code: { $regex: search.trim(), $options: 'i' } }, { title: { $regex: search.trim(), $options: 'i' } }] } : {};
    const rooms = await Room.find(query).sort({ createdAt: -1 });
    res.render('admin-list', { rooms, searchQuery: search || '', page: 'admin-list' });
});

app.get('/admin/add', isAdminMiddleware, (req, res) => {
    res.render('admin-add', { page: 'admin-add', editRoom: null });
});

app.post('/admin/add', isAdminMiddleware, upload.array('images', 10), async (req, res) => {
    const { title, price, area, district, address, description, type, direction, code } = req.body;
    const finalPrice = (parseFloat(price.toString().replace(',', '.')) || 0) * 1000000;
    await Room.create({
        code, title, price: finalPrice, area, description, type, direction,
        // SỬA LỖI: Thêm dấu backtick cho location
        location: `${address}, ${district}, Hà Nội`,
        images: req.files ? req.files.map(f => f.path) : []
    });
    res.redirect('/admin');
});

app.get('/admin/bookings', async (req, res) => {
    try {
        const rawBookings = await Booking.find().populate('room').sort({ createdAt: -1 });
        const bookings = rawBookings.map(b => {
            if (!b.room) {
                b.room = { location: "Phòng đã bị xóa", price: 0 };
            }
            return b;
        });
        res.render('admin-bookings', { 
            bookings: bookings, 
            page: 'admin-bookings',
            isAdmin: true, 
            user: req.user 
        });
    } catch (error) {
        console.error("Lỗi trang lịch hẹn:", error);
        res.status(500).send("Lỗi Server: " + error.message);
    }
});

app.post('/admin/bookings/confirm/:id', async (req, res) => {
    try {
        const bookingId = req.params.id;
        const newStatus = (req.body && req.body.status) ? req.body.status : 'Đã xác nhận';

        const updatedBooking = await Booking.findByIdAndUpdate(
            bookingId, 
            { status: newStatus }, 
            { new: true }
        );

        if (!updatedBooking) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy lịch hẹn' });
        }

        if (updatedBooking.user) {
            await User.updateOne(
                { 
                    _id: updatedBooking.user, 
                    "appointments.room": updatedBooking.room,
                    "appointments.appointmentTime": updatedBooking.appointmentTime 
                },
                { 
                    $set: { "appointments.$.status": newStatus } 
                }
            );
        }

        res.json({ 
            success: true, 
            message: 'Đã cập nhật trạng thái Admin thành công!' 
        });
    } catch (error) {
        console.error("Lỗi xác nhận lịch hẹn:", error);
        res.status(500).json({ success: false, message: 'Lỗi server khi xác nhận' });
    }
});

app.get('/admin/api/bookings-data', async (req, res) => {
    try {
        const bookings = await Booking.find().populate('room').sort({ createdAt: -1 });
        
        const cleanData = bookings.map(b => {
            const roomData = b.room || { location: "N/A", price: 0 }; 
            const roomPrice = roomData.price || 0;
            
            return {
                "Ngày gửi": b.createdAt ? new Date(b.createdAt).toLocaleDateString('vi-VN') : "", 
                "Khách hàng": b.guestName,
                "Số điện thoại": b.guestPhone,
                "Mã phòng": b.roomCode,
                "Địa chỉ": roomData.location,
                "Giá phòng": roomPrice,
                "Ngày hẹn": new Date(b.appointmentTime).toLocaleDateString('vi-VN'),
                "Trạng thái": b.status,
                "Phân loại": b.isGuest ? "Vãng lai" : "Thành viên",
                "Lợi nhuận (%)": "", // Để trống để bạn điền vào Sheet (ví dụ: 0.1 cho 10%)
                "Hoa hồng": 0        
            };
        });
        res.json(cleanData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/admin/delete/:id', isAdminMiddleware, async (req, res) => {
    await Room.findByIdAndDelete(req.params.id);
    res.redirect('/admin');
});

app.get('/admin/edit/:id', isAdminMiddleware, async (req, res) => {
    const room = await Room.findById(req.params.id);
    res.render('admin-add', { page: 'admin-list', editRoom: room });
});

app.post('/admin/edit/:id', isAdminMiddleware, upload.array('images', 10), async (req, res) => {
    const { title, price, area, district, address, description, type, direction, code } = req.body;
    const updateData = {
        title, code, area, description, type, direction,
        price: (parseFloat(price.toString().replace(',', '.')) || 0) * 1000000,
        // SỬA LỖI: Thêm dấu backtick
        location: `${address}, ${district}, Hà Nội`
    };
    if (req.files && req.files.length > 0) updateData.images = req.files.map(f => f.path);
    await Room.findByIdAndUpdate(req.params.id, updateData);
    res.redirect('/admin');
});

app.get('/admin/toggle/:id', isAdminMiddleware, async (req, res) => {
    const room = await Room.findById(req.params.id);
    room.status = !room.status;
    await room.save();
    res.redirect('/admin');
});

app.get('/api/chatbot/search', async (req, res) => {
    try {
        res.setHeader('ngrok-skip-browser-warning', 'true');

        const userId = req.sessionID;

        if (!chatbotMemory[userId]) {
            chatbotMemory[userId] = {};
        }

        let memory = chatbotMemory[userId];

        const { maxPrice, locations, location, keyword, minArea } = req.query;

        // ===== UPDATE MEMORY =====
        if (maxPrice) memory.maxPrice = parseInt(maxPrice);
        if (minArea) memory.minArea = parseInt(minArea);
        if (keyword) memory.keyword = keyword;

        if (locations || location) {
            memory.location = locations || location;
        }

        // ===== BUILD FILTER FROM MEMORY =====
        let filter = { status: true };

        if (memory.maxPrice) {
            filter.price = { $lte: memory.maxPrice };
        }

        if (memory.minArea) {
            filter.area = { $gte: memory.minArea };
        }

        if (memory.location) {
            const locArray = Array.isArray(memory.location)
                ? memory.location
                : [memory.location];

            filter.location = {
                $in: locArray.map(l => new RegExp(l, 'i'))
            };
        }

        if (memory.keyword) {
            filter.$or = [
                { title: { $regex: memory.keyword, $options: 'i' } },
                { description: { $regex: memory.keyword, $options: 'i' } }
            ];
        }

        let rooms = await Room.find(filter);

app.get('/api/chatbot/compare', async (req, res) => {
    try {

        const text = req.query.q || ""

        const keyword = new RegExp(text, 'i')

        const rooms = await Room.find({
            $or: [
                { code: keyword },
                { title: keyword }
            ]
        }).limit(2)

        res.json({
            success: true,
            data: rooms
        })

    } catch (err) {
        console.log(err)
        res.json({ success: false })
    }
})

        // ===== AI SCORING =====
        function scoreRoom(r) {
            let score = 0;

            if (memory.maxPrice && r.price <= memory.maxPrice) score += 3;
            if (memory.minArea && r.area >= memory.minArea) score += 2;

            if (memory.location) {
                const locText = Array.isArray(memory.location)
                    ? memory.location.join(" ")
                    : memory.location;

                if (r.location.toLowerCase().includes(locText.toLowerCase())) {
                    score += 4;
                }
            }

            return score;
        }

        rooms = rooms.map(r => ({
            ...r._doc,
            score: scoreRoom(r)
        }));

        rooms.sort((a, b) => b.score - a.score);

        rooms = rooms.slice(0, 5);

        res.json({
            success: true,
            memory: memory,
            data: rooms
        });

    } catch (err) {
        console.error("Chatbot AI error:", err);
        res.status(500).json({ success: false });
    }
});

app.get('/api/chatbot/search-advanced', async (req, res) => {
    try {
        const { maxPrice, location, keyword, minArea, direction } = req.query;
        let filter = { status: true };
        
        if (maxPrice) filter.price = { $lte: parseInt(maxPrice) };
        if (location) filter.location = { $regex: location, $options: 'i' };
        if (minArea) filter.area = { $gte: parseInt(minArea) };
        if (direction) filter.direction = { $regex: direction, $options: 'i' };
        if (keyword) {
            filter.$or = [
                { description: { $regex: keyword, $options: 'i' } }, 
                { title: { $regex: keyword, $options: 'i' } }
            ];
        }

        const rooms = await Room.find(filter).limit(5);
        const results = rooms.map(r => ({
            _id: r._id,
            code: r.code, 
            title: r.title,
            price: (r.price / 1000000).toFixed(1) + " triệu",
            area: r.area,
            location: r.location
        }));
        res.json({ success: true, data: results });
    } catch (err) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 3000;
// SỬA LỖI: Dấu backtick cho console.log
app.listen(PORT, () => console.log(`✅ Server: http://localhost:${PORT}`));