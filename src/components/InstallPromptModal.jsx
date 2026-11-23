import Icon from './Icon.jsx'

export default function InstallPromptModal({
  isOpen,
  onClose,
  canInstall,
  onInstall,
  isInstalled,
}) {
  if (!isOpen) return null

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="install-modal-title">
      <div className="modal-card install-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 id="install-modal-title" className="modal-title">
            <Icon name="download" width="20" height="20" /> Cài đặt CanTho Ship Map
          </h2>
          <button type="button" className="icon-close-btn" onClick={onClose} aria-label="Đóng">
            <Icon name="close" width="18" height="18" />
          </button>
        </div>

        <div className="install-modal-body">
          <div className="app-brand-preview">
            <img src="./icons/icon-192.png" alt="CanTho Ship Map" width="64" height="64" className="app-logo-badge" />
            <div>
              <h3 className="app-name">CanTho Ship Map</h3>
              <p className="app-sub">Bản đồ cá nhân & sổ tay giao hàng</p>
              <span className="app-tagline">Mở nhanh · Dùng ngoại tuyến · Không cần đăng nhập</span>
            </div>
          </div>

          {isInstalled ? (
            <div className="installed-notice-box">
              <Icon name="checkCircle" width="20" height="20" />
              <span>Ứng dụng đã được cài đặt trên thiết bị của bạn. Bạn có thể mở trực tiếp từ màn hình chính!</span>
            </div>
          ) : (
            <>
              {canInstall && (
                <button type="button" className="button primary install-now-btn" onClick={onInstall}>
                  <Icon name="download" /> Cài đặt ứng dụng ngay
                </button>
              )}

              <div className="platform-guides">
                <div className="guide-card android-guide">
                  <span className="platform-tag">Android (Chrome)</span>
                  <ol>
                    <li>Nhấn vào biểu tượng menu ba chấm <strong>⋮</strong> ở góc trên bên phải.</li>
                    <li>Chọn <strong>"Cài đặt ứng dụng"</strong> (hoặc <em>"Thêm vào màn hình chính"</em>).</li>
                    <li>Xác nhận <strong>Cài đặt</strong> để đưa icon ra màn hình chính.</li>
                  </ol>
                </div>

                <div className="guide-card ios-guide">
                  <span className="platform-tag">iPhone / iPad (Safari)</span>
                  <ol>
                    <li>Mở trang web trong trình duyệt <strong>Safari</strong>.</li>
                    <li>Nhấn nút <strong>Chia sẻ</strong> (biểu tượng ô vuông mũi tên hướng lên).</li>
                    <li>Cuộn xuống chọn <strong>"Thêm vào MH chính"</strong> (Add to Home Screen).</li>
                  </ol>
                </div>
              </div>
            </>
          )}

          <div className="traffic-safety-note">
            ⚠️ <strong>Lưu ý an toàn:</strong> Vui lòng dừng xe vào lề đường an toàn trước khi thao tác bản đồ hoặc ghi chú.
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </div>
  )
}
