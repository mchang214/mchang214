// Cấu hình URL ngrok cố định của bạn
const BASE_URL = "https://segmental-carolyne-brambly.ngrok-free.dev";

function addMessage(text, isUser = false) {
    const box = document.getElementById("chatbot-messages");
    if (!box) return;
    
    const div = document.createElement("div");
    div.style.padding = "10px";
    div.style.borderRadius = "15px";
    div.style.marginBottom = "10px";
    div.style.maxWidth = "85%";
    div.style.wordWrap = "break-word";
    
    if (isUser) {
        div.style.backgroundColor = "#0d6efd";
        div.style.color = "white";
        div.style.alignSelf = "flex-end";
        div.style.marginLeft = "auto";
    } else {
        div.style.backgroundColor = "#e9ecef";
        div.style.color = "black";
        div.style.alignSelf = "flex-start";
    }
    
    div.innerHTML = text;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function extractInfo(message) {
    message = message.toLowerCase();
    let maxPrice = null;
    let location = "";
    let keyword = "";
    let minArea = null;
    let direction = "";

    // Tìm giá (ví dụ: 5 triệu, 5tr)
    const priceMatch = message.match(/(\d+)\s*(tr|triệu)/);
    if (priceMatch) {
        maxPrice = parseInt(priceMatch[1]) * 1000000;
    }

    // Tìm diện tích (ví dụ: 30m2)
    const areaMatch = message.match(/(\d+)\s*(m2|m)/);
    if (areaMatch) {
        minArea = parseInt(areaMatch[1]);
    }

    // Tìm hướng
    const directions = ["đông", "tây", "nam", "bắc", "đông nam", "đông bắc", "tây nam", "tây bắc"];
    directions.forEach(d => {
        if (message.includes(d)) direction = d;
    });

    // Tìm quận
    const districts = ["ba đình", "cầu giấy", "đống đa", "hai bà trưng", "hoàn kiếm", "thanh xuân", "hoàng mai", "long biên", "hà đông", "tây hồ", "nam từ liêm", "bắc từ liêm"];
    districts.forEach(d => {
        if (message.includes(d)) location = d;
    });

    // Tìm từ khóa
    const keywords = ["ban công", "điều hòa", "nóng lạnh", "full đồ", "studio", "1n1k"];
    keywords.forEach(k => {
        if (message.includes(k)) keyword = k;
    });

    // Trả về object với tên field khớp với tham số tìm kiếm trên Server của bạn
    return { maxPrice, location, keyword, minArea, direction };
}

async function sendChat() {
    const input = document.getElementById("chat-input");
    const text = input.value.trim();
    if (!text) return;

    addMessage(text, true);
    input.value = "";

    const info = extractInfo(text);
    // Loại bỏ các trường null để query sạch hơn
    Object.keys(info).forEach(key => info[key] === null && delete info[key]);
    const query = new URLSearchParams(info).toString();

    try {
        const res = await fetch(`${BASE_URL}/api/chatbot/search?${query}`, {
            headers: { 'ngrok-skip-browser-warning': 'true' }
        });
        const data = await res.json();

        if (!data.success || !data.data || data.data.length === 0) {
            addMessage("🤖😢 Xin lỗi, tôi không tìm thấy phòng nào khớp với yêu cầu của bạn.");
            return;
        }

        let html = "🤖 Đây là các phòng tôi tìm được cho bạn:<br><hr style='margin: 5px 0'>";
        data.data.forEach(r => {
            html += `
            <div style="font-size: 0.9em; margin-bottom: 10px; border-bottom: 1px dashed #ccc; padding-bottom: 5px;">
                🏠 <b>${r.title || r.code}</b><br>
                💰 Giá: <span style="color: red; font-weight: bold;">${Number(r.price).toLocaleString('vi-VN')} đ</span><br>
                📍 ${r.location}<br>
                👉 <a href="/room/${r._id}" style="color: #0d6efd; text-decoration: none; font-weight: bold;">[Xem Chi Tiết]</a>
            </div>
            `;
        });

        addMessage(html);
    } catch (error) {
        console.error("Lỗi:", error);
        addMessage("⚠️ Rất tiếc, hệ thống đang bận hoặc Ngrok của bạn đã hết hạn.");
    }
}

// LẮNG NGHE SỰ KIỆN ENTER ĐỂ GỬI
document.addEventListener("DOMContentLoaded", () => {
    const input = document.getElementById("chat-input");
    if(input) {
        input.addEventListener("keypress", (e) => {
            if (e.key === "Enter") {
                sendChat();
            }
        });
    }
});