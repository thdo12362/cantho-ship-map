import test from 'node:test'
import assert from 'node:assert/strict'
import { googleMapsUrl, requestLocation, isValidCoordinates } from '../src/services/location.js'

test('Google Maps prioritizes valid coordinates and encodes address fallback', () => {
  assert.equal(googleMapsUrl({ lat: 10, lng: 105 }, 'Cần Thơ'), 'https://www.google.com/maps/search/?api=1&query=10%2C105')
  assert.equal(googleMapsUrl(null, ' Cần Thơ & hẻm 1 '), 'https://www.google.com/maps/search/?api=1&query=C%E1%BA%A7n%20Th%C6%A1%20%26%20h%E1%BA%BBm%201')
  assert.equal(googleMapsUrl(null, ' '), null)
  assert.equal(isValidCoordinates({ lat: NaN, lng: 105 }), false)
  assert.equal(isValidCoordinates({ lat: 91, lng: 0 }), false)
  assert.equal(isValidCoordinates({ lat: 0, lng: 181 }), false)
})

test('GPS uses one request, passes accuracy preference and returns real result', async () => {
  let calls = 0
  const result = await requestLocation({ getCurrentPosition(success, failure, options) {
    calls++
    assert.deepEqual(options, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 })
    success({ coords: { latitude: 10, longitude: 105, accuracy: 12 } })
  } }, true)
  assert.equal(calls, 1)
  assert.deepEqual(result, { lat: 10, lng: 105, accuracy: 12, source: 'gps' })
})

test('GPS reports denied, unavailable, timeout and unsupported errors', async () => {
  for (const [code, message] of [[1, /từ chối/], [2, /Không xác định/], [3, /quá lâu/], [0, /Không thể/]]) {
    await assert.rejects(requestLocation({ getCurrentPosition(success, failure) { failure({ code }) } }, false), message)
  }
  await assert.rejects(requestLocation(null, false), /không hỗ trợ/)
  await assert.rejects(requestLocation({ getCurrentPosition(success) { success({ coords: { latitude: 100, longitude: 0 } }) } }, false), /không hợp lệ/)
})
