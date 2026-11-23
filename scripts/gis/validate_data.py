"""Validate technical quality separately from administrative readiness.

Exit 1 on corrupt/inconsistent data. --require-complete also fails when any ward
boundary or administrative membership is unverified. The report always says
whether Stage 2 is ready; a technical pass alone never means complete coverage.
"""
import argparse
import hashlib
import json
import sys
from collections import Counter
from shapely.geometry import shape
from shapely.ops import unary_union
from research_fetch import ROOT, CACHE
from geometry import validate_geometry, normalize_name, clean_name, line_parts, transform, TO_METERS, WardPartitioner
from build_data import digest, normalize_road, vehicle_candidate

DATA = ROOT / 'public/data'
SCOPE = json.loads((ROOT / 'scripts/gis/scope.json').read_text(encoding='utf-8'))


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def validate(data_dir=DATA, check_cache=True):
    errors = []
    blocked = []
    def require(condition, message):
        if not condition:
            errors.append(message)
    def read(name):
        return json.loads((data_dir / name).read_text(encoding='utf-8'))
    sources = read('data-sources.json')['sources']
    source_ids = {s['source_id'] for s in sources}
    source_map = {s['source_id']: s for s in sources}
    require(len(source_ids) == len(sources), 'Duplicate source IDs')
    for source in sources:
        require(bool(source.get('url') and (source.get('retrieved_at') or source.get('checked_on')) and source.get('verification_status')), f"Incomplete source metadata: {source['source_id']}")
    collections = {kind: read(f'{kind}.geojson') for kind in ['wards', 'roads', 'road-segments']}
    for kind, collection in collections.items():
        require(collection.get('type') == 'FeatureCollection' and isinstance(collection.get('features'), list), f'{kind}: invalid FeatureCollection')
        require(collection.get('metadata', {}).get('coordinate_reference_system') == 'EPSG:4326', f'{kind}: missing coordinate reference metadata')
        ids = [f.get('id') for f in collection['features']]
        require(all(ids) and len(set(ids)) == len(ids), f'{kind}: missing or duplicate IDs')
    wards, roads, segments = [collections[k]['features'] for k in ['wards', 'roads', 'road-segments']]
    expected = {w['ward_id']: w for w in SCOPE['wards']}
    require({w['properties']['ward_id'] for w in wards} == set(expected), 'Wrong ward IDs/count; expected exactly the requested nine wards')
    ward_map = {}
    reference_map = {}
    valid_ward_ids = set()
    missing_ward_ids = []
    for feature in wards:
        props = feature['properties']
        ward_id = props['ward_id']
        require(feature['id'] == ward_id, f'{ward_id}: feature ID mismatch')
        require(props.get('source') in source_ids, f'{ward_id}: unknown source')
        require(props.get('name') == expected.get(ward_id, {}).get('name'), f'{ward_id}: unexpected current name')
        require(props.get('normalized_name') == normalize_name(props.get('name')), f'{ward_id}: inconsistent normalized name')
        require(props.get('legacy_names') == expected.get(ward_id, {}).get('legacy_names'), f'{ward_id}: unsupported historic mapping')
        if feature['geometry'] is None:
            require(props.get('verification_status') == 'boundary_missing', f'{ward_id}: null geometry not explicitly marked missing')
            missing_ward_ids.append(ward_id)
            continue
        try:
            geometry = validate_geometry(feature['geometry'], {'Polygon', 'MultiPolygon'})
            valid_ward_ids.add(ward_id)
            reference_map[ward_id] = geometry
            require(props.get('source_geometry_sha256') == digest(feature['geometry']), f'{ward_id}: boundary geometry hash mismatch')
            require(props.get('osm_id') == SCOPE['osm_boundary_relations'][ward_id], f'{ward_id}: unexpected OSM relation identity')
            require(props.get('license') == 'ODbL-1.0', f'{ward_id}: missing reference boundary license')
            if props.get('verification_status') == 'official_verified':
                require(bool(props.get('boundary_source') in source_ids and props.get('license') and props.get('updated_at')), f'{ward_id}: official geometry missing provenance, license or date')
                boundary_source = source_map.get(props.get('boundary_source'), {})
                official_source = (boundary_source.get('authority_type') == 'government'
                                   and boundary_source.get('verification_status') == 'official_boundary_verified'
                                   and boundary_source.get('license_status') == 'redistribution_permitted')
                require(official_source, f'{ward_id}: reference source cannot be promoted to official boundary authority')
                if official_source:
                    ward_map[ward_id] = geometry
            else:
                blocked.append(f'{ward_id}: polygon not officially verified')
        except ValueError as error:
            errors.append(f'{ward_id}: {error}')
    if missing_ward_ids:
        blocked.append(f'{len(missing_ward_ids)} ward boundaries missing')
    partitioner = WardPartitioner(list(reference_map.items()))
    reference_union = unary_union(list(reference_map.values()))
    reference_overlap_m2 = max(0, sum(transform(TO_METERS, polygon).area for polygon in reference_map.values()) - transform(TO_METERS, reference_union).area)
    if reference_overlap_m2 > 1:
        blocked.append('Reference ward interiors overlap; overlap segments must remain ambiguous')
    road_map = {}
    for feature in roads:
        props = feature['properties']
        road_id = props['road_id']
        road_map[road_id] = feature
        require(feature['id'] == road_id == f"osm-way-{props.get('osm_id')}", f'{road_id}: missing/incorrect OSM identity')
        require(props.get('source') in source_ids and props.get('source_url'), f'{road_id}: incomplete provenance')
        require(props.get('verification_status') == 'osm_source_not_field_verified', f'{road_id}: unsupported verification claim')
        require(props.get('coverage_status') == 'intersects_osm_reference_ward_union', f'{road_id}: unsupported exact coverage claim')
        require(props.get('license') == 'ODbL-1.0', f'{road_id}: missing OSM license')
        require(props.get('name') == (clean_name(props.get('name')) or None), f'{road_id}: inconsistent name formatting')
        require(props.get('normalized_name') == (normalize_name(props.get('name')) or None), f'{road_id}: inconsistent normalized name')
        require(props.get('source_geometry_sha256') == digest(feature['geometry']), f'{road_id}: geometry hash mismatch')
        for key in ['highway', 'service', 'access', 'oneway', 'surface', 'maxspeed', 'name:vi', 'alt_name', 'ref']:
            require(props.get(key) == props.get('osm_tags', {}).get(key), f'{road_id}: altered original {key} tag')
        require(all(props.get(k) is None for k in ['address', 'house_number', 'alley_number']), f'{road_id}: unverified address/number added')
        try:
            geometry = validate_geometry(feature['geometry'], {'LineString', 'MultiLineString'})
            require(geometry.intersects(reference_union), f'{road_id}: does not intersect the OSM reference ward union')
        except ValueError as error:
            errors.append(f'{road_id}: {error}')
    segment_map = {}
    by_road = {}
    segment_ids_by_road = {}
    for segment in segments:
        props = segment['properties']
        segment_id, road_id, ward_id = props['segment_id'], props['road_id'], props['ward_id']
        require(segment['id'] == segment_id, f'{segment_id}: ID mismatch')
        require(road_id in road_map, f'{segment_id}: missing parent road')
        require(props.get('source') in source_ids, f'{segment_id}: missing source')
        if road_id in road_map:
            parent = road_map[road_id]['properties']
            require(props['name'] == parent['name'] and props['road_type'] == parent['road_type'], f'{segment_id}: changed parent name/class')
        try:
            geometry = validate_geometry(segment['geometry'], {'LineString', 'MultiLineString'})
            if ward_id is not None:
                require(ward_id in ward_map, f'{segment_id}: assignment without verified ward geometry')
                if ward_id in ward_map:
                    line_m = transform(TO_METERS, geometry)
                    polygon_m = transform(TO_METERS, ward_map[ward_id])
                    require(polygon_m.covers(line_m) and line_m.distance(polygon_m.boundary) >= 4.999, f'{segment_id}: not supported by interior ward geometry')
                require(props.get('verification_status') == 'geometry_verified', f'{segment_id}: assignment status mismatch')
            else:
                require(props.get('verification_status') in {'unassigned_missing_boundaries', 'provisional_osm_boundary', 'boundary_or_overlap_ambiguous', 'outside_reference_coverage'}, f'{segment_id}: missing ambiguity status')
            candidate = props.get('candidate_ward_id')
            candidate_ids = props.get('candidate_ward_ids', [])
            if candidate:
                require(candidate in reference_map, f'{segment_id}: unknown candidate ward')
                require(candidate_ids == [candidate] and props.get('verification_status') == 'provisional_osm_boundary', f'{segment_id}: candidate membership/status mismatch')
                if candidate in reference_map:
                    line_m = transform(TO_METERS, geometry)
                    polygon_m = transform(TO_METERS, reference_map[candidate])
                    require(polygon_m.buffer(0.001).covers(line_m) and line_m.distance(polygon_m.boundary) >= 4.999, f'{segment_id}: candidate assignment not supported by reference interior geometry')
            else:
                require(set(candidate_ids) == set(partitioner.candidates(geometry)), f'{segment_id}: boundary candidate list mismatch')
            by_road.setdefault(road_id, []).append(geometry)
        except ValueError as error:
            errors.append(f'{segment_id}: {error}')
        segment_map[segment_id] = segment
        segment_ids_by_road.setdefault(road_id, set()).add(segment_id)
    for road_id, road in road_map.items():
        original = transform(TO_METERS, unary_union(list(line_parts(shape(road['geometry'])))))
        result = transform(TO_METERS, unary_union(by_road.get(road_id, [])))
        require(original.difference(result.buffer(0.001)).is_empty, f'{road_id}: source line lost in segment conversion')
        require(result.difference(original.buffer(0.001)).is_empty, f'{road_id}: invented segment geometry')
    index = read('roads-index.json')
    entries = index['entries']
    require(len(entries) == len(roads) and {e['road_id'] for e in entries} == set(road_map), 'Index lost or duplicated roads')
    for entry in entries:
        road_id = entry['road_id']
        parent = road_map.get(road_id, {}).get('properties', {})
        require(entry['name'] == parent.get('name') and entry['normalized_name'] == parent.get('normalized_name'), f'{road_id}: index name mismatch')
        expected_segments = segment_ids_by_road.get(road_id, set())
        require(set(entry['segment_ids']) == expected_segments, f'{road_id}: inconsistent index segment references')
        expected_wards = {segment_map[s]['properties']['ward_id'] for s in entry['segment_ids'] if s in segment_map} - {None}
        require(set(entry['ward_ids']) == expected_wards, f'{road_id}: index invents or loses ward membership')
        expected_candidates = {candidate for sid in entry['segment_ids'] if sid in segment_map for candidate in segment_map[sid]['properties'].get('candidate_ward_ids', [])}
        require(set(entry.get('candidate_ward_ids', [])) == set(parent.get('candidate_ward_ids', [])) == expected_candidates, f'{road_id}: inconsistent provisional ward references')
        expected_keywords = sorted({normalize_name(t) for t in [parent.get('name'), *parent.get('aliases', []), parent.get('ref')] if t})
        require(entry['keywords'] == expected_keywords, f'{road_id}: index invented or lost search terms')
    expected_terms = {}
    for entry in entries:
        for keyword in entry['keywords']:
            for term in {keyword, *keyword.split()}:
                expected_terms.setdefault(term, set()).add(entry['road_id'])
    require(set(index['terms']) == set(expected_terms), 'Search term keys mismatch')
    for term, ids in index['terms'].items():
        require(len(ids) == len(set(ids)) and set(ids) == expected_terms.get(term, set()), f'{term}: search postings mismatch')
    provenance_replayed = False
    if check_cache and (CACHE / 'osm-roads.json').exists():
        raw = json.loads((CACHE / 'osm-roads.json').read_text(encoding='utf-8'))
        expected_roads = [normalize_road(r) for r in raw['roads'] if vehicle_candidate(r['tags'])[0]]
        original_properties_only = [{**road, 'properties': {key: value for key, value in road['properties'].items() if key != 'candidate_ward_ids'}} for road in roads]
        require(original_properties_only == expected_roads, 'Public roads differ from deterministic normalization of cached original OSM ways')
        boundaries = json.loads((CACHE / 'osm-boundary-candidates.geojson').read_text(encoding='utf-8'))['features']
        boundary_map = {f['properties']['osm_id']: f for f in boundaries}
        for ward in wards:
            relation_id = ward['properties']['osm_id']
            require(ward['geometry'] == boundary_map[relation_id]['geometry'], f'{relation_id}: public polygon differs from cached OSM source')
        require(not raw['invalid_geometry'], 'Unresolved OSM geometry errors')
        exclusions = read('excluded-highways.json')
        included_ids = {f['properties']['osm_id'] for f in roads}
        excluded_ids = {f['osm_id'] for f in exclusions['excluded']}
        require(not included_ids.intersection(excluded_ids), 'Included/excluded ways overlap')
        require(included_ids | excluded_ids == {r['osm_id'] for r in raw['roads']}, 'OSM ways lost without an exclusion reason')
        pbf = CACHE / 'vietnam-261122.osm.pbf'
        if pbf.exists():
            with pbf.open('rb') as source:
                pbf_sha256 = hashlib.file_digest(source, 'sha256').hexdigest()
            registry = next(s for s in sources if s['source_id'] == 'osm-geofabrik-2026-11-22')
            require(registry['sha256'] == pbf_sha256, 'PBF source hash mismatch')
            provenance_replayed = True
    pending_segments = sum(s['properties']['ward_id'] is None for s in segments)
    if pending_segments:
        blocked.append(f'{pending_segments} provisional/ambiguous road segments lack official ward assignment')
    if roads:
        blocked.append('OSM reference ward union is not verified against official boundaries; original road ways may extend outside it')
    else:
        blocked.append('No road data')
    report = {
        'schema_version': 1, 'technical_validation_passed': not errors,
        'stage_2_complete': not errors and not blocked,
        'provenance_checked_against_local_osm_cache': provenance_replayed,
        'counts': {'ward_records': len(wards), 'valid_ward_polygons': len(valid_ward_ids),
                   'official_verified_ward_polygons': len(ward_map), 'roads': len(roads),
                   'named_roads': sum(bool(r['properties']['name']) for r in roads),
                   'unnamed_roads': sum(not r['properties']['name'] for r in roads),
                   'identified_alley_ways': sum(r['properties']['road_type'] in {'named_alley', 'unnamed_alley'} for r in roads),
                   'assigned_segments': len(segments) - pending_segments, 'unverified_segments': pending_segments},
        'provisional_interior_segments': sum(bool(s['properties'].get('candidate_ward_id')) for s in segments),
        'ambiguous_boundary_segments': sum(s['properties']['verification_status'] == 'boundary_or_overlap_ambiguous' for s in segments),
        'outside_reference_segments': sum(s['properties']['verification_status'] == 'outside_reference_coverage' for s in segments),
        'reference_boundary_overlap_m2': round(reference_overlap_m2, 6),
        'road_count_unit': 'OSM way IDs, not unique street names or unique physical alleys',
        'roads_pending_official_membership': len(roads) if len(ward_map) < 9 else 0,
        'road_type_counts': dict(Counter(r['properties']['road_type'] for r in roads)),
        'highway_counts': dict(Counter(r['properties']['highway'] for r in roads)),
        'study_bbox': SCOPE['study_bbox'], 'road_scope': 'intersects_osm_reference_ward_union',
        'missing_boundary_ward_ids': missing_ward_ids, 'errors': errors, 'blockers': blocked,
        'missing_official_boundary_ward_ids': sorted(set(expected) - set(ward_map)),
        'coverage_by_ward': [{'ward_id': ward_id, 'name': expected[ward_id]['name'],
                              'valid_reference_polygon': ward_id in valid_ward_ids,
                              'official_boundary_verified': ward_id in ward_map,
                              'candidate_original_road_ways': sum(ward_id in road['properties'].get('candidate_ward_ids', []) for road in roads),
                              'street_alley_completeness': 'unknown_not_field_verified'} for ward_id in expected],
        'coverage_claim': 'OSM snapshot intersecting nine reference boundary relations; no claim of complete street/alley coverage or official administrative membership.',
    }
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--require-complete', action='store_true')
    parser.add_argument('--write-report', action='store_true')
    args = parser.parse_args()
    try:
        report = validate()
    except (KeyError, TypeError, ValueError, OSError) as error:
        print(f'Data validation failed: {error}', file=sys.stderr)
        sys.exit(1)
    if args.write_report:
        (DATA / 'coverage-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False, indent=2))
    sys.exit(0 if report['technical_validation_passed'] and (not args.require_complete or report['stage_2_complete']) else 1)
