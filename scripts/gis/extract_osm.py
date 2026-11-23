"""Extract original OSM road ways and inspect boundary candidates.

The rectangle is explicitly a research extent, NOT the union of nine wards.
OSM original ways are never cut or merged here. No name-based ward assignment.
"""
import json
from pathlib import Path
import osmium
from shapely.geometry import LineString, box, shape
from shapely.ops import unary_union
from research_fetch import CACHE, ROOT

SCOPE = json.loads((ROOT / 'scripts/gis/scope.json').read_text(encoding='utf-8'))
STUDY = box(*SCOPE['study_bbox'])
BOUNDARIES = CACHE / 'osm-boundary-candidates.geojson'
if BOUNDARIES.exists():
    candidates = json.loads(BOUNDARIES.read_text(encoding='utf-8'))['features']
    selected = [f for f in candidates if f['properties']['osm_id'] in set(SCOPE['osm_boundary_relations'].values())]
    if len(selected) == 9:
        STUDY = unary_union([shape(f['geometry']) for f in selected])
KEEP_TAGS = ['name', 'name:vi', 'alt_name', 'official_name', 'short_name', 'ref',
             'highway', 'service', 'access', 'oneway', 'surface', 'maxspeed',
             'motor_vehicle', 'motorcycle', 'vehicle', 'bicycle', 'foot', 'area',
             'width', 'lanes', 'junction', 'bridge', 'tunnel', 'layer', 'construction']
NAMES = {w['name'] for w in SCOPE['wards']}


class RoadExtractor(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.roads = []
        self.invalid = []

    def way(self, way):
        if 'highway' not in way.tags:
            return
        try:
            coordinates = [(n.lon, n.lat) for n in way.nodes]
            if len(coordinates) < 2:
                raise ValueError('Way has fewer than two nodes')
            # Cheap bbox rejection before constructing GEOS objects.
            west, south, east, north = SCOPE['study_bbox']
            xs, ys = zip(*coordinates)
            if max(xs) < west or min(xs) > east or max(ys) < south or min(ys) > north:
                return
            geometry = LineString(coordinates)
            if not geometry.intersects(STUDY):
                return
            self.roads.append({'osm_id': str(way.id), 'osm_version': way.version,
                               'osm_timestamp': str(way.timestamp),
                               'tags': {t.k: t.v for t in way.tags if t.k in KEEP_TAGS},
                               'geometry': {'type': 'LineString', 'coordinates': coordinates}})
        except (osmium.InvalidLocationError, ValueError) as error:
            self.invalid.append({'osm_id': str(way.id), 'reason': str(error)})


def extract_roads(pbf):
    extractor = RoadExtractor()
    print('Extracting original road ways from PBF...', flush=True)
    extractor.apply_file(str(pbf), locations=True, idx='flex_mem')
    result = {'study_bbox': SCOPE['study_bbox'], 'scope_status': 'intersects_osm_reference_ward_union' if STUDY.geom_type != 'Polygon' or not STUDY.equals(box(*SCOPE['study_bbox'])) else 'candidate_bbox_not_ward_clipped',
              'roads': sorted(extractor.roads, key=lambda r: int(r['osm_id'])),
              'invalid_geometry': extractor.invalid}
    (CACHE / 'osm-roads.json').write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'Extracted {len(extractor.roads)} highway ways; invalid geometry: {len(extractor.invalid)}', flush=True)


def inspect_boundaries(pbf):
    candidates = []
    factory = osmium.geom.GeoJSONFactory()
    filters = osmium.filter.TagFilter(*[('name', n) for name in NAMES for n in [name, f'Phường {name}', f'phường {name}']])
    processor = (osmium.FileProcessor(str(pbf)).with_locations('flex_mem')
                 .with_areas(filters, osmium.filter.TagFilter(('boundary', 'administrative')))
                 .with_filter(osmium.filter.EntityFilter(osmium.osm.AREA))
                 .with_filter(osmium.filter.TagFilter(('boundary', 'administrative'))))
    print('Inspecting OSM administrative area candidates...', flush=True)
    for area in processor:
        name = area.tags.get('name', '').removeprefix('Phường ').removeprefix('phường ')
        if name not in NAMES:
            continue
        geometry = json.loads(factory.create_multipolygon(area))
        if shape(geometry).intersects(STUDY):
            candidates.append({'type': 'Feature', 'id': f'osm-relation-{area.orig_id()}',
                               'properties': {'osm_id': str(area.orig_id()), 'tags': dict(area.tags)},
                               'geometry': geometry})
    (CACHE / 'osm-boundary-candidates.geojson').write_text(json.dumps({'type': 'FeatureCollection', 'features': candidates}, ensure_ascii=False), encoding='utf-8')
    print(json.dumps([c['properties'] for c in candidates], ensure_ascii=False), flush=True)


if __name__ == '__main__':
    import sys
    pbf = CACHE / 'vietnam-261122.osm.pbf'
    if '--boundaries' in sys.argv:
        inspect_boundaries(pbf)
    else:
        extract_roads(pbf)
