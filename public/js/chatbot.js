if (typeof BASE_URL === 'undefined') {
    window.BASE_URL = window.location.origin;
}

/**
 * 1. QUẢN LÝ LỊCH SỬ CHAT
 */
if (typeof getChatStorageKey === 'undefined') {
    window.getChatStorageKey = () => {
        // Nội dung hàm của bạn ở đây
        return 'chat_storage_key'; 
    };
}

function saveChatHistory(text, isUser) {
    const STORAGE_KEY = getChatStorageKey();
    let history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    history.push({ text, isUser });
    if (history.length > 50) history.shift(); 
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function loadChatHistory() {
    const box = document.getElementById("chatbot-messages");
    if (!box) return;
    box.innerHTML = ""; 
    const STORAGE_KEY = getChatStorageKey();
    let history = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    if (history.length > 0) {
        history.forEach(item => {
            addMessage(item.text, item.isUser, false); 
        });
    } else {
        const welcomeMsg = "👋 Xin chào! Tôi là trợ lý ảo của <b>PHONGTROHN</b>. Bạn muốn tìm phòng ở quận nào, giá bao nhiêu và diện tích thế nào?";
        addMessage(welcomeMsg, false, false); 
    }
}

function addMessage(text, isUser = false, shouldSave = true) {
    const box = document.getElementById("chatbot-messages");
    if (!box) return;
    const div = document.createElement("div");
    Object.assign(div.style, {
        padding: "10px 14px", borderRadius: "18px", marginBottom: "12px",
        maxWidth: "85%", wordWrap: "break-word", fontSize: "14px", lineHeight: "1.5",
        boxShadow: "0 2px 5px rgba(0,0,0,0.05)", clear: "both"
    });
    
    if (isUser) {
        div.style.backgroundColor = "#0d6efd"; div.style.color = "white";
        div.style.float = "right"; div.style.borderBottomRightRadius = "4px";
    } else {
        div.style.backgroundColor = "#f0f2f5"; div.style.color = "#1c1e21";
        div.style.float = "left"; div.style.borderBottomLeftRadius = "4px";
    }
    div.innerHTML = text;
    box.appendChild(div);
    const clearfix = document.createElement("div");
    clearfix.style.clear = "both";
    box.appendChild(clearfix);
    box.scrollTo({ top: box.scrollHeight, behavior: 'smooth' });
    if (shouldSave) saveChatHistory(text, isUser);
}

function detectIntent(msg) {
    msg = msg.toLowerCase();
    if (msg.includes("so sánh") || msg.includes("so sanh")) return "COMPARE";
    if (msg.includes("nên thuê") || msg.includes("phòng nào tốt") || msg.includes("tư vấn")) return "ADVICE";
    return "SEARCH";
}

function buildFollowup(memory) {
    if (!memory) return null;
    if (!memory.location) return "👉 Bạn muốn thuê khu vực quận nào để mình tìm chuẩn hơn?";
    if (!memory.maxPrice) return "👉 Bạn muốn thuê khoảng bao nhiêu triệu?";
    if (!memory.minArea) return "👉 Bạn cần phòng rộng khoảng bao nhiêu m²?";
    return null;
}

function buildAdvice(room, memory) {
    if (!room || !memory) return "";
    let msg = `🤖 Mình thấy phòng <b>${room.title}</b> phù hợp nhất với bạn vì:<br>`;
    if (memory.maxPrice && room.price <= memory.maxPrice) msg += "✅ Giá nằm trong ngân sách bạn mong muốn<br>";
    if (memory.minArea && room.area >= memory.minArea) msg += "✅ Diện tích rộng thoải mái<br>";
    
    // THÊM: Khen dựa trên đánh giá bình luận
    if (memory.keyword && room.relevanceScore > 0) {
        msg += `✅ Được nhiều người thuê trước khen là rất <b>${memory.keyword}</b><br>`;
    }

    if (memory.location && Array.isArray(memory.location) &&
        memory.location.some(loc => room.location.toLowerCase().includes(loc.toLowerCase()))) {
        msg += "✅ Đúng khu vực bạn cần tìm<br>";
    }
    msg += "👉 Bạn muốn tìm thêm loại phòng khác không?";
    return msg;
}

/**
 * 2. HÀM TRÍCH XUẤT THÔNG TIN
 */
function extractInfo(message) {
    const msg = message.toLowerCase();
    let info = { 
        maxPrice: null, 
        minArea: null, 
        locations: [], 
        utilities: [], 
        excludeKeywords: [],
        keyword: ""
    };

    // 2.1. Trích xuất các từ khóa tiện ích (Keywords)
    const utilityMap = [
        "ban công", "giường tầng", "gác xép", 
        "oto đỗ cửa", "cửa sổ", "pet", "xe điện"
    ];
    utilityMap.forEach(util => {
        if (msg.includes(util)) info.utilities.push(util);
    });

    const commonKeywords = ["an ninh", "sạch sẽ", "yên tĩnh", "thoáng", "chủ nhà", "gần chợ", "điện nước"];
    commonKeywords.forEach(word => {
        if (msg.includes(word)) info.keyword = word; 
    });
    // Nếu không khớp từ khóa mẫu nhưng có yêu cầu đặc biệt, lấy utility làm keyword
    if (!info.keyword && info.utilities.length > 0) info.keyword = info.utilities[0];

    // 2.2. Trích xuất từ khóa từ chối (Exclude)
    const denyWords = ["không", "khong", "kh", "ko", "k"];
    denyWords.forEach(deny => {
        utilityMap.forEach(util => {
            const phrase = `${deny} ${util}`;
            if (msg.includes(phrase)) {
                info.excludeKeywords.push(util);
                info.utilities = info.utilities.filter(u => u !== util);
            }
        });
    });

    // 2.3. Xử lý Địa điểm
    const pointOfInterests = [
        { name: "ngã tư sở", areas: ["đống đa", "thanh xuân"] },
        { name: "ngã tư vọng", areas: ["hai bà trưng", "thanh xuân", "đống đa"] },
        { name: "bách khoa", areas: ["hai bà trưng"] },
        { name: "kinh tế quốc dân", areas: ["hai bà trưng"] },
        { name: "xây dựng", areas: ["hai bà trưng"] },
        { name: "ngoại thương", areas: ["đống đa"] },
        { name: "cầu giấy", areas: ["cầu giấy"] }
    ]; 
    pointOfInterests.forEach(poi => {
        if (msg.includes(poi.name)) {
            poi.areas.forEach(a => { if (!info.locations.includes(a)) info.locations.push(a); });
        }
    });
    const districts = ["ba đình", "cầu giấy", "đống đa", "hai bà trưng", "hoàn kiếm", "thanh xuân", "hoàng mai", "long biên", "hà đông", "tây hồ", "nam từ liêm", "bắc từ liêm"];
    districts.forEach(d => { if (msg.includes(d) && !info.locations.includes(d)) info.locations.push(d); });
    
    const priceMatch = msg.match(/(\d+)\s*(tr|triệu|trieu)/) || msg.match(/(\d{6,})/);
    if (priceMatch) {
        const val = parseInt(priceMatch[1]);
        info.maxPrice = val < 100 ? val * 1000000 : val;
    }
    const areaMatch = msg.match(/(\d+)\s*(m2|mét vuông|met vuong|m²)/);
    if (areaMatch) info.minArea = parseInt(areaMatch[1]);
    return info;
}

/**
 * 3. GỬI TIN NHẮN & GỌI API
 */
async function sendChat() {
    const userId = document.getElementById("chat-user-id")?.value;
    if (!userId || userId === "" || userId === "guest") {
        addMessage("⚠️ Bạn cần <b>đăng nhập</b> để sử dụng trợ lý ảo AI tìm phòng.", false, false);
        return;
    }
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, true);
    input.value = "";
    const intent = detectIntent(text);

    if (intent === "COMPARE") {
        addMessage("🤖 Để mình so sánh phòng cho bạn...");
        try {
            const keyword = text.replace("so sánh", "").replace("so sanh", "").trim();
            const res = await fetch(`${BASE_URL}/api/chatbot/compare?q=${encodeURIComponent(keyword)}`);
            const data = await res.json();
            if (!data.success || data.data.length < 2) {
                addMessage("🤖 Tôi chưa tìm thấy đủ 2 phòng để so sánh.");
                return;
            }
            const r1 = data.data[0]; const r2 = data.data[1];
            let html = `🤖 <b>So sánh nhanh:</b><br><br>🏠 <b>${r1.title}</b><br>💰 ${(r1.price/1000000).toFixed(1)} triệu<br>📐 ${r1.area} m²<br>📍 ${r1.location}<br><br>🏠 <b>${r2.title}</b><br>💰 ${(r2.price/1000000).toFixed(1)} triệu<br>📐 ${r2.area} m²<br>📍 ${r2.location}<br><br>`;
            html += (r1.price < r2.price) ? `👉 ${r1.title} rẻ hơn<br>` : `👉 ${r2.title} rẻ hơn<br>`;
            html += (r1.area > r2.area) ? `👉 ${r1.title} rộng hơn` : `👉 ${r2.title} rộng hơn`;
            addMessage(html);
        } catch (err) { addMessage("⚠️ Lỗi khi so sánh phòng."); }
        return;
    }

    const info = extractInfo(text);
    const params = new URLSearchParams();
    if (info.maxPrice) params.append("maxPrice", info.maxPrice);
    if (info.minArea) params.append("minArea", info.minArea);
    info.locations.forEach(loc => params.append("locations", loc));

    // SỬA: Gộp keyword thông minh để gửi lên Server
    let finalKeywords = [...info.utilities];
    if (info.keyword && !finalKeywords.includes(info.keyword)) finalKeywords.push(info.keyword);
    if (finalKeywords.length > 0) params.append("keyword", finalKeywords.join(" "));

    if (info.excludeKeywords.length > 0) {
        params.append("exclude", info.excludeKeywords.join(" "));
    }

    try {
        const typingId = "typing-" + Date.now();
        addMessage(`<i id="${typingId}" class="bi bi-three-dots"></i> Đang tìm phòng tốt nhất cho bạn...`);
        
        const res = await fetch(`${BASE_URL}/api/chatbot/search?${params.toString()}`, {
            headers: { 'ngrok-skip-browser-warning': 'true', 'Accept': 'application/json' }
        });
        const data = await res.json();
        const typingElem = document.getElementById(typingId)?.parentElement;
        if (typingElem) typingElem.remove();

        if (!data.success || !data.data || data.data.length === 0) {
            addMessage("🤖 Tiếc quá, tôi chưa tìm thấy phòng nào khớp yêu cầu.");
            return;
        }

        // --- SẮP XẾP ƯU TIÊN THEO ĐIỂM BÌNH LUẬN TRƯỚC, SAU ĐÓ ĐẾN GIÁ ---
        const sortedRooms = data.data; 
        let bestMatchRoom = sortedRooms[0];
        
        if (info.maxPrice) {
            // Lấy nhóm các phòng có cùng điểm liên quan cao nhất
            let topScoreRooms = sortedRooms.filter(r => (r.relevanceScore || 0) === (bestMatchRoom.relevanceScore || 0));
            let minDiff = Infinity;
            topScoreRooms.forEach(r => {
                const diff = Math.abs(r.price - info.maxPrice);
                if (diff < minDiff) { 
                    minDiff = diff; 
                    bestMatchRoom = r; 
                }
            });
        }

        // Thông báo đặc biệt nếu tìm thấy theo bình luận
        if (bestMatchRoom.relevanceScore > 0 && info.keyword) {
            addMessage(`⭐ <b>Gợi ý hàng đầu:</b> Phòng <b>${bestMatchRoom.title}</b> được đánh giá rất cao về "<b>${info.keyword}</b>" từ người thuê trước.`);
        }

        let html = `🤖 Tôi tìm được ${sortedRooms.length} phòng phù hợp nhất:<br><div style="margin-top:10px">`;
        sortedRooms.forEach(r => {
            const isBest = (r._id === bestMatchRoom._id) ? "border: 2px solid #ffc107;" : "border: 1px solid #ddd;";
            const commentTag = (r.relevanceScore > 0) ? `<span style="font-size:10px; background:#e8f5e9; color:#2e7d32; padding:2px 5px; border-radius:4px; margin-left:5px; font-weight:bold;">👍 Đánh giá tốt</span>` : "";
            
            html += `
            <div style="background: white; ${isBest} border-radius: 10px; padding: 10px; margin-bottom: 10px; color: #333; clear: both;">
                <div style="font-weight: bold; color: #0d6efd; margin-bottom: 4px;">🏠 ${r.title} ${r._id === bestMatchRoom._id ? "⭐" : ""} ${commentTag}</div>
                <div style="font-size: 0.85em;">
                    💰 <b style="color: #dc3545;">${(r.price/1000000).toFixed(1)} tr</b> | 📐 <b>${r.area}m²</b><br>
                    📍 ${r.location}
                </div>
                <div style="margin-top: 8px; text-align: right;">
                    <a href="/room/${r._id}" style="font-size: 0.85em; background: #0d6efd; color: white; padding: 4px 10px; border-radius: 5px; text-decoration: none; font-weight: bold;">Chi tiết</a>
                </div>
            </div>`;
        });
        html += `</div>`; 
        addMessage(html);

        // Hiển thị gợi ý tiếp theo
        const follow = buildFollowup(data.currentCriteria); // Dùng currentCriteria từ API trả về
        if (follow) addMessage("🤖 " + follow);
        
        const advice = buildAdvice(bestMatchRoom, data.currentCriteria);
        if (advice) addMessage(advice);

    } catch (error) { 
        console.error(error);
        addMessage("⚠️ Kết nối bị gián đoạn. Vui lòng thử lại!"); 
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadChatHistory();
    const input = document.getElementById("chat-input");
    if (input) {
        input.addEventListener("keypress", (e) => { if (e.key === "Enter") sendChat(); });
    }
});