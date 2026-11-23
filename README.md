# CanTho Ship Map

**CanTho Ship Map** là ứng dụng bản đồ tương tác và sổ tay cá nhân phục vụ công việc giao hàng hằng ngày của shipper tại khu vực 9 phường đô thị Cần Thơ.

Ứng dụng hoạt động trực tiếp trên trình duyệt, có thể cài đặt như ứng dụng gốc (Progressive Web App - PWA), hỗ trợ tra cứu ngoại tuyến và lưu trữ dữ liệu hoàn toàn riêng tư trên thiết bị của bạn.

- **Website phát hành (GitHub Pages):** [https://thdo12362.github.io/cantho-ship-map/](https://thdo12362.github.io/cantho-ship-map/)
- **Công nghệ chính:** React 19, Vite, Leaflet, OpenStreetMap, IndexedDB, Service Worker PWA.

---

## 1. Các chức năng chính

1. **Bản đồ tương tác 9 phường Cần Thơ:**
   - Hiển thị 9 phường (Ninh Kiều, Cái Khế, Tân An, An Bình, Bình Thủy, Long Tuyền, Thới An Đông, Cái Răng, Hưng Phú).
   - Chọn phường qua danh sách hoặc chạm trực tiếp polygon trên bản đồ; tự động zoom vừa khu vực; bật/tắt lớp ranh giới.
2. **Tra cứu đường phố thông minh:**
   - Tìm kiếm tên đường có dấu hoặc không dấu (VD: `Võ Văn Kiệt` / `vo van kiet`, `Phạm Ngọc Hưng` / `pham ngoc hung`).
   - Tìm theo từng phường hoặc toàn bộ 9 phường; phân biệt rõ các tuyến trùng tên qua khu vực liên quan.
   - Chọn đường để highlight, xem thông tin và mở nhanh vị trí trên Google Maps.
3. **Định vị GPS & ước tính phường:**
   - Lấy vị trí hiện tại với một chạm, hiển thị độ chính xác.
   - Tự động ước tính phường theo ranh giới tham khảo OSM và cảnh báo rõ khi vị trí nằm sát ranh giới.
4. **Sổ tay địa điểm yêu thích & Ghi chú hẻm (IndexedDB):**
   - Lưu địa điểm từ GPS, điểm ghim hoặc tuyến đường.
   - Ghi chú chi tiết cho từng hẻm, lối vào, lưu ý giờ cao điểm, kèm nhãn phân loại (tags).
   - Dữ liệu lưu cục bộ trên trình duyệt máy bạn, không gửi về bất kỳ máy chủ nào.
5. **Lịch sử tìm kiếm & Sao lưu dữ liệu:**
   - Tự động lưu lịch sử tìm kiếm gần nhất; tùy chọn bật/tắt hoặc xóa nhanh.
   - Xuất/nhập file JSON sao lưu để chuyển dữ liệu an toàn khi đổi điện thoại.

---

## 2. Hướng dẫn sử dụng

- **Tra cứu đường:** Nhập tên đường vào thanh tìm kiếm ở phía trên. Chạm vào kết quả gợi ý để bản đồ tự động di chuyển và làm nổi bật tuyến đường.
- **Xem theo phường:** Bấm vào chip tên phường (VD: *Cái Khế*) để xem ranh giới và danh sách các tuyến đường thuộc khu vực đó.
- **Lưu điểm giao:** Chạm vào bất kỳ điểm nào trên bản đồ hoặc bấm **"Dùng vị trí của tôi"**, sau đó chọn **"Lưu vào sổ tay"** để đặt tên và ghi chú cho địa điểm.
- **Mở sổ tay cá nhân:** Chuyển sang mục **"Sổ tay của tôi"** ở thanh điều hướng để quản lý địa điểm đã lưu, ghi chú và lịch sử.
- **An toàn giao thông:** Luôn tấp xe vào lề đường an toàn trước khi thao tác bản đồ.

---

## 3. Hướng dẫn cài đặt PWA lên điện thoại

### Trên Android (Google Chrome)
1. Mở link [https://thdo12362.github.io/cantho-ship-map/](https://thdo12362.github.io/cantho-ship-map/) bằng Chrome.
2. Nhấn nút **"Cài đặt"** hiển thị trên thanh công cụ ứng dụng (hoặc nhấn menu **⋮** góc trên bên phải của Chrome -> chọn **Cài đặt ứng dụng** / **Thêm vào màn hình chính**).
3. Biểu tượng CanTho Ship Map sẽ xuất hiện trên màn hình chính và hoạt động như ứng dụng độc lập.

### Trên iPhone / iPad (Safari)
1. Mở trang web bằng trình duyệt **Safari**.
2. Nhấn vào nút **Chia sẻ** (biểu tượng ô vuông có mũi tên hướng lên).
3. Cuộn xuống chọn **"Thêm vào MH chính" (Add to Home Screen)**.

---

## 4. Hướng dẫn sao lưu & Khôi phục dữ liệu

- **Sao lưu:** Vào mục **"Sổ tay của tôi"** -> chọn tab **"Sao lưu"** -> bấm **"Tải về tệp sao lưu (.json)"**. Cất giữ file này cẩn thận (trong Google Drive, Zalo hoặc gửi email cho chính mình).
- **Khôi phục:** Tại tab **"Sao lưu"**, chọn tệp `.json` đã lưu trước đó. Ứng dụng sẽ hiển thị bản xem trước số lượng địa điểm, ghi chú; bấm **"Xác nhận nhập dữ liệu"** (chế độ Merge an toàn không ghi đè dữ liệu hiện có).

---

## 5. Lưu ý quan trọng về dữ liệu & Ngoại tuyến

- **Ranh giới hành chính:** Ranh giới 9 phường và mạng lưới đường hiện sử dụng từ nguồn trích xuất cộng đồng OpenStreetMap (`PROVISIONAL_OSM`) theo Nghị quyết 1668/NQ-UBTVQH15; chưa phải là dữ liệu đo đạc địa giới chính thức được phê duyệt pháp lý.
- **Sử dụng ngoại tuyến:** Khi mất kết nối Internet, giao diện ứng dụng, dữ liệu 9 phường, danh sách đường, sổ tay cá nhân và các tính năng tra cứu vẫn hoạt động bình thường nhờ Service Worker và CacheStorage.
- **Bản đồ nền (Tile):** Tuân thủ nghiêm ngặt [chính sách bản đồ nền OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/), ứng dụng **không tải trước hàng loạt tile**. Các mảnh bản đồ nền bạn đã xem lướt qua khi có mạng sẽ được lưu tạm; khi offline hoàn toàn, các đường và polygon vẫn vẽ rõ ràng trên nền bản đồ.
- **Bản quyền & Attribution:**
  - Dữ liệu đường & ranh giới: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors (ODbL 1.0).
  - Bản đồ nền: © OpenStreetMap contributors.

---

## 6. Phát triển & Chạy cục bộ

Yêu cầu Node.js >= 22.12 (khuyến nghị Node 24).

```sh
# Cài đặt gói phụ thuộc
npm ci

# Khởi chạy máy chủ phát triển
npm run dev

# Chạy kiểm thử tự động (34 bài kiểm thử)
npm test

# Build ứng dụng cho môi trường production
npm run build

# Xem trước bản build
npm run preview
```
