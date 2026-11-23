# Dữ liệu Giai đoạn 2

## Trạng thái và giới hạn

Xem `public/data/coverage-report.json` để biết số liệu thực tế và `stage_2_complete`. Một lần kiểm tra kỹ thuật thành công **không** chứng minh đã hoàn thành Giai đoạn 2.

Tên 9 phường và phạm vi đơn vị tiền thân được đối chiếu Điều 1 khoản 1–9 của [Nghị quyết 1668 qua TTXVN](https://nvsk.vnanet.vn/toan-van-nghi-quyet-so-1668-nq-ubtvqh15-sap-xep-cac-don-vi-hanh-chinh-cap-xa-cua-thanh-pho-can-tho-nam-2025-1-172059.vna); [bản ký trên Công báo Chính phủ](https://congbaocdn.chinhphu.vn/CongBaoCP/VanBan/2025/6/45123/56845-1-2025803-8041668-nq-ubtvqh15.pdf). Không dùng tên quận cũ làm đơn vị hiện tại, không dựng polygon từ danh sách phường cũ. `ward_id` là ID nội bộ ổn định, không phải mã hành chính nhà nước.

Chưa lấy được bộ polygon chính thức kèm thông tin niên đại, độ chính xác và quyền phân phối lại. Tuy nhiên, PBF OSM chứa đủ 9 relation ứng viên: tên trùng danh mục hiện hành, `admin_level=6`, `population:date=2025-07-01`. `wards.geojson` dùng nguyên hình học của 9 relation này, ghi ID nguồn cụ thể và `verification_status: osm_boundary_unverified`. Các polygon hợp lệ về hình học, không phải ranh giới chính thức đã xác minh. Không dựng polygon từ tên đơn vị cũ hoặc tọa độ ước lượng.

Đường được lấy từ OSM qua bản PBF Geofabrik có ngày cố định, chọn các way giao với **hợp của 9 polygon tham khảo OSM**. Tệp đường giữ nguyên toàn bộ hình học gốc nên có thể kéo dài ra ngoài hợp polygon. Chưa thể khẳng định phạm vi hành chính chính thức hoặc đầy đủ mọi đường/hẻm. Phân đoạn dựa trên polygon tham khảo có `candidate_ward_id`; `ward_id` chính thức vẫn để null.

## Nguồn đã kiểm tra

- VNSDI: trang chính truy cập được; dịch vụ `BanDoHanhChinhVietNam/MapServer?f=pjson` trả lỗi ArcGIS `499 Token Required`. Chưa kiểm chứng được niên đại lớp hoặc giấy phép; không vượt xác thực.
- GIS Portal Cần Thơ: hết thời gian kết nối, chưa thu được dữ liệu.
- tinhthanhpho.com: cung cấp GeoJSON Cần Thơ và tuyên bố CC BY 4.0; metadata dẫn hình học về thanglequoc/vietnamese-provinces-database và sapnhap.bando.com.vn. README chuyên biệt của dữ liệu GIS tại upstream yêu cầu tham khảo điều khoản Bando.com.vn. Không coi giấy phép MIT của mã nguồn là quyền phân phối lại hình học. Dữ liệu tham khảo chỉ giữ trong cache bị Git bỏ qua; không đưa polygon này vào `public`.
- Overpass: các yêu cầu nghiên cứu gặp HTTP 406/502 hoặc timeout; không sử dụng phản hồi thiếu dữ liệu.
- Geofabrik: bản trích xuất OSM công khai, không chứa UID/tên người đóng góp/changeset. Ghi URL ngày cố định, thời điểm tải, SHA-256 và đối chiếu checksum MD5 của nhà cung cấp. Đường OSM có giấy phép ODbL 1.0, chưa kiểm chứng thực địa.

Chi tiết URL, trạng thái, thời điểm và hash nằm trong `data-sources.json`. Chưa có giấy phép xác nhận để công bố polygon chính thức; đây là phần chặn cần giải quyết.

## Chạy công cụ

Công cụ GIS dùng Python tách biệt, không thêm thư viện vào bundle React. Python 3.13–3.15 phù hợp với các bản wheel đã ghim. Ví dụ PowerShell:

```powershell
python -m venv .venv-data
.\.venv-data\Scripts\python.exe -m pip install -r scripts/gis/requirements.txt
.\.venv-data\Scripts\python.exe scripts/gis/research_fetch.py
.\.venv-data\Scripts\python.exe scripts/gis/research_fetch.py --pbf
.\.venv-data\Scripts\python.exe scripts/gis/extract_osm.py --boundaries
.\.venv-data\Scripts\python.exe scripts/gis/extract_osm.py
.\.venv-data\Scripts\python.exe scripts/gis/build_data.py
npm run data:check
npm run data:ready
.\.venv-data\Scripts\python.exe -m unittest discover -s scripts/gis -p test_*.py
npm test
npm run build
```

Linux/macOS: thay đường dẫn interpreter bằng `.venv-data/bin/python`. `data:check` kiểm tra chất lượng và ghi báo cáo, thoát khác 0 nếu dữ liệu bị hỏng. `data:ready` còn yêu cầu đầy đủ địa giới và gán phường; dự kiến **thoát 1** khi những phần này còn thiếu. Không xóa `--require-complete` để đổi trạng thái thành hoàn thành.

Tải PBF Việt Nam khoảng 318 MiB, chỉ lần đầu; cache theo URL cố định để tránh tải lại. Có thể bỏ qua tải quốc gia khi đã có cache. Không gửi các truy vấn OSM tự động lúc người dùng mở ứng dụng. Cache và môi trường Python không được build Vite công bố.

Lệnh `--boundaries` cần chạy trước khi trích xuất đường. Danh sách ID relation được chọn có trong `scripts/gis/scope.json`. Khi thay snapshot, phải kiểm tra lại các relation và các thẻ định danh, không tự chọn polygon chỉ từ tên:

```powershell
.\.venv-data\Scripts\python.exe scripts/gis/extract_osm.py --boundaries
```

Kết quả khảo sát ở cache. Build chỉ lấy các ID relation đã liệt kê và kiểm tra lại tên, cấp hành chính, mốc dân số. Cùng tên không chứng minh cùng đơn vị sau sắp xếp, đặc biệt Tân An cũ và Tân An mới. Các bước kiểm tra thẻ này không thay thế kiểm chứng ranh giới chính thức.

## Quy ước dữ liệu

- GeoJSON EPSG:4326, thứ tự `[longitude, latitude]`; không có custom `crs`. OSM gốc là WGS84. Kiểm tra phạm vi số tọa độ không thay thế kiểm chứng CRS nguồn.
- `road_id = osm-way-<id>`: một way giữ một ID. Hai way trùng tên không bị gộp. Không coi một way là toàn bộ một đường phố hay một hẻm ngoài thực địa.
- `name` giữ tiếng Việt có dấu, NFC và rút gọn khoảng trắng; không tự đổi chữ hoa/thường của tên gốc. `normalized_name` dùng chữ thường không dấu để tìm kiếm. `osm_tags` giữ các giá trị gốc cần thiết, kể cả `name:vi`, `alt_name`, `ref`, hạn chế đi lại, bề mặt và tốc độ.
- `service=alley` hoặc tên nguồn bắt đầu bằng Hẻm/Ngõ/Ngách/Kiệt là căn cứ nhận diện hẻm; không suy hẻm từ mọi `service`. `named_alley` và `unnamed_alley` phân biệt rõ. Chỉ số hẻm/số nhà/địa chỉ để null; không trích suy từ hình học hoặc tự gán số.
- Có đường không tên, đường nhánh, track và service; không lọc chỉ đường có tên. Quyền `private/no` vẫn giữ nguyên; dữ liệu không cam kết có thể đi xe vào mọi tuyến. Footway/path/cycleway/pedestrian chỉ được đưa vào tập đường xe khi có thẻ cho phép phương tiện rõ ràng. Các loại bị loại theo phạm vi lưu ID và lý do trong bảng audit; không âm thầm mất way khi chuyển định dạng.
- `road-segments.geojson` đã cắt theo polygon tham khảo và dải an toàn quanh ranh: `segmentation_status:split_by_osm_reference_boundaries`. `ward_id:null` cho toàn bộ đoạn; `candidate_ward_id` chỉ là kết quả nằm trong nội vùng polygon OSM. Đoạn sát ranh/chồng lấn có danh sách ứng viên và trạng thái mơ hồ; phần ngoài vùng tham khảo giữ lại riêng, không bị mất. Không diễn giải các ứng viên là xác nhận phường chính thức.
- Chỉ mục giữ từng road ID, tên/alias/ref có nguồn, tên không dấu, từ khóa, ID đoạn và `candidate_ward_ids`. `ward_ids:[]` nghĩa chưa xác định chính thức, không phải xác nhận đường nằm ngoài cả 9 phường.
- Các trường trạng thái được giữ ở cấp collection và từng feature. Giai đoạn 3 phải kiểm tra trạng thái trước khi dùng tính năng lọc phường hoặc point-in-polygon; bỏ qua null geometry khi hiển thị Leaflet.

## Khi có ranh giới đủ tin cậy

Trước tiên kiểm chứng nguồn có thẩm quyền, phiên bản sau sắp xếp, EPSG, quyền phân phối, mã định danh, topology, lỗ polygon, các phần đảo, chồng lấn và độ chính xác thực tế. Không bật trạng thái `official_verified` chỉ vì một tệp có định dạng hợp lệ hoặc tên trùng.

`geometry.py` có bộ chia đường theo polygon, tách phép tính hình học khỏi mức tin cậy nguồn. Hàm xử lý Polygon/MultiPolygon, LineString/MultiLineString và GeometryCollection chứa line; giữ line qua nhiều phường, kiểm tra bảo toàn hình học trong sai số số học 1 mm. Tính khoảng cách trong EPSG:32648 rồi xuất lại EPSG:4326. Dải an toàn tối thiểu 5 m quanh ranh là **chính sách xử lý bảo thủ**, không phải độ chính xác đo đạc của dữ liệu; buffer có bù sai số xấp xỉ cung tròn. Đoạn trên/gần ranh, chồng lấn và phần ngoài vùng xác minh để null cùng lý do. Cần điều chỉnh chính sách theo độ chính xác thực của bộ ranh giới được chấp nhận.

Đã chạy phân đoạn tham khảo trên đường OSM thực tế, chưa chạy gán phường chính thức. Các trường candidate không được tự động sao chép sang `ward_id`. Fixture hình học tổng hợp chỉ nằm trong test và không được xuất thành dữ liệu thật. Không triển khai UI Giai đoạn 3.
