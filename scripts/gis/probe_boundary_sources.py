"""Read-only source research; preserve TLS verification and never authenticate.

Raw public pages stay in ignored cache. Public output contains only request
metadata, hashes, and reviewed conclusions, never cookies or credentials.
"""
import concurrent.futures
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
import requests
from research_fetch import ROOT, HEADERS

CACHE = ROOT / '.data-cache/verification-02b'
URLS = {
    'diagioi-home': 'https://thongtin.diagioi.gov.vn/',
    'cantho-gis-home': 'https://gisportal.cantho.gov.vn/',
    'bando-home': 'https://sapnhap.bando.com.vn/',
    'cantho-gis-alternative': 'https://gis.cantho.gov.vn/',
    'diagioi-agency': 'https://diagioi.gov.vn/',
    'government-merger-map': 'https://baochinhphu.vn/tra-cuu-dia-gioi-sau-sap-nhap-qua-ban-do-dien-tu-102250708175104468.htm',
    'resolution-1668-review': 'https://nvsk.vnanet.vn/toan-van-nghi-quyet-so-1668-nq-ubtvqh15-sap-xep-cac-don-vi-hanh-chinh-cap-xa-cua-thanh-pho-can-tho-nam-2025-1-172059.vna',
}


def probe(item):
    name, url = item
    path = CACHE / f'{name}.request.json'
    if path.exists():
        cached = json.loads(path.read_text(encoding='utf-8'))
        cached['transport'] = 'HTTPS' if url.startswith('https:') else 'HTTP'
        cached['tls_verification'] = True if url.startswith('https:') else None
        path.write_text(json.dumps(cached, ensure_ascii=False, indent=2), encoding='utf-8')
        return cached
    record = {'source_id': name, 'url': url, 'checked_at': datetime.now(timezone.utc).isoformat(),
              'method': 'GET', 'transport': 'HTTPS' if url.startswith('https:') else 'HTTP',
              'tls_verification': True if url.startswith('https:') else None, 'credentials_used': False}
    try:
        response = requests.get(url, headers=HEADERS, timeout=(12, 25))
        record.update({'http_status': response.status_code, 'final_url': response.url,
                       'bytes': len(response.content), 'sha256': hashlib.sha256(response.content).hexdigest(),
                       'content_type': response.headers.get('Content-Type')})
        (CACHE / f'{name}.body').write_bytes(response.content)
    except requests.exceptions.SSLError:
        record.update({'result': 'TLS_CERTIFICATE_VALIDATION_FAILED', 'note': 'Certificate verification failed (initial direct request identified an expired certificate). Verification was not disabled.'})
    except requests.exceptions.ConnectTimeout:
        record.update({'result': 'CONNECTION_TIMEOUT', 'note': 'Connect timeout after 12 seconds; cannot inspect API documentation or service directory.'})
    except requests.exceptions.ReadTimeout:
        record.update({'result': 'READ_TIMEOUT', 'note': 'Read timeout after 25 seconds.'})
    except requests.exceptions.RequestException as error:
        record.update({'result': 'REQUEST_FAILED', 'error_type': type(error).__name__})
    path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    return record


if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    # Baseline proves this research does not replace or relabel existing OSM data.
    baseline = CACHE / 'baseline.json'
    if not baseline.exists():
        paths = [*(ROOT / 'src').rglob('*'), *(ROOT / 'public/data').glob('*')]
        hashes = {str(path.relative_to(ROOT)).replace('\\', '/'): hashlib.sha256(path.read_bytes()).hexdigest()
                  for path in paths if path.is_file()}
        baseline.write_text(json.dumps(hashes, indent=2), encoding='utf-8')
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        results = list(executor.map(probe, URLS.items()))
    print(json.dumps(results, ensure_ascii=False, indent=2))
