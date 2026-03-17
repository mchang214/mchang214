const BASE_URL = window.location.origin;

/**
 * 1. QUẢN LÝ LỊCH SỬ CHAT (Giữ nguyên)
 */
const getChatStorageKey = () => {
    const userId = document.getElementById("chat-user-id")?.value || 'guest';
    return `chat_history_${userId}`;
};

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

/**
 * 2. HÀM TRÍCH XUẤT THÔNG TIN (Đã sửa lỗi địa danh & thêm diện tích)
 */
function extractInfo(message) {
    const msg = message.toLowerCase();
    let info = {
        maxPrice: null,
        minArea: null,
        locations: [],
        keyword: "", 
        excludeKeyword: ""
    };

    // --- A. Từ điển Địa danh -> Quận (Đã đồng bộ thuộc tính .areas) ---
    const pointOfInterests = [
        { name: "ngã tư sở", areas: ["đống đa", "thanh xuân"] },
        { name: "ngã tư vọng", areas: ["hai bà trưng", "thanh xuân", "đống đa"] },
        { name: "cầu giấy", areas: ["cầu giấy"] },
        { name: "mỹ đình", areas: ["nam từ liêm", "bắc từ liêm"] },
        { name: "hồ tây", areas: ["tây hồ"] },
        { name: "bách khoa", areas: ["hai bà trưng"] },
        { name: "kinh tế quốc dân", areas: ["hai bà trưng"] },
        { name: "xây dựng", areas: ["hai bà trưng"] },
        { name: "ngoại thương", areas: ["đống đa"] },
        { name: "ngoại giao", areas: ["đống đa"] },
        { name: "giao thông vận tải", areas: ["đống đa", "cầu giấy"] },
        { name: "học viện ngân hàng", areas: ["đống đa"] },
        { name: "thủy lợi", areas: ["đống đa"] },
        { name: "công đoàn", areas: ["đống đa"] },
        { name: "y hà nội", areas: ["đống đa"] },
        { name: "học viện báo chí", areas: ["cầu giấy"] },
        { name: "sư phạm", areas: ["cầu giấy"] },
        { name: "quốc gia", areas: ["cầu giấy"] },
        { name: "thương mại", areas: ["cầu giấy", "nam từ liêm"] },
        { name: "học viện tài chính", areas: ["bắc từ liêm"] },
        { name: "mỏ địa chất", areas: ["bắc từ liêm"] },
        { name: "công nghiệp", areas: ["bắc từ liêm"] },
        { name: "kiến trúc", areas: ["hà đông"] },
        { name: "bưu chính", areas: ["hà đông"] },
        { name: "học viện an ninh", areas: ["hà đông", "thanh xuân"] },
        { name: "thăng long", areas: ["hoàng mai"] },
        { name: "nông nghiệp", areas: ["long biên", "gia lâm"] },
        { name: "học viện tòa án", areas: ["long biên"] },
        { name: "cao đẳng fpt", areas: ["nam từ liêm"] },
        { name: "cao đẳng du lịch", areas: ["bắc từ liêm"] },
        { name: "cao đẳng y hà nội", areas: ["thanh xuân"] }
    ];

    pointOfInterests.forEach(poi => {
        if (msg.includes(poi.name)) {
            poi.areas.forEach(a => {
                if (!info.locations.includes(a)) info.locations.push(a);
            });
        }
    });

    // --- B. Xử lý tên Quận trực tiếp ---
    const districts = ["ba đình", "cầu giấy", "đống đa", "hai bà trưng", "hoàn kiếm", "thanh xuân", "hoàng mai", "long biên", "hà đông", "tây hồ", "nam từ liêm", "bắc từ liêm"];
    districts.forEach(d => {
        if (msg.includes(d)) {
            if (!info.locations.includes(d)) info.locations.push(d);
        }
    });

    // --- C. Xử lý Giá ---
    const priceMatch = msg.match(/(\d+)\s*(tr|triệu|trieu)/) || msg.match(/(\d{6,})/);
    if (priceMatch) {
        const val = parseInt(priceMatch[1]);
        info.maxPrice = val < 100 ? val * 1000000 : val;
    }

    // --- D. Xử lý Diện tích (m2) ---
    const areaMatch = msg.match(/(\d+)\s*(m2|mét vuông|met vuong|m²)/);
    if (areaMatch) {
        info.minArea = parseInt(areaMatch[1]);
    }

    // --- E. Xử lý Từ khóa đặc điểm ---
    const features = ["gác xép", "ban công", "điều hòa", "nóng lạnh", "thang máy", "full đồ", "studio", "1n1k", "2n1k"];
    const negationWords = ["không", "khong", "ko", "chẳng", "kh", "đừng"];
    
    features.forEach(f => {
        if (msg.includes(f)) {
            const isNegated = negationWords.some(word => msg.includes(word + " " + f));
            if (isNegated) {
                info.excludeKeyword = f;
            } else {
                info.keyword = f;
            }
        }
    });

    return info;
}

/**
 * 3. GỬI TIN NHẮN & GỌI API
 */
async function sendChat() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, true);
    input.value = "";

    const info = extractInfo(text);
    const params = new URLSearchParams();
    
    if (info.maxPrice) params.append("maxPrice", info.maxPrice);
    if (info.minArea) params.append("minArea", info.minArea);
    if (info.keyword) params.append("keyword", info.keyword);
    if (info.excludeKeyword) params.append("excludeKeyword", info.excludeKeyword);
    
    if (info.locations.length > 0) {
        info.locations.forEach(loc => params.append("locations", loc));
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
            addMessage("🤖 Tiếc quá, tôi chưa tìm thấy phòng nào khớp yêu cầu. Bạn thử tìm khu vực khác hoặc giảm bớt tiêu chí xem sao!");
            return;
        }

        let html = `🤖 Tôi tìm được ${data.data.length} phòng sát yêu cầu của bạn:<br><div style="margin-top:10px">`;
        data.data.forEach(r => {
            html += `
            <div style="background: white; border: 1px solid #ddd; border-radius: 10px; padding: 10px; margin-bottom: 10px; color: #333; clear: both;">
                <div style="font-weight: bold; color: #0d6efd; margin-bottom: 4px;">🏠 ${r.title}</div>
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

    } catch (error) {
        addMessage("⚠️ Kết nối bị gián đoạn. Vui lòng thử lại!");
    }
}

document.addEventListener("DOMContentLoaded", () => {
    loadChatHistory();
    const input = document.getElementById("chat-input");
    if (input) {
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") sendChat();
        });
    }
});