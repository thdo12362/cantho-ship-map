"""Read public publisher endpoints observed in its own frontend.

Data is cached for review only. No restricted geometry is copied into public/.
No login, cookies, keys, editing endpoints or automated scraping of all wards.
"""
import hashlib
import json
from datetime import datetime, timezone
import requests
from probe_boundary_sources import CACHE, HEADERS
from research_fetch import ROOT


def read_endpoint(name, endpoint, parameters):
    body = CACHE / f'{name}.body'
    manifest = CACHE / f'{name}.request.json'
    if body.exists() and manifest.exists():
        return json.loads(body.read_text(encoding='utf-8'))
    response = requests.post(f'https://sapnhap.bando.com.vn/{endpoint}', data=parameters,
                             headers=HEADERS, timeout=(12, 30))
    record = {'source_id': name, 'url': response.url, 'method': 'POST (read-only publisher operation)',
              'parameters': parameters, 'checked_at': datetime.now(timezone.utc).isoformat(),
              'http_status': response.status_code, 'tls_verification': True, 'credentials_used': False,
              'bytes': len(response.content), 'sha256': hashlib.sha256(response.content).hexdigest(),
              'distribution_status': 'REDISTRIBUTION_PERMISSION_UNVERIFIED_REVIEW_ONLY'}
    body.write_bytes(response.content)
    manifest.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding='utf-8')
    response.raise_for_status()
    return response.json()


if __name__ == '__main__':
    CACHE.mkdir(parents=True, exist_ok=True)
    scope = json.loads((ROOT / 'scripts/gis/scope.json').read_text(encoding='utf-8'))
    catalog = read_endpoint('bando-catalog-reviewed', 'p.co_dvhc', {'ma': '0'})
    selected = []
    for ward in scope['wards']:
        matches = [r for r in catalog if r.get('magoc') == '92' and r.get('ten') == f"Phường {ward['name']}"]
        if len(matches) != 1:
            raise ValueError(f"Expected one publisher ward record: {ward['ward_id']}")
        row = matches[0]
        geometry = read_endpoint(f"bando-geometry-{ward['ward_id']}", 'pread_json', {'id': row['malk']})
        details = read_endpoint(f"bando-metadata-{ward['ward_id']}", 'p.co_dvhc_id', {'malk': row['malk']})
        selected.append({'ward_id': ward['ward_id'], 'catalog': row, 'geometry': geometry,
                         'metadata': details, 'verification_state': 'UNVERIFIED'})
        print(f"Reviewed {ward['ward_id']}: publisher code {row['ma']}; geometry received, redistribution license unverified", flush=True)
    (CACHE / 'bando-review.json').write_text(json.dumps(selected, ensure_ascii=False), encoding='utf-8')
