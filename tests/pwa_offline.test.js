import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { isServiceWorkerSupported, isRunningStandalone } from '../src/services/pwa.js'

test('1. Web App Manifest hợp lệ và đầy đủ thông tin chuẩn PWA', () => {
  const manifestPath = path.resolve('public/manifest.webmanifest')
  assert.ok(fs.existsSync(manifestPath), 'manifest.webmanifest phải tồn tại trong public/')

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))

  // Tên ứng dụng
  assert.equal(manifest.name, 'CanTho Ship Map')
  assert.equal(manifest.short_name, 'CanTho Map')

  // Cấu hình hiển thị và phạm vi
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.theme_color, '#08785e')
  assert.equal(manifest.background_color, '#f5f8f7')
  assert.ok(manifest.start_url)
  assert.ok(manifest.scope)

  // Kiểm tra danh sách icons
  assert.ok(Array.isArray(manifest.icons), 'Icons phải là mảng')
  assert.ok(manifest.icons.length >= 4, 'Cần tối thiểu 4 icon (192, 512, maskable 192, maskable 512)')

  const sizes = manifest.icons.map((i) => i.sizes)
  assert.ok(sizes.includes('192x192'), 'Phải có icon 192x192')
  assert.ok(sizes.includes('512x512'), 'Phải có icon 512x512')

  const purposes = manifest.icons.map((i) => i.purpose)
  assert.ok(purposes.includes('any'), 'Phải có icon purpose any')
  assert.ok(purposes.includes('maskable'), 'Phải có icon purpose maskable')

  // Kiểm tra file icon thực tế trên đĩa
  for (const icon of manifest.icons) {
    const iconFilePath = path.resolve('public', icon.src.replace(/^\.\//, ''))
    assert.ok(fs.existsSync(iconFilePath), `Tệp icon ${icon.src} phải tồn tại thực tế trên đĩa`)
    const stat = fs.statSync(iconFilePath)
    assert.ok(stat.size > 0, `Icon ${icon.src} không được rỗng`)
  }
})

test('2. Service Worker tuân thủ nghiêm ngặt chính sách OpenStreetMap và hỗ trợ ngoại tuyến', () => {
  const swPath = path.resolve('public/sw.js')
  assert.ok(fs.existsSync(swPath), 'sw.js phải tồn tại trong public/')

  const swContent = fs.readFileSync(swPath, 'utf8')

  // Phải có cơ chế đặt tên cache phiên bản
  assert.match(swContent, /cantho-static-v1/, 'Phải có cache name static')
  assert.match(swContent, /cantho-data-v1/, 'Phải có cache name data')

  // TUYỆT ĐỐI KHÔNG prefetch tile OpenStreetMap
  assert.equal(
    swContent.includes('tile.openstreetmap.org') && swContent.includes('PRECACHE_RESOURCES = [') &&
    swContent.slice(swContent.indexOf('PRECACHE_RESOURCES = [')).split(']')[0].includes('tile.openstreetmap.org'),
    false,
    'Tuyệt đối không được đưa URL tile OSM vào danh sách pre-cache'
  )

  // Danh sách pre-cache phải chứa app shell và dữ liệu GeoJSON 9 phường
  assert.match(swContent, /wards\.geojson/, 'Phải pre-cache wards.geojson cho ngoại tuyến')
  assert.match(swContent, /roads-index\.json/, 'Phải pre-cache roads-index.json cho tìm kiếm ngoại tuyến')
  assert.match(swContent, /manifest\.webmanifest/, 'Phải pre-cache manifest')

  // Xử lý tile OSM theo nhu cầu khi lướt bản đồ (on-demand) và giới hạn dung lượng
  assert.match(swContent, /tile\.openstreetmap\.org/, 'Có xử lý yêu cầu tile khi người dùng xem bản đồ')
  assert.match(swContent, /MAX_TILES_CACHE/, 'Có cơ chế giới hạn số lượng tile lưu trong cache')

  // Trả về fallback 503 khi ngoại tuyến và tile chưa có trong cache
  assert.match(swContent, /503/, 'Có fallback lỗi lịch sự khi mất mạng không có tile nền')

  // Có cơ chế skipWaiting và xoá cache cũ
  assert.match(swContent, /skipWaiting/, 'Có skipWaiting để cập nhật phiên bản mới')
  assert.match(swContent, /caches\.delete/, 'Có cơ chế dọn dẹp cache phiên bản cũ khi activate')
})

test('3. Trình trợ giúp PWA và nhận diện standalone', () => {
  // Test hàm kiểm tra hỗ trợ Service Worker
  const swSupported = isServiceWorkerSupported()
  assert.equal(typeof swSupported, 'boolean')

  // Test standalone detection không gây lỗi trong môi trường Node
  const standalone = isRunningStandalone()
  assert.equal(typeof standalone, 'boolean')
})

test('4. Cấu hình GitHub Pages và quy tắc đường dẫn base', () => {
  const viteConfigPath = path.resolve('vite.config.js')
  const viteContent = fs.readFileSync(viteConfigPath, 'utf8')

  // Base URL phải được cấu hình cho repository /cantho-ship-map/
  assert.match(viteContent, /base:\s*['"]\/cantho-ship-map\/['"]/, 'Vite base phải là /cantho-ship-map/')

  // Workflow deploy GitHub Pages
  const deployWorkflowPath = path.resolve('.github/workflows/deploy.yml')
  assert.ok(fs.existsSync(deployWorkflowPath), 'Phải có workflow deploy.yml')
  const workflowContent = fs.readFileSync(deployWorkflowPath, 'utf8')
  assert.match(workflowContent, /actions\/deploy-pages/, 'Workflow sử dụng deploy-pages chính thức')
  assert.match(workflowContent, /npm run build/, 'Workflow thực thi npm run build trước khi phát hành')
})
