"""Build OSM reference geometry, keeping official assignments explicitly unset."""
import hashlib
import json
import re
from pathlib import Path
from shapely.geometry import mapping
from research_fetch import ROOT, CACHE, SOURCES
from geometry import clean_name, normalize_name, validate_geometry, WardPartitioner

OUT = ROOT / 'public/data'
SCOPE = json.loads((ROOT / 'scripts/gis/scope.json').read_text(encoding='utf-8'))
LICENSE_URL = 'https://opendatacommons.org/licenses/odbl/1-0/'
VEHICLE_HIGHWAYS = {'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
                    'motorway_link', 'trunk_link', 'primary_link', 'secondary_link',
                    'tertiary_link', 'unclassified', 'residential', 'living_street',
                    'service', 'track', 'road'}
MOTOR_PERMISSION = {'yes', 'designated', 'permissive', 'destination', 'customers', 'delivery'}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(',', ':')).encode()).hexdigest()


def write(name, data):
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    temporary = path.with_name(path.name + '.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    temporary.replace(path)


def metadata(source):
    return json.loads((CACHE / f'{source}.source.json').read_text(encoding='utf-8'))


def collection(features, kind):
    return {'type': 'FeatureCollection', 'metadata': {
        'schema_version': 1, 'dataset': kind, 'coordinate_reference_system': 'EPSG:4326',
        'coordinate_order': 'longitude,latitude', 'status': 'incomplete',
        'administrative_assignment_ready': False,
        'reference_only': True,
        'warning': 'Ward polygons are OSM references, not verified official boundaries. Official ward IDs on road segments remain null; candidate IDs are provisional only.',
        'study_bbox': SCOPE['study_bbox'],
    }, 'features': features}


def vehicle_candidate(tags):
    if tags.get('area') == 'yes':
        return False, 'highway_area_not_linear_road'
    if tags.get('highway') in VEHICLE_HIGHWAYS:
        return True, None
    if tags.get('highway') in {'path', 'footway', 'cycleway', 'pedestrian'} and (
        tags.get('motorcycle') in MOTOR_PERMISSION or tags.get('motor_vehicle') in MOTOR_PERMISSION):
        return True, None
    return False, 'not_a_motor_vehicle_road_class_without_explicit_permission'


def road_type(tags, name):
    normalized = normalize_name(name)
    explicit_alley_name = bool(re.match(r'^(hem|ngo|ngach|kiet)(?:\s|$)', normalized))
    if tags.get('service') == 'alley' or explicit_alley_name:
        return 'named_alley' if name else 'unnamed_alley'
    highway = tags.get('highway')
    if highway == 'service':
        return 'service_road'
    if not name and highway in {'residential', 'unclassified', 'living_street'}:
        return 'unnamed_branch'
    return 'named_road' if name else 'unnamed_road'


def normalize_road(raw):
    tags = raw['tags']
    # Original values are retained in osm_tags; formatting cleanup does not title-case names.
    name = clean_name(tags.get('name') or tags.get('name:vi')) or None
    aliases = []
    for key in ['name:vi', 'alt_name', 'official_name', 'short_name']:
        for value in tags.get(key, '').split(';'):
            alias = clean_name(value)
            if alias and alias != name and alias not in aliases:
                aliases.append(alias)
    properties = {
        'road_id': f"osm-way-{raw['osm_id']}", 'osm_id': raw['osm_id'], 'osm_type': 'way',
        'name': name, 'normalized_name': normalize_name(name) if name else None,
        'name:vi': tags.get('name:vi'), 'alt_name': tags.get('alt_name'),
        'aliases': aliases, 'ref': tags.get('ref'), 'road_type': road_type(tags, name),
        **{key: tags.get(key) for key in ['highway', 'service', 'access', 'oneway', 'surface', 'maxspeed']},
        'osm_tags': tags, 'source': 'osm-geofabrik-2026-11-22',
        'source_url': f"https://www.openstreetmap.org/way/{raw['osm_id']}",
        'source_geometry_sha256': digest(raw['geometry']),
        'updated_at': raw.get('osm_timestamp'), 'osm_version': raw.get('osm_version'),
        'license': 'ODbL-1.0', 'verification_status': 'osm_source_not_field_verified',
        'coverage_status': 'intersects_osm_reference_ward_union', 'ward_ids': [],
        'address': None, 'house_number': None, 'alley_number': None,
    }
    return {'type': 'Feature', 'id': properties['road_id'], 'properties': properties, 'geometry': raw['geometry']}


def build():
    source_data = json.loads((CACHE / 'osm-roads.json').read_text(encoding='utf-8'))
    if source_data['invalid_geometry']:
        raise ValueError('Source contains unresolved geometry errors. Review cache before publishing data.')
    if source_data['scope_status'] != 'intersects_osm_reference_ward_union':
        raise ValueError('Re-extract roads after collecting the nine OSM reference polygons')
    candidates = json.loads((CACHE / 'osm-boundary-candidates.geojson').read_text(encoding='utf-8'))['features']
    boundary_map = {f['properties']['osm_id']: f for f in candidates}
    wards = []
    for item in SCOPE['wards']:
        relation_id = SCOPE['osm_boundary_relations'][item['ward_id']]
        boundary = boundary_map[relation_id]
        tags = boundary['properties']['tags']
        if tags.get('name') != f"Phường {item['name']}" or tags.get('admin_level') != '6' or tags.get('population:date') != '2025-07-01':
            raise ValueError(f"Review changed OSM boundary identity for {item['ward_id']}")
        validate_geometry(boundary['geometry'], {'Polygon', 'MultiPolygon'})
        properties = {key: item[key] for key in ['ward_id', 'name', 'legacy_names']}
        properties.update({'normalized_name': normalize_name(item['name']),
                           'source': 'osm-geofabrik-2026-11-22', 'legal_source': 'resolution-1668',
                           'legal_article': f"Điều 1 khoản {item['article']}",
                           'name_verification_status': 'checked_against_resolution_1668',
                           'verification_status': 'osm_boundary_unverified',
                           'boundary_source': 'osm-geofabrik-2026-11-22', 'osm_id': relation_id,
                           'source_url': f'https://www.openstreetmap.org/relation/{relation_id}',
                           'source_geometry_sha256': digest(boundary['geometry']),
                           'source_snapshot_date': '2026-11-22', 'updated_at': None,
                           'license': 'ODbL-1.0', 'osm_tags': tags,
                           'identity_check': 'Explicit relation ID, current name, admin_level=6 and population:date=2025-07-01; not official survey verification'})
        wards.append({'type': 'Feature', 'id': item['ward_id'], 'properties': properties, 'geometry': boundary['geometry']})
    roads = []
    excluded = []
    for raw in source_data['roads']:
        validate_geometry(raw['geometry'], {'LineString', 'MultiLineString'})
        included, reason = vehicle_candidate(raw['tags'])
        if included:
            roads.append(normalize_road(raw))
        else:
            excluded.append({'osm_id': raw['osm_id'], 'highway': raw['tags'].get('highway'), 'reason': reason})
    if len(roads) + len(excluded) != len(source_data['roads']):
        raise ValueError('Lost OSM ways during conversion')
    segments = []
    entries = []
    terms = {}
    partitioner = WardPartitioner([(w['id'], validate_geometry(w['geometry'])) for w in wards])
    for road in roads:
        props = road['properties']
        segment_ids = []
        road_candidates = set()
        for number, (candidate_id, line, reason) in enumerate(partitioner.split(validate_geometry(road['geometry']))):
            segment_id = f"{props['road_id']}:reference:{number}"
            candidate_ids = [candidate_id] if candidate_id else partitioner.candidates(line)
            road_candidates.update(candidate_ids)
            status = 'provisional_osm_boundary' if candidate_id else ('boundary_or_overlap_ambiguous' if candidate_ids else 'outside_reference_coverage')
            segment_ids.append(segment_id)
            segments.append({'type': 'Feature', 'id': segment_id, 'properties': {
                'segment_id': segment_id, 'road_id': props['road_id'], 'ward_id': None,
                'candidate_ward_id': candidate_id, 'candidate_ward_ids': sorted(candidate_ids),
                'name': props['name'], 'road_type': props['road_type'],
                'source': props['source'], 'verification_status': status,
                'segmentation_status': 'split_by_osm_reference_boundaries',
                'boundary_tolerance_m': 5, 'geometry_reason': reason,
                'coverage_status': props['coverage_status'],
            }, 'geometry': mapping(line)})
        props['candidate_ward_ids'] = sorted(road_candidates)
        keywords = sorted({normalize_name(t) for t in [props['name'], *props['aliases'], props['ref']] if t})
        entries.append({'road_id': props['road_id'], 'name': props['name'],
                        'normalized_name': props['normalized_name'], 'aliases': props['aliases'],
                        'keywords': keywords, 'segment_ids': segment_ids, 'ward_ids': [],
                        'candidate_ward_ids': sorted(road_candidates),
                        'verification_status': props['verification_status']})
        for keyword in keywords:
            for term in {keyword, *keyword.split()}:
                terms.setdefault(term, []).append(props['road_id'])
    source_list = []
    descriptions = {
        'reference-wards': ('Boundary reference; not published', 'license_conflict_unresolved', 'Publisher declares CC BY 4.0. Its cited geometry upstream explicitly defers rights to Bando.com.vn terms. Not treated as an unrestricted geometry license; no polygons copied to public data.'),
        'reference-license': ('Reference publisher licensing page', 'reviewed', 'CC BY 4.0 claim retained as evidence, not proof of upstream rights.'),
        'upstream-license': ('Boundary upstream licensing notice', 'reviewed_restrictions', 'Explicitly refers to Bando.com.vn terms. MIT repository software license is not treated as permission for boundary geometry.'),
        'vnsdi-service': ('Official administrative map service', 'blocked_token_required', 'HTTP 200 contains ArcGIS error 499 Token Required. No attempt made to obtain or bypass authentication. Layer vintage and redistribution terms not verified.'),
        'resolution-1668': ('Legal names and historical merger scopes', 'legal_names_checked', 'Names and whole/partial/remainder scopes checked at Điều 1 khoản 1–9. Resolution text does not supply boundary geometry. No polygons reconstructed from predecessor names.'),
        'osm-license': ('OpenStreetMap licensing', 'reviewed', 'OpenStreetMap database ODbL 1.0; retain attribution and share-alike for derived road database.'),
        'geofabrik-page': ('OSM extract catalog', 'reviewed', 'Country extract preserves original OSM tags, including unnamed ways. No contributor user IDs, names or changesets are exported.'),
    }
    for source_id in SOURCES:
        kind, status, note = descriptions[source_id]
        source_list.append({'source_id': source_id, 'name': source_id, **metadata(source_id),
                            'data_type': kind, 'verification_status': status,
                            'license': 'ODbL-1.0' if source_id in {'osm-license', 'geofabrik-page'} else None,
                            'notes': note})
    source_list.append({'source_id': 'osm-geofabrik-2026-11-22', 'name': 'OpenStreetMap via Geofabrik Vietnam dated extract',
                        **metadata('vietnam-261122.osm.pbf'), 'data_type': 'original_osm_highway_ways_and_boundary_relations',
                        'authority_type': 'community',
                        'publisher_md5': (CACHE / 'vietnam-261122.osm.pbf.md5').read_text().split()[0],
                        'license': 'ODbL-1.0', 'license_url': LICENSE_URL,
                        'attribution': '© OpenStreetMap contributors', 'verification_status': 'download_hash_recorded_osm_not_field_verified',
                        'notes': 'Country snapshot filtered by the union of nine explicitly reviewed OSM administrative relation candidates. Names match resolution 1668; boundaries have not been verified against official survey geometry. Original road ways extend outside the union. No claim of complete street/alley coverage.'})
    source_list.extend([
        {'source_id': 'overpass-research', 'name': 'Overpass endpoint research',
         'url': 'https://overpass-api.de/api/interpreter', 'data_type': 'source_availability',
         'checked_on': '2026-11-23', 'license': 'ODbL-1.0',
         'verification_status': 'not_used', 'notes': 'POST HTTP 406; GET HTTP 502 capacity error. kumi.systems and private.coffee requests timed out. Switched to the dated Geofabrik PBF instead; no partial Overpass response used.'},
        {'source_id': 'cantho-gisportal', 'name': 'Cần Thơ GIS portal',
         'url': 'https://gisportal.cantho.gov.vn/', 'data_type': 'official_boundary_research',
         'checked_on': '2026-11-23', 'license': None,
         'verification_status': 'connection_timeout', 'notes': 'Connection timed out after 50 seconds. No boundary data obtained or licensed from this portal.'}
    ])
    write('wards.geojson', collection(wards, 'wards'))
    write('roads.geojson', collection(roads, 'roads'))
    write('road-segments.geojson', collection(segments, 'road-segments'))
    write('roads-index.json', {'schema_version': 1, 'status': 'incomplete', 'coverage_status': 'intersects_osm_reference_ward_union',
                              'entries': entries, 'terms': {key: sorted(set(value)) for key, value in sorted(terms.items())}})
    write('data-sources.json', {'schema_version': 1, 'status': 'incomplete', 'sources': source_list})
    write('excluded-highways.json', {'reason': 'Intentional scope exclusions, not conversion losses',
                                     'input_highway_ways': len(source_data['roads']), 'included_roads': len(roads),
                                     'excluded': excluded})
    print(f'Built {len(wards)} OSM reference polygons, {len(roads)} original roads, {len(segments)} provisional/ambiguous segments; {len(excluded)} intentional highway exclusions. No official ward assignments.')


if __name__ == '__main__':
    build()
