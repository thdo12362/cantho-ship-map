"""Download source evidence into an ignored cache, never into public/.

No login, token extraction or scraping of protected map services.
"""
import hashlib
import json
from pathlib import Path
from datetime import datetime, timezone
import requests

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.data-cache'
HEADERS = {'User-Agent': 'CanThoShipMap-GIS/0.2 (https://github.com/thdo12362/cantho-ship-map; data research)'}
SOURCES = {
    'reference-wards': 'https://www.tinhthanhpho.com/data/wards-92.geojson',
    'reference-license': 'https://www.tinhthanhpho.com/api-docs',
    'upstream-license': 'https://raw.githubusercontent.com/thanglequoc/vietnamese-provinces-database/master/dataset-generation-scripts/resources/gis/geojson_11Mar2026/README.md',
    'vnsdi-service': 'https://vnsdi.mae.gov.vn/basemap/rest/services/BanDoHanhChinhVietNam/MapServer?f=pjson',
    'resolution-1668': 'https://nvsk.vnanet.vn/toan-van-nghi-quyet-so-1668-nq-ubtvqh15-sap-xep-cac-don-vi-hanh-chinh-cap-xa-cua-thanh-pho-can-tho-nam-2025-1-172059.vna',
    'osm-license': 'https://www.openstreetmap.org/copyright',
    'geofabrik-page': 'https://download.geofabrik.de/asia/vietnam.html',
}


def fetch(name, url, timeout=45):
    CACHE.mkdir(exist_ok=True)
    path = CACHE / name
    manifest_path = CACHE / f'{name}.source.json'
    if path.exists() and manifest_path.exists():
        return json.loads(manifest_path.read_text(encoding='utf-8'))
    print(f'Downloading {name}', flush=True)
    response = requests.get(url, headers=HEADERS, timeout=timeout, stream=True)
    response.raise_for_status()
    partial = path.with_suffix('.partial')
    digest = hashlib.sha256()
    with partial.open('wb') as target:
        for block in response.iter_content(1024 * 1024):
            target.write(block)
            digest.update(block)
    partial.replace(path)
    manifest = {'url': url, 'retrieved_at': datetime.now(timezone.utc).isoformat(),
                'sha256': digest.hexdigest(), 'bytes': path.stat().st_size,
                'last_modified': response.headers.get('Last-Modified')}
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding='utf-8')
    return manifest


if __name__ == '__main__':
    import sys
    if '--pbf' in sys.argv:
        # Dated snapshot rather than the moving "latest" URL, for repeatability.
        print(json.dumps(fetch('vietnam-261122.osm.pbf', 'https://download.geofabrik.de/asia/vietnam/vietnam-261122.osm.pbf', timeout=(20, 60)), indent=2))
        fetch('vietnam-261122.osm.pbf.md5', 'https://download.geofabrik.de/asia/vietnam/vietnam-261122.osm.pbf.md5')
        expected = (CACHE / 'vietnam-261122.osm.pbf.md5').read_text().split()[0]
        with (CACHE / 'vietnam-261122.osm.pbf').open('rb') as source:
            actual = hashlib.file_digest(source, 'md5').hexdigest()
        if actual != expected:
            raise ValueError('PBF checksum does not match the publisher checksum')
        print('Publisher MD5 checksum matches downloaded PBF', flush=True)
    else:
        for name, url in SOURCES.items():
            print(json.dumps(fetch(name, url), ensure_ascii=False))
