export function isValidCoordinates(position) {
  return Boolean(position && Number.isFinite(position.lat) && Number.isFinite(position.lng)
    && Math.abs(position.lat) <= 90 && Math.abs(position.lng) <= 180)
}

export function googleMapsUrl(position, address = '') {
  const query = isValidCoordinates(position) ? `${position.lat},${position.lng}` : address.trim()
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
}

export function geolocationError(error) {
  switch (error.code) {
    case 1: return 'Bạn đã từ chối quyền vị trí. Hãy cho phép vị trí trong cài đặt trình duyệt rồi thử lại.'
    case 2: return 'Không xác định được vị trí. Hãy bật dịch vụ vị trí trên thiết bị rồi thử lại.'
    case 3: return 'GPS phản hồi quá lâu. Hãy di chuyển đến nơi thoáng hơn rồi thử lại.'
    default: return 'Không thể lấy vị trí. Vui lòng thử lại.'
  }
}

export function requestLocation(geolocation, highAccuracy) {
  return new Promise((resolve, reject) => {
    if (!geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ GPS. Hãy dùng trình duyệt hỗ trợ và kết nối HTTPS (hoặc localhost).'))
      return
    }
    geolocation.getCurrentPosition(({ coords }) => {
      const position = { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy, source: 'gps' }
      if (isValidCoordinates(position)) resolve(position)
      else reject(new Error('GPS trả về tọa độ không hợp lệ. Vui lòng thử lại.'))
    }, (error) => reject(new Error(geolocationError(error))), {
      enableHighAccuracy: highAccuracy, timeout: 15000, maximumAge: 0,
    })
  })
}
