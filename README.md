# Zalo Bot - Quản lý thu tiền YouTube Premium tự động

Con bot này được viết ra để giải phóng sức lao động cho các chủ hụi YouTube Premium (hoặc Netflix, Spotify...). Thay vì đến tháng phải đi nhắn tin đòi tiền từng người, check sao kê ngân hàng bằng mắt, thì bot này sẽ lo hết từ A đến Z.

Cơ chế hoạt động: Bot chạy trên Zalo (thông qua Zapps), Database dùng SQLite gọn nhẹ, tích hợp SePay để tự động xác nhận giao dịch ngân hàng.

## Tính năng chính

- Tự động gửi mã QR thanh toán (động) cho từng thành viên khi đến ngày thu tiền.
- Mã QR có chứa nội dung chuyển khoản riêng biệt để định danh người dùng.
- Tự động quét giao dịch ngân hàng qua Webhook.
- Tự động cập nhật trạng thái "Đã đóng tiền" khi nhận được tiền.
- Báo cáo tiến độ thu tiền hàng ngày cho Admin.
- Nhắc nợ tự động mỗi sáng nếu chưa đóng tiền.
- Admin có thể duyệt thành viên, set ngày thu tiền, chỉnh số tiền linh hoạt.
- Member có thể đăng ký, hủy đăng ký tự động.


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


