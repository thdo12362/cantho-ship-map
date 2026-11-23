# Xác minh nguồn ranh giới – Giai đoạn 2B

Ngày kiểm tra: 23/11/2026. Phạm vi: xác minh nguồn và đối chiếu dữ liệu; không thay đổi giao diện, không dựng lại đường, không thay thế polygon OSM, không commit/push.

## Kết luận sử dụng

Chưa có tệp ranh giới 9 phường được cơ quan có thẩm quyền xác nhận, đủ thông tin phiên bản/độ chính xác và quyền phân phối lại. Không có geometry nào được nâng lên `VERIFIED_OFFICIAL`. Giữ nguyên 9 polygon, 7.001 way và 7.535 phân đoạn Giai đoạn 2; báo cáo 2B là các tệp bổ sung.

Tên và mã 9 phường đã đối chiếu trực quan với bảng chính thức trong [Quyết định 19/2025/QĐ-TTg](https://vanban.chinhphu.vn/?pageid=27160&docid=214409), PDF trang 137, số trang in 132. Bảng có hiệu lực từ 01/07/2025; đây là xác minh danh mục của văn bản đó, không chứng minh không có thay đổi nào về sau và không xác nhận hình học OSM. PDF gốc là bản quét, trích xuất text không có nội dung; đã đọc bản render toàn trang thay vì dựa vào OCR hoặc kết quả tìm kiếm.

Ba trạng thái áp dụng theo từng loại bằng chứng:

| Trạng thái | Ý nghĩa trong báo cáo 2B |
| --- | --- |
| `VERIFIED_OFFICIAL` | Tên/mã trong bảng chính thức đã đọc; **không áp dụng cho ranh giới** |
| `PROVISIONAL_OSM` | Chín hình học OSM và bằng chứng phân tích tương đối theo chúng |
| `UNVERIFIED` | Ranh giới pháp lý, quyền sử dụng chưa xác định, các kết quả so sánh Bando và 426 đoạn chưa thể gán chính thức |

Các trường `verification_status` chi tiết của Giai đoạn 2 được giữ nguyên để bảo toàn dữ liệu. Báo cáo 2B thêm `verification_state` theo ba mức trên, tách riêng trạng thái của mã và hình học. `ward_id` trong toàn bộ 426 hồ sơ kiểm tra vẫn là null.

## Các nguồn đã kiểm tra

| Nguồn | Kết quả thực tế | Khả năng dùng hiện tại |
| --- | --- | --- |
| [CSDL địa giới hành chính Việt Nam](https://thongtin.diagioi.gov.vn/) | HTTPS lỗi kiểm tra chứng chỉ, truy vấn trực tiếp ban đầu báo chứng chỉ hết hạn. Tài liệu API vẫn có bản được máy tìm kiếm lập chỉ mục; đã đọc tài liệu SDK và ví dụ WFS qua công cụ web. WFS host cũ ở cổng 8081 không kết nối được. | Chưa lấy được polygon sau sắp xếp hoặc kiểm chứng điều kiện khai thác. Không tắt TLS verification, không đăng nhập, không lấy token. |
| [GIS Portal Cần Thơ](https://gisportal.cantho.gov.vn/) | Hết thời gian kết nối. Nội dung đã lập chỉ mục ghi nền tảng ArcGIS và đơn vị quản lý là Văn phòng UBND thành phố, đồng thời còn địa chỉ quận cũ. Địa chỉ bổ sung `gis.cantho.gov.vn` trả trang IIS mặc định. | Chưa xác minh được lớp hành chính hiện hành, FeatureServer/MapServer đang hoạt động, khả năng xuất GeoJSON hoặc giấy phép. Không suy lỗi kết nối thành yêu cầu xác thực. |
| [Bản đồ sau sáp nhập](https://sapnhap.bando.com.vn/) | Trang và các thao tác đọc công khai trả danh mục, metadata, MultiPolygon cho đủ 9 phường; không dùng thông tin xác thực. | Chỉ đối chiếu trong cache riêng; chưa có căn cứ về nghiệm thu ranh giới, độ chính xác, phiên bản và quyền tái phân phối. Không đưa tọa độ Bando vào `public`. |
| [Nguồn chính thức bổ sung của Cần Thơ](https://sokhcn.cantho.gov.vn/default.aspx?nid=29540&pid=57), Nghị quyết 1668 và Quyết định 19 | Kiểm tra bài công bố ngày 08/07/2025, văn bản về sắp xếp và bảng mã chính thức. | Có căn cứ tên, mã, bối cảnh và phạm vi sáp nhập; chưa thu được gói polygon đã phê duyệt. Không tìm được trong đợt kiểm tra này không có nghĩa dữ liệu không tồn tại. |

[Tài liệu WFS](https://thongtin.diagioi.gov.vn/docs/files/code/REST_API/wfs-js.html) mô tả `GetFeature` có thể trả GeoJSON/GML. [Ví dụ WFS](https://thongtin.diagioi.gov.vn/docs/files/code/Examples/wfs-js.html) vẫn dùng lớp cấp huyện cũ, nên không thể suy ra có lớp phường năm 2025. [SDK AdminMap](https://thongtin.diagioi.gov.vn/docs/files/code/JavaScript_API/map-js.html) minh họa trường API key do bên gọi cung cấp; chưa xác minh được cơ chế xác thực thực tế của WFS. Tài liệu và khả năng kỹ thuật không phải giấy phép tái sử dụng dữ liệu.

Các thao tác đọc Bando được quan sát trong chính mã frontend công khai: `p.co_dvhc`, `p.co_dvhc_id`, `pread_json`. Không gọi endpoint chỉnh sửa hoặc dò API không công khai. Đây là cơ chế vận hành trang, chưa phải cam kết dịch vụ tích hợp cho ứng dụng bên ngoài. Dữ liệu cache chỉ để xem xét, không thay thế dữ liệu ứng dụng.

[Báo Điện tử Chính phủ ngày 08/07/2025](https://baochinhphu.vn/tra-cuu-dia-gioi-sau-sap-nhap-qua-ban-do-dien-tu-102250708175104468.htm) giới thiệu bản đồ và việc tiếp tục chỉnh lý địa giới cấp xã. Các tỷ lệ bản đồ toàn quốc được nêu trong bài không xác nhận tỷ lệ hay độ chính xác của vector từng phường. Thông báo phục vụ cộng đồng/không kinh doanh và việc xem miễn phí trên Bando cũng không đủ chứng minh quyền lưu trữ, sửa đổi và phân phối polygon công khai qua GitHub Pages.

## Kiểm tra chín relation OSM

Đọc lại trực tiếp **metadata relation** từ PBF đã lưu, không tải lại hoặc trích xuất lại hình học. Snapshot ngày 22/11/2026, tải ngày 23/11/2026, SHA-256 được giữ trong hồ sơ nguồn cũ. Mỗi relation đều có `admin_level=6`, `boundary=administrative`, tên khớp danh mục; cả 9 đều là MultiPolygon hợp lệ. Các relation không có thẻ mã hành chính. `population:date` không được coi là ngày đo đạc ranh giới.

| Phường | Mã trong QĐ 19 | OSM relation | Diện tích OSM km² | Diện tích hình học Bando km² | IoU hai nguồn |
| --- | --- | --- | ---: | ---: | ---: |
| Ninh Kiều | 31135 | 13512464 | 5,422824 | 5,429249 | 0,992160 |
| Cái Khế | 31120 | 13512379 | 10,773977 | 9,662514 | 0,885699 |
| Tân An | 31147 | 13512595 | 8,065567 | 8,057455 | 0,992466 |
| An Bình | 31150 | 13512619 | 18,324253 | 18,225136 | 0,985264 |
| Bình Thủy | 31168 | 13514267 | 14,385713 | 15,705434 | 0,898839 |
| Long Tuyền | 31183 | 13514288 | 28,611899 | 28,619656 | 0,990546 |
| Thới An Đông | 31174 | 13514289 | 25,582907 | 24,515678 | 0,947614 |
| Cái Răng | 31186 | 10136998 | 26,788893 | 26,835080 | 0,989177 |
| Hưng Phú | 31201 | 10136993 | 41,485919 | 40,868083 | 0,969198 |

Diện tích trên là phép tính phẳng trong EPSG:32648, không phải số liệu diện tích tự nhiên chính thức. IoU là tỷ lệ giao/hợp hình học, không phải điểm chứng nhận. Tên và mô tả toàn bộ/một phần/phần còn lại được đối chiếu Nghị quyết 1668; không dựng ranh từ đơn vị tiền thân. Metadata tóm tắt của Bando không luôn thể hiện rõ chuyển một phần; vì vậy không dùng tóm tắt đó thay nghị quyết.

Ngày cập nhật từng relation, version, mã nguồn, diện tích chênh lệch đối xứng và khoảng cách Hausdorff lấy mẫu có trong `boundary-verification.json`. Các khác biệt lớn cần ưu tiên kiểm tra ở Cái Khế, Bình Thủy và Thới An Đông; khoảng cách Hausdorff lấy mẫu lớn nhất giữa hai bộ ranh đạt khoảng 1.403 m ở Bình Thủy. Đây là sai khác **giữa hai nguồn**, chưa xác định nguồn nào đúng. Không gọi nó là sai số đo đạc OSM đã được kết luận.

## Phân loại 426 đoạn mơ hồ

Phân tích tương đối theo hình học OSM, gồm cả ranh nội bộ và ranh ngoài 9 phường. Dùng sai số tính toán đồng tuyến 0,02 m để nhận dạng đường trùng hình học, không coi đó là độ chính xác thực địa. Phần giao nội vùng được kiểm tra theo toàn đoạn, không gán theo điểm giữa hay tên đường.

| Nhóm | Số đoạn | Cách hiểu |
| --- | ---: | --- |
| Trùng toàn đoạn với ranh tham khảo OSM | 0 | Không có đoạn đáp ứng điều kiện tính toán; không chứng minh ngoài thực địa không có đường đi trên ranh |
| Cắt qua nội vùng nhiều phường tham khảo | 205 | Có phần line đi qua nội vùng của ít nhất hai polygon OSM |
| Lỗi hình học được phát hiện | 0 | Không có hình học rỗng, không hợp lệ hoặc line độ dài bằng 0 trong nhóm đã kiểm tra; sai lệch với ranh pháp lý vẫn chưa biết |
| Chưa đủ bằng chứng để xác định | 221 | Có thể sát ranh, chỉ trùng một phần hoặc thiếu căn cứ để gán chắc chắn |

Cả 426 đoạn đều giữ `UNVERIFIED`; số đoạn được gán phường chính thức mới: **0**. Việc chia nhóm không đổi 426 thành các địa chỉ đã xác nhận.

## Mức nhạy khi so sánh với Bando

So sánh toàn bộ 7.535 đoạn với polygon Bando, cùng yêu cầu nằm hoàn toàn trong polygon và cách ranh ít nhất 5 m:

- 6.812 đoạn có cùng một phường ứng viên nội vùng giữa hai nguồn.
- 6 đoạn đổi phường ứng viên: ba đoạn giữa Cái Răng/Hưng Phú và ba đoạn giữa Thới An Đông/Bình Thủy.
- 60 đoạn mơ hồ theo OSM lại nằm nội vùng một polygon Bando.
- 657 đoạn rơi vào nhóm sát/cắt ranh, ngoài vùng hoặc không có ứng viên nội vùng duy nhất theo Bando.

Không đổi 60 hoặc 6 trường hợp trên thành gán phường chính thức. Danh sách segment ID, ứng viên của hai nguồn và trạng thái có trong báo cáo để kiểm tra tiếp; không công bố hình học Bando. Chưa có nguồn chính thức đáng tin cậy để kết luận đoạn nào sai lệch so với ranh pháp lý.

## Công cụ, kiểm thử và bảo toàn

Chỉ bổ sung các công cụ nghiên cứu và kiểm thử 2B, không viết lại công cụ GIS đã đạt. SHA-256 của toàn bộ `src` và các tệp dữ liệu Giai đoạn 2 cũ được lưu trước khi nghiên cứu, rồi kiểm tra giữ nguyên từng byte. Báo cáo 2B không sửa báo cáo độ bao phủ cũ hoặc thay trạng thái cũ để làm đạt tiêu chí.

Tái chạy từ cache hiện có, không tải lại PBF:

```powershell
.\.venv-data\Scripts\python.exe scripts/gis/probe_boundary_sources.py
.\.venv-data\Scripts\python.exe scripts/gis/fetch_bando_review.py
.\.venv-data\Scripts\python.exe scripts/gis/audit_boundaries.py
.\.venv-data\Scripts\python.exe -m unittest discover -s scripts/gis -p test_boundary_audit.py -v
```

Một máy mới cần PBF gốc và bộ evidence review cache; công cụ chủ động dừng nếu thiếu hoặc không khớp nguồn, không tự tạo bằng chứng thay thế. Bảng mã chính thức đã được đọc trực quan và ghi lại trong cấu hình kiểm chứng, kèm hash PDF và vị trí trang. Đọc PDF dùng môi trường Python đã có pypdf/PyMuPDF; không thêm các thư viện PDF vào ứng dụng React.

Các kiểm thử 2B bao gồm phân biệt đường trên ranh, ranh ngoài, đường cắt nhiều polygon, đường chỉ ở gần ranh, trùng ranh một phần, hình học lỗi; kiểm đủ ID của 426 đoạn, bảo toàn dữ liệu gốc, chống nâng trạng thái tùy tiện và chống xuất hình học Bando vào báo cáo công khai.

## Trước Giai đoạn 3

Chưa nên chuyển sang Giai đoạn 3 với chức năng xác định/gán phường như kết quả hành chính chính thức. Cần một trong các nguồn sau được cơ quan quản lý xác nhận: tệp GIS đã phê duyệt hoặc API/lớp WFS/ArcGIS hiện hành có quyền truy cập hợp lệ, kèm ngày phiên bản, CRS, độ chính xác và điều kiện lưu trữ/tái phân phối. Phải khắc phục TLS/kết nối của nguồn trước khi tích hợp; không yêu cầu gửi khóa hoặc token vào mã nguồn công khai. Chưa gửi yêu cầu cấp dữ liệu cho bất kỳ cơ quan nào thay người dùng.
