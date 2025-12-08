require('dotenv').config();
const fs = require('fs');
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const cron = require('node-cron');

const ADMIN_ID = process.env.ADMIN_ID;
const TOKEN = process.env.ZAPPS_TOKEN;
const BANK_ID = process.env.BANK_ID;
const ACCOUNT_NO = process.env.ACCOUNT_NO;
const ACCOUNT_NAME = process.env.ACCOUNT_NAME;

const bot = new TelegramBot(TOKEN, {
    polling: false,
    baseApiUrl: process.env.BASE_API
});

const app = express();
app.use(bodyParser.json());

let db;

function getCurrentMonthKey() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}-${year}`;
}

function getCleanMonthKey() {
    const d = new Date();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}${year}`;
}

(async () => {
    if (!fs.existsSync('./data')) {
        fs.mkdirSync('./data');
    }

    db = await open({
        filename: './data/database.sqlite', 
        driver: sqlite3.Database
    });

    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            status TEXT DEFAULT 'pending',
            joined_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT
        );
        CREATE TABLE IF NOT EXISTS payments (
            user_id TEXT,
            month_key TEXT,
            status TEXT DEFAULT 'unpaid',
            transaction_code TEXT,
            amount_paid INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, month_key)
        );
    `);

    try {
        await db.run("ALTER TABLE payments ADD COLUMN amount_paid INTEGER DEFAULT 0");
    } catch (e) {}

    const configDay = await db.get("SELECT value FROM config WHERE key = 'payment_day'");
    if (!configDay) {
        await db.run("INSERT INTO config (key, value) VALUES ('payment_day', '1')");
    }

    const configAmount = await db.get("SELECT value FROM config WHERE key = 'amount'");
    if (!configAmount) {
        await db.run("INSERT INTO config (key, value) VALUES ('amount', ?)", [process.env.DEFAULT_AMOUNT || '30000']);
    }

    console.log("Hệ thống đã khởi động thành công.");
})();

const WEBHOOK_PATH = '/webhook/receive'; 

app.post(WEBHOOK_PATH, (req, res) => {
    bot.processUpdate(req.body);
    res.sendStatus(200);
});

async function checkCompletionAndNotify(monthKey) {
    try {
        const totalActive = await db.get("SELECT count(*) as count FROM users WHERE status = 'active'");
        const totalPaid = await db.get("SELECT count(*) as count FROM payments WHERE month_key = ? AND status = 'paid'", [monthKey]);

        if (totalActive.count > 0 && totalPaid.count === totalActive.count) {
            bot.sendMessage(ADMIN_ID, `🎉 TẤT CẢ THÀNH VIÊN ĐÃ ĐÓNG ĐỦ TIỀN THÁNG ${monthKey} RỒI NHÉ! 🚀`);
        }
    } catch (e) {
        console.error(e);
    }
}

app.post('/sw', async (req, res) => {
    try {
        const sepayHeader = req.headers['authorization'];
        const myToken = process.env.SEPAY_API_TOKEN;

        if (!sepayHeader || !myToken || !sepayHeader.includes(myToken)) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        const data = req.body;
        if (data.transferType !== 'in') return res.json({ success: true });

        const content = data.content.toLowerCase();
        const incomingAmount = parseInt(data.transferAmount);

        const pendingPayments = await db.all("SELECT * FROM payments WHERE status = 'unpaid'");
        
        const configAmt = await db.get("SELECT value FROM config WHERE key = 'amount'");
        const requiredAmount = parseInt(configAmt ? configAmt.value : (process.env.DEFAULT_AMOUNT || '30000'));

        for (const payment of pendingPayments) {
            if (payment.transaction_code && content.includes(payment.transaction_code.toLowerCase())) {
                
                const user = await db.get("SELECT name FROM users WHERE id = ?", [payment.user_id]);
                
                const currentPaid = payment.amount_paid || 0;
                const newTotalPaid = currentPaid + incomingAmount;
                const remaining = requiredAmount - newTotalPaid;

                if (newTotalPaid >= requiredAmount) {
                    await db.run("UPDATE payments SET status = 'paid', amount_paid = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND month_key = ?", [newTotalPaid, payment.user_id, payment.month_key]);
                    
                    const successMsg = `XÁC NHẬN THANH TOÁN THÀNH CÔNG ✅\n\nTháng: ${payment.month_key}\nĐã nhận: ${newTotalPaid} VNĐ\n\nCảm ơn bạn đã thanh toán! 😘`;
                    await bot.sendMessage(payment.user_id, successMsg);
                    await bot.sendMessage(ADMIN_ID, `[SEPAY] 💰 User ${user ? user.name : payment.user_id} đã đóng ĐỦ tiền (${newTotalPaid}đ) - Tháng ${payment.month_key}`);
                    
                    await checkCompletionAndNotify(payment.month_key);
                } else {
                    await db.run("UPDATE payments SET amount_paid = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND month_key = ?", [newTotalPaid, payment.user_id, payment.month_key]);

                    const failMsg = `⚠️ THÔNG BÁO CỘNG DỒN:\n\nHệ thống vừa nhận: ${incomingAmount} VNĐ\nTổng đã đóng: ${newTotalPaid} VNĐ\nSố tiền cần đóng: ${requiredAmount} VNĐ\n\n🔴 Còn thiếu: ${remaining} VNĐ\nVui lòng chuyển nốt số còn lại nhé!`;
                    await bot.sendMessage(payment.user_id, failMsg);
                    await bot.sendMessage(ADMIN_ID, `⚠️ [SEPAY] User ${user ? user.name : payment.user_id} đóng thiếu.\nTổng đã đóng: ${newTotalPaid}\nCòn thiếu: ${remaining}`);
                }

                return res.json({ success: true });
            }
        }

        return res.json({ success: true });

    } catch (error) {
        console.error(error);
        return res.json({ success: true });
    }
});

async function initMonthlyPayments() {
    const monthKey = getCurrentMonthKey();
    const users = await db.all("SELECT id FROM users WHERE status = 'active'");
    
    for (const user of users) {
        await db.run(`
            INSERT OR IGNORE INTO payments (user_id, month_key, status, amount_paid) 
            VALUES (?, ?, 'unpaid', 0)
        `, [user.id, monthKey]);
    }
}

async function sendBillToPendingUsers() {
    const monthKey = getCurrentMonthKey();
    const cleanMonthKey = getCleanMonthKey();
    const d = new Date();
    const monthStr = String(d.getMonth() + 1).padStart(2, '0');
    const yearStr = d.getFullYear();
    
    await initMonthlyPayments();

    const configAmt = await db.get("SELECT value FROM config WHERE key = 'amount'");
    const currentAmount = configAmt ? configAmt.value : '30000';

    const unpaidUsers = await db.all(`
        SELECT u.id, u.name, p.amount_paid 
        FROM users u 
        JOIN payments p ON u.id = p.user_id 
        WHERE p.month_key = ? AND p.status = 'unpaid' AND u.status = 'active'
    `, [monthKey]);

    if (unpaidUsers.length === 0) return;

    for (const user of unpaidUsers) {
        if (user.id === ADMIN_ID) continue;

        const shortId = user.id.length > 6 ? user.id.slice(-6) : user.id;
        const transactionCode = `YTPF${cleanMonthKey}${shortId}`;
        const paidSoFar = user.amount_paid || 0;
        const remaining = parseInt(currentAmount) - paidSoFar;
        
        await db.run("UPDATE payments SET transaction_code = ? WHERE user_id = ? AND month_key = ?", [transactionCode, user.id, monthKey]);

        const dynamicQrUrl = `https://img.vietqr.io/image/${BANK_ID}-${ACCOUNT_NO}-compact2.jpg?amount=${remaining}&addInfo=${transactionCode}&accountName=${ACCOUNT_NAME}`;

        try {
            await bot.sendPhoto(user.id, dynamicQrUrl);
            let msg = `🔔 QUÉT MÃ QR TRÊN ĐỂ THANH TOÁN, HOẶC COPY THÔNG TIN DƯỚI ĐÂY 👇\n(Thanh toán premium tháng ${monthStr} / ${yearStr}) - (LƯU Ý: BẮT BUỘC PHẢI CHUYỂN ĐÚNG THÔNG TIN NHƯ Ở DƯỚI)`;
            
            if (paidSoFar > 0) {
                msg += `\n\nℹ️ Bạn đã đóng trước: ${paidSoFar}đ\n🔴 Số tiền còn lại phải đóng: ${remaining}đ`;
            }

            await bot.sendMessage(user.id, msg);
            await bot.sendMessage(user.id, "Ngân hàng: Ngân Hàng Quân Đội MBBank");
            await bot.sendMessage(user.id, "Số tài khoản: 👇");
            await bot.sendMessage(user.id, `${ACCOUNT_NO}`);
            await bot.sendMessage(user.id, "Nội dung: 👇");
            await bot.sendMessage(user.id, `${transactionCode}`);
            await bot.sendMessage(user.id, `Số tiền (Đồng): 👇`);
            await bot.sendMessage(user.id, `${remaining}`);
        } catch (error) {
            console.error(`Lỗi gửi cho ${user.name}: ${error.message}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

async function sendDailyReportToAdmin() {
    const monthKey = getCurrentMonthKey();
    await initMonthlyPayments();

    try {
        const list = await db.all(`
            SELECT u.name, u.id, p.status, p.amount_paid 
            FROM users u 
            LEFT JOIN payments p ON u.id = p.user_id 
            WHERE u.status = 'active' AND p.month_key = ?
        `, [monthKey]);

        let paidCount = 0;
        let details = "";

        list.forEach((row, index) => {
            const isPaid = row.status === 'paid';
            if (isPaid) paidCount++;
            const statusIcon = isPaid ? "✅ ĐÃ ĐÓNG" : `❌ CHƯA ĐÓNG (Đã nộp: ${row.amount_paid || 0}đ)`;
            
            details += `${index + 1}. ${row.name}\n   ID: ${row.id}\n   Tình trạng: ${statusIcon}\n\n`;
        });

        const today = new Date().toLocaleDateString('vi-VN');

        const report = `📅 BÁO CÁO THU PHÍ NGÀY ${today}\n\n📊 Tháng: ${monthKey}\n💰 Tiến độ: ${paidCount}/${list.length} người đã đóng.\n\n📋 CHI TIẾT THÀNH VIÊN:\n\n${details}`;
        
        bot.sendMessage(ADMIN_ID, report);

        if (paidCount === list.length && list.length > 0) {
            bot.sendMessage(ADMIN_ID, "🎉 CHÚC MỪNG! ĐÃ HOÀN THÀNH THU PHÍ THÁNG NÀY.");
        }

    } catch (e) {
        console.error("Lỗi gửi báo cáo:", e);
    }
}

async function broadcastMessage(messageContent) {
    const users = await db.all("SELECT * FROM users WHERE status = 'active'");
    let count = 0;
    for (const user of users) {
        try {
            await bot.sendMessage(user.id, `📢 THÔNG BÁO TỪ ADMIN:\n\n${messageContent}`);
            count++;
        } catch (error) {}
        await new Promise(r => setTimeout(r, 500));
    }
    bot.sendMessage(ADMIN_ID, `✅ Đã gửi thông báo thành công cho ${count} thành viên.`);
}

bot.onText(/\/dangky(.*)/, async (msg, match) => {
    const userId = String(msg.chat.id);
    const inputName = match[1] ? match[1].trim() : "";

    if (!inputName) {
        bot.sendMessage(userId, "⚠️ Lỗi: Bạn chưa nhập tên hiển thị.\nVí dụ: /dangky Tên Của Bạn");
        return;
    }

    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);

        if (user) {
            if (user.status === 'active') {
                bot.sendMessage(userId, `Chào ${user.name}, bạn đã đăng ký rồi! ✅`);
            } else {
                bot.sendMessage(userId, "⏳ Yêu cầu của bạn đang chờ duyệt.");
            }
        } else {
            await db.run('INSERT INTO users (id, name, status) VALUES (?, ?, ?)', [userId, inputName, 'pending']);
            bot.sendMessage(userId, `📝 Đã ghi nhận tên: "${inputName}". Vui lòng chờ Admin xác nhận...`);
            bot.sendMessage(ADMIN_ID, `🆕 [YÊU CẦU MỚI]\nTên: ${inputName}\nID: ${userId}\n\nCopy lệnh dưới để duyệt nhanh:`);
            bot.sendMessage(ADMIN_ID, `/xacnhan ${userId}`);
        }
    } catch (e) {
        bot.sendMessage(userId, "❌ Lỗi hệ thống.");
    }
});

bot.onText(/\/huy(?:\s+(.+))?/, async (msg, match) => {
    const userId = String(msg.chat.id);
    const targetId = match[1] ? match[1].trim() : null;

    if (userId === ADMIN_ID && targetId) {
        try {
            const user = await db.get('SELECT * FROM users WHERE id = ?', [targetId]);
            if (!user) {
                bot.sendMessage(ADMIN_ID, `❌ Không tìm thấy User ID: ${targetId}`);
                return;
            }
            await db.run('DELETE FROM users WHERE id = ?', [targetId]);
            await db.run('DELETE FROM payments WHERE user_id = ?', [targetId]);
            bot.sendMessage(ADMIN_ID, `✅ Đã xóa thành công thành viên: ${user.name} (${targetId})`);
        } catch (e) {
            bot.sendMessage(ADMIN_ID, "❌ Lỗi database.");
        }
        return;
    }

    if (userId === ADMIN_ID && !targetId) {
         bot.sendMessage(ADMIN_ID, "⚠️ Admin dùng lệnh: /huy <ID người dùng> để xóa thành viên.");
         return;
    }

    try {
        const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            bot.sendMessage(userId, "Bạn chưa đăng ký thành viên.");
            return;
        }
        await db.run('DELETE FROM users WHERE id = ?', [userId]);
        await db.run('DELETE FROM payments WHERE user_id = ?', [userId]);
        bot.sendMessage(userId, "🗑️ Bạn đã hủy đăng ký thành công.");
        bot.sendMessage(ADMIN_ID, `⚠️ Cảnh báo: Thành viên ${user.name} vừa hủy đăng ký.`);
    } catch (e) {}
});

bot.onText(/\/xacnhan (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    const targetId = match[1].trim();

    try {
        const result = await db.run("UPDATE users SET status = 'active' WHERE id = ?", [targetId]);
        if (result.changes > 0) {
            bot.sendMessage(ADMIN_ID, `✅ Đã duyệt thành công ID: ${targetId}`);
            bot.sendMessage(targetId, "🎉 Tài khoản đã được duyệt! Chào mừng bạn.");
            await initMonthlyPayments();
        } else {
            bot.sendMessage(ADMIN_ID, "❌ Không tìm thấy ID này.");
        }
    } catch (e) {
        bot.sendMessage(ADMIN_ID, "❌ Lỗi Database.");
    }
});

bot.onText(/\/tinhtrang/, async (msg) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    await sendDailyReportToAdmin();
});

bot.onText(/\/dathanhtoan (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    const targetId = match[1].trim();
    const monthKey = getCurrentMonthKey();

    try {
        const configAmt = await db.get("SELECT value FROM config WHERE key = 'amount'");
        const currentAmount = configAmt ? configAmt.value : '30000';

        await db.run("INSERT OR REPLACE INTO payments (user_id, month_key, status, amount_paid) VALUES (?, ?, 'paid', ?)", [targetId, monthKey, currentAmount]);
        bot.sendMessage(ADMIN_ID, `✅ Đã set thủ công trạng thái ĐÃ ĐÓNG cho ID: ${targetId}`);
        bot.sendMessage(targetId, `✅ Admin xác nhận bạn đã đóng tiền tháng ${monthKey}.`);
        await checkCompletionAndNotify(monthKey);
    } catch (e) {
        bot.sendMessage(ADMIN_ID, "❌ Lỗi database.");
    }
});

bot.onText(/\/skipthangnay/, async (msg) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    const monthKey = getCurrentMonthKey();
    
    try {
        const configAmt = await db.get("SELECT value FROM config WHERE key = 'amount'");
        const currentAmount = configAmt ? configAmt.value : '30000';

        const users = await db.all("SELECT id FROM users WHERE status = 'active'");
        let count = 0;
        for (const user of users) {
            await db.run("INSERT OR REPLACE INTO payments (user_id, month_key, status, amount_paid) VALUES (?, ?, 'paid', ?)", [user.id, monthKey, currentAmount]);
            count++;
        }
        bot.sendMessage(ADMIN_ID, `⏩ Đã SKIP tháng ${monthKey}. Đã set ${count} thành viên thành ĐÃ ĐÓNG.`);
    } catch (e) {
        bot.sendMessage(ADMIN_ID, "❌ Lỗi khi skip tháng.");
    }
});

bot.onText(/\/settien (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    const amount = match[1].trim();
    if (isNaN(amount)) return bot.sendMessage(ADMIN_ID, "❌ Số tiền không hợp lệ.");
    
    await db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('amount', ?)", [amount]);
    bot.sendMessage(ADMIN_ID, `💵 Đã cập nhật số tiền thu hàng tháng thành: ${amount} VNĐ`);
});

bot.onText(/\/config/, async (msg) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    
    const day = await db.get("SELECT value FROM config WHERE key = 'payment_day'");
    const amt = await db.get("SELECT value FROM config WHERE key = 'amount'");
    const users = await db.get("SELECT count(*) as count FROM users WHERE status = 'active'");
    
    const info = `⚙️ CẤU HÌNH HỆ THỐNG:\n
📅 Ngày thu tiền: ${day ? day.value : 'Chưa set'}
💵 Số tiền thu: ${amt ? amt.value : process.env.DEFAULT_AMOUNT} VNĐ
👥 Tổng thành viên: ${users.count}
🏦 Ngân hàng: ${BANK_ID} - ${ACCOUNT_NO}
🔐 Sepay Token: ${process.env.SEPAY_API_TOKEN ? '✅ Đã cài đặt' : '❌ Chưa có'}`;

    bot.sendMessage(ADMIN_ID, info);
});

bot.onText(/\/thongbaodongtien/, async (msg) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    bot.sendMessage(ADMIN_ID, "📢 Đang quét và gửi thông báo đòi nợ...");
    await sendBillToPendingUsers();
});

bot.onText(/\/chonngay (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    const day = parseInt(match[1].trim());

    if (isNaN(day) || day < 1 || day > 24) {
        bot.sendMessage(ADMIN_ID, "❌ Ngày không hợp lệ.");
        return;
    }
    await db.run("INSERT OR REPLACE INTO config (key, value) VALUES ('payment_day', ?)", [String(day)]);
    bot.sendMessage(ADMIN_ID, `📅 Đã cập nhật ngày thu tiền tự động: Ngày ${day} hàng tháng.`);
});

bot.onText(/\/thongbao (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    const content = match[1].trim();
    bot.sendMessage(ADMIN_ID, `📢 Đang gửi thông báo tới tất cả thành viên...`);
    await broadcastMessage(content);
});

bot.onText(/\/nhantin (\S+) (.+)/, async (msg, match) => {
    if (String(msg.chat.id) !== ADMIN_ID) return;
    const targetUserId = match[1].trim();
    const messageContent = match[2].trim();

    try {
        await bot.sendMessage(targetUserId, `📩 ADMIN NHẮN:\n${messageContent}`);
        bot.sendMessage(ADMIN_ID, `✅ Đã gửi tin nhắn cho user ${targetUserId}`);
    } catch (e) {
        bot.sendMessage(ADMIN_ID, `❌ Lỗi: Không thể gửi tin cho ${targetUserId}.`);
    }
});

bot.onText(/\/id/, (msg) => {
    bot.sendMessage(msg.chat.id, `🆔 ID của bạn: ${msg.chat.id}`);
});

bot.onText(/\/help/, (msg) => {
    const userId = String(msg.chat.id);
    if (userId === ADMIN_ID) {
        bot.sendMessage(userId, `🛠️ MENU ADMIN:
/xacnhan <ID> : Duyệt User
/huy <ID> : Xóa thành viên
/tinhtrang : Xem báo cáo chi tiết
/dathanhtoan <ID> : Set đã đóng tay
/nhantin <ID> <ND> : Nhắn riêng
/skipthangnay : Miễn phí tháng này
/settien <số tiền> : Chỉnh tiền
/config : Xem cấu hình
/thongbaodongtien : Đòi nợ thủ công
/chonngay <1-24> : Set ngày tự động
/thongbao <nd> : Gửi tin toàn bộ`);
    } else {
        bot.sendMessage(userId, `👤 MENU USER:
/dangky <Tên> : Đăng ký tham gia
/huy : Hủy đăng ký
/id : Xem ID
/help : Xem trợ giúp`);
    }
});

cron.schedule('0 9 * * *', async () => {
    try {
        const result = await db.get("SELECT value FROM config WHERE key = 'payment_day'");
        const paymentDay = result ? parseInt(result.value) : 1;
        const today = new Date();
        const currentDay = today.getDate();

        if (currentDay >= paymentDay) {
            console.log("Kiểm tra thanh toán định kỳ...");
            await sendBillToPendingUsers();
            await sendDailyReportToAdmin();
        }
    } catch (e) {
        console.error(e);
    }
}, {
    scheduled: true,
    timezone: "Asia/Ho_Chi_Minh"
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server đang chạy tại port ${port}`);
});