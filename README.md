# Nibot Đồng Bộ

Ứng dụng desktop (Electron + Playwright) tự đồng bộ trên Nibot cho các doanh nghiệp được chọn:
hóa đơn VÀO/RA trọn quý hoặc trọn tháng → hàng hóa → ĐTPN đầu vào → ĐTPN đầu ra.

## ⬇️ Tải về

**[Tải bản mới nhất](https://github.com/nhynhinhinh18706-gif/nibot-dong-bo/releases/latest)** — mở link, kéo xuống mục *Assets* và chọn:

| Máy | File |
|---|---|
| Windows (khuyên dùng, **tự cập nhật**) | `Nibot-Dong-Bo-Setup-<phiên bản>.exe` |
| Windows (không cần cài) | `Nibot-Dong-Bo-Portable-<phiên bản>.exe` |
| Mac chip M1/M2/M3/M4 | `Nibot-Dong-Bo-<phiên bản>-arm64.dmg` |
| Mac chip Intel | `Nibot-Dong-Bo-<phiên bản>-x64.dmg` |

Yêu cầu: Windows 10/11 64-bit hoặc macOS 10.15+, **đã cài Google Chrome** (hoặc Edge).
App chưa ký số: Windows bấm *More info → Run anyway*; Mac chuột phải vào app → *Open*.

## Lịch sử phiên bản

- **1.2.2** — Sửa lỗi đồng bộ hóa đơn khi Nibot chuyển tài khoản sang máy chủ giao diện mới (nibot3/nibot7/nangdong.online): ô "Khoảng thời gian" đổi kiểu nên bản cũ treo rồi báo lỗi. Luôn lấy cả HĐ thông thường và HĐ máy tính tiền (MTT). Đã chạy thật Tháng 10/2026: 4/4 việc hoàn tất.
- **1.2.1** — Sửa build Windows trên GitHub Actions; bản đầu tiên có đủ .exe + .dmg trên Releases.
- **1.2.0** — Tự cập nhật qua GitHub Releases; nút *Kiểm tra máy* và *Xuất nhật ký lỗi*; tự tìm Chrome/Edge; chờ lâu hơn cho máy chậm.
- **1.1.0** — Chọn kỳ theo tháng (Tháng 1–12) ngoài theo quý.
- **1.0.0** — Bản đầu: chọn doanh nghiệp + quý, đồng bộ hóa đơn, hàng hóa, ĐTPN vào/ra, báo cáo từng lần chạy.

## Chạy từ mã nguồn

```bash
npm install
npm start
```

Cần Google Chrome (hoặc Edge) đã cài trên máy.

## Dùng

1. **⚙ Cài đặt**: nhập GUID/Master User, Username, Mật khẩu (mã hóa bằng kho bảo mật của hệ điều hành).
2. **Doanh nghiệp**: bấm “Tải lại”. App mở Chrome, đăng nhập rồi lấy danh sách. Tick các công ty cần chạy, hoặc “Chọn tất cả”.
3. **Kỳ hóa đơn**: chọn **Theo quý** (Quý 1–4) hoặc **Theo tháng** (Tháng 1–12), và năm. Mặc định là quý hiện tại theo giờ Việt Nam.
4. **Bắt đầu đồng bộ**. Có thể bấm Dừng, app sẽ dừng sau bước đang chạy.

Kỳ hàng hóa/ĐTPN: 01/01 của năm đã chọn → hôm nay (31/12 nếu là năm cũ).
Tiến độ (JSON) và báo cáo (Markdown) nằm trong thư mục dữ liệu app, mở bằng nút “Mở thư mục báo cáo”.

## Khi app lỗi trên máy khác

- **🩺 Kiểm tra máy**: kiểm tra Chrome/Edge, kết nối tới Nibot, cài đặt và thử mở trang đăng nhập.
- **📄 Xuất nhật ký lỗi**: lưu file `Nibot-nhat-ky-loi-<ngày>.txt` vào thư mục Tải về (gồm kết quả kiểm tra + nhật ký, không chứa mật khẩu). Gửi file này cho người hỗ trợ.
- Nhật ký đầy đủ: `%APPDATA%\Nibot Đồng Bộ\logs\app.log` (Windows), `~/Library/Application Support/Nibot Đồng Bộ/logs/app.log` (macOS).
- Mật khẩu được mã hóa theo từng máy, nên khi đổi máy cần nhập lại trong Cài đặt.
- Nếu app không tìm thấy Chrome, nhập đường dẫn `chrome.exe` trong Cài đặt → Trình duyệt.
- Cần Windows 10/11 64-bit hoặc macOS 10.15 trở lên.

## Tự cập nhật

App tự kiểm tra bản mới trên GitHub Releases khi mở và sau mỗi 4 giờ (hoặc bấm **⟳ Cập nhật**).
- **Windows bản cài (Setup)**: tự tải về, hiện nút **Khởi động lại để cập nhật**.
- **Windows Portable và macOS**: báo có bản mới và mở trang tải về (bản chưa ký số không tự cài được).

Phát hành bản mới:
1. Tăng `version` trong `package.json` (ví dụ `1.2.0` → `1.3.0`), commit, push.
2. Đẩy tag cùng số:

```bash
git tag v1.3.0
```

```bash
git push origin v1.3.0
```

GitHub Actions (`.github/workflows/build.yml`) tự build `.exe` + `.dmg` và đăng lên Releases.

## Đóng gói

```bash
npm run dist:win
```

Lệnh này tạo `dist/Nibot-Dong-Bo-Setup-<version>.exe` (bộ cài) và `dist/Nibot-Dong-Bo-Portable-<version>.exe` (chạy luôn, không cần cài).

Bản `.dmg` chỉ build được trên macOS. Cách 1: chạy `npm run dist:mac` trên máy Mac. Cách 2: đẩy project lên GitHub, vào tab Actions → **Build app** → Run workflow, rồi tải `.dmg` (Intel + Apple Silicon) và `.exe` ở mục Artifacts.

App chưa ký số nên lần đầu mở sẽ có cảnh báo:
- Windows (SmartScreen): bấm **More info** → **Run anyway**.
- macOS: chuột phải vào app → **Open** → **Open**, hoặc vào System Settings → Privacy & Security → **Open Anyway**.

Máy nhận cần cài sẵn Google Chrome (hoặc Edge).

## Kiểm thử

```bash
npm test
```

```bash
node test/smoke-browser.js
```

`npm test` chạy unit test tính kỳ. `smoke-browser.js` kiểm tra Playwright mở được Chrome và nhận diện form đăng nhập.
