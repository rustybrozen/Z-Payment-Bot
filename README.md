# Zalo Bot - Quản lý thu tiền YouTube Premium tự động

Con bot này được viết ra để giải phóng sức lao động cho các chủ hụi YouTube Premium (hoặc Netflix, Spotify...). Thay vì đến tháng phải đi nhắn tin đòi tiền từng người, check sao kê ngân hàng bằng mắt, thì bot này sẽ lo hết từ A đến Z.

Cơ chế hoạt động: Bot chạy trên Zalo (thông qua Zapps), Database dùng SQLite gọn nhẹ, tích hợp SePay để tự động xác nhận giao dịch ngân hàng.

## Tính năng chính

- Tự động gửi mã QR thanh toán (động) cho từng thành viên khi đến ngày thu tiền.
- Mã QR có chứa nội dung chuyển khoản riêng biệt để định danh người dùng.
- Tự động quét giao dịch ngân hàng qua Webhook SePay.
- Tự động cập nhật trạng thái "Đã đóng tiền" khi nhận được tiền.
- Báo cáo tiến độ thu tiền hàng ngày cho Admin.
- Nhắc nợ tự động mỗi sáng nếu chưa đóng tiền.
- Admin có thể duyệt thành viên, set ngày thu tiền, chỉnh số tiền linh hoạt.
- Member có thể đăng ký, hủy đăng ký tự động.

## Yêu cầu hệ thống

- Node.js (v18 trở lên khuyến nghị).
- VPS hoặc Máy tính chạy 24/7 (để nhận Webhook).
- Tài khoản Zapps (để lấy Token bot Zalo).
- Tài khoản SePay (để nhận thông báo biến động số dư).

## Cài đặt

1. Clone source code về máy:
   git clone <link-repo-cua-ong>
   cd zalo-bot-premium

2. Cài đặt các thư viện cần thiết:
   npm install

3. Cấu hình biến môi trường:
   Copy file .env.example thành .env và điền thông tin vào (xem chi tiết bên dưới).

4. Chạy bot:
   node bot.js
   (Hoặc dùng PM2/Docker để chạy background)

## Cấu hình (.env)

Tạo file .env ngang hàng với file bot.js và điền các thông số sau:

ZAPPS_TOKEN=token_bot_zalo_lay_tu_zapps
BASE_API=https://bot-api.zapps.me
ADMIN_ID=id_zalo_cua_admin
SEPAY_API_TOKEN=chuoi_ngau_nhien_tu_tao_de_bao_mat_webhook

# Thông tin ngân hàng để tạo QR
BANK_ID=MB
ACCOUNT_NO=So_Tai_Khoan
ACCOUNT_NAME=Ten_Chu_Tai_Khoan
DEFAULT_AMOUNT=30000

PORT=3000

## Danh sách lệnh (Command)

### Dành cho Admin (Chủ hụi)

- /xacnhan <ID>: Duyệt thành viên mới vào nhóm.
- /tinhtrang: Xem báo cáo chi tiết ai đóng rồi, ai chưa.
- /dathanhtoan <ID>: Set trạng thái đã đóng tiền thủ công (dùng khi ai đó đưa tiền mặt).
- /nhantin <ID> <Nội dung>: Gửi tin nhắn riêng từ bot đến thành viên đó.
- /skipthangnay: Đánh dấu tất cả mọi người đã đóng tiền (miễn phí tháng này).
- /settien <Số tiền>: Cập nhật số tiền thu hàng tháng.
- /chonngay <1-24>: Chọn ngày bot bắt đầu đi đòi nợ tự động.
- /thongbaodongtien: Kích hoạt quy trình đòi nợ ngay lập tức (không cần chờ đến ngày).
- /thongbao <Nội dung>: Gửi tin nhắn thông báo cho toàn bộ thành viên.
- /config: Xem lại toàn bộ cấu hình hiện tại.

### Dành cho Member

- /dangky <Tên>: Gửi yêu cầu tham gia nhóm.
- /huy: Hủy đăng ký và xóa thông tin khỏi hệ thống.
- /id: Xem ID Zalo của bản thân.
- /help: Xem danh sách lệnh.

## Cấu trúc Database (SQLite)

Dữ liệu được lưu trong thư mục /data/database.sqlite.
- Bảng users: Lưu thông tin thành viên (ID, Tên, Trạng thái).
- Bảng payments: Lưu lịch sử đóng tiền theo tháng (Tháng, Status, Mã giao dịch).
- Bảng config: Lưu các cài đặt hệ thống (Ngày thu, Số tiền...).

## Triển khai (Deploy) với Docker & Coolify

Dự án đã có sẵn Dockerfile. Nếu dùng Coolify:
1. Tạo Application mới, chọn Source là repo này.
2. Cấu hình biến môi trường (.env) trong Coolify.
3. Phần Storage, map volume: /app/data (để không mất dữ liệu khi update code).
4. Cấu hình Port Exposes: 8495 (hoặc port tùy chọn).
5. Deploy và setup Webhook trên Zapps/SePay theo domain mới.

## Lưu ý

- Webhook của Zalo yêu cầu HTTPS. Hãy đảm bảo domain của bạn có SSL (Coolify hỗ trợ sẵn).
- Bảo mật: Không được lộ SEPAY_API_TOKEN ra ngoài, nếu không người khác có thể giả mạo lệnh đóng tiền.
