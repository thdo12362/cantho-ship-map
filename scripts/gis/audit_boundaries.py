"""Prompt 02B: additive audit, not a rebuild or promotion of existing OSM data.

Only scalar comparisons and IDs are published from the publisher review.
Publisher geometries remain in ignored cache until rights and accuracy are known.
"""
import hashlib
import json
from collections import Counter
from datetime import datetime, timezone
import osmium
from shapely import hausdorff_distance
from shapely.geometry import shape
from shapely.ops import unary_union
from geometry import validate_geometry, transform, TO_METERS
from research_fetch import ROOT, CACHE as SOURCE_CACHE
from probe_boundary_sources import CACHE

DATA = ROOT / 'public/data'
STATES = ['VERIFIED_OFFICIAL', 'PROVISIONAL_OSM', 'UNVERIFIED']
NUMERIC_TOLERANCE_M = 0.02


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def write(name, data):
    (DATA / name).write_text(json.dumps(data, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def sha256(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def validate_audit_outputs(report, rows, original_segments):
    expected_ids = {s['id'] for s in original_segments if s['properties']['verification_status'] == 'boundary_or_overlap_ambiguous'}
    row_ids = [row['segment_id'] for row in rows]
    if len(row_ids) != len(set(row_ids)) or set(row_ids) != expected_ids:
        raise ValueError('Audit lost, duplicated or invented an ambiguous segment ID')
    for row in rows:
        if row['ward_id'] is not None or row['verification_state'] != 'UNVERIFIED' or row['evidence_state'] != 'PROVISIONAL_OSM':
            raise ValueError('Audit must not promote provisional geometry into official assignments')
    if report['official_boundaries_verified'] != 0 or report['official_assignment_ready'] or report['stage_2_complete']:
        raise ValueError('No official boundary was verified in this research')
    if len(report['wards']) != 9 or any(w['geometry_verification_state'] != 'PROVISIONAL_OSM' for w in report['wards']):
        raise ValueError('Unexpected ward boundary verification state')
    categories = {'ON_REFERENCE_BOUNDARY', 'CROSSES_REFERENCE_WARDS', 'GEOMETRY_ERROR', 'INSUFFICIENT_EVIDENCE'}
    actual = Counter(row['category'] for row in rows)
    if set(actual) - categories or any(report['ambiguous_segments']['counts'].get(category) != actual[category] for category in categories):
        raise ValueError('Ambiguous classification counts are inconsistent')
    if report['ambiguous_segments']['count'] != len(rows):
        raise ValueError('Ambiguous audit count mismatch')
    def check(value):
        if isinstance(value, dict):
            if 'coordinates' in value or 'geometry' in value:
                raise ValueError('Review output must not redistribute publisher geometry')
            for key, child in value.items():
                if key.endswith('verification_state') or key == 'evidence_state':
                    if child not in STATES:
                        raise ValueError('Unknown verification state')
                check(child)
        elif isinstance(value, list):
            for child in value:
                check(child)
    check(report)
    check(rows)


def classify_segment(line, polygons, reference_boundary, interiors=None, boundary_band=None):
    """Categories refer only to the supplied reference polygons, never ground truth.

    2 cm is a computational collinearity tolerance, not positional accuracy.
    Evidence can overlap; priority is geometry error, on-boundary, crossing,
    insufficient. Partial overlaps remain explicitly recorded for manual review.
    """
    if line.is_empty or not line.is_valid or line.length <= 0:
        return {'category': 'GEOMETRY_ERROR', 'crossed_reference_ward_ids': [], 'on_reference_boundary_m': 0}
    if boundary_band is None:
        boundary_band = reference_boundary.buffer(NUMERIC_TOLERANCE_M)
    if interiors is None:
        interiors = {ward_id: polygon.buffer(-NUMERIC_TOLERANCE_M) for ward_id, polygon in polygons.items()}
    boundary_length = line.intersection(boundary_band).length
    interior_ids = [ward_id for ward_id, polygon in polygons.items()
                    if line.intersection(interiors[ward_id]).length > NUMERIC_TOLERANCE_M]
    if line.length > NUMERIC_TOLERANCE_M and line.difference(boundary_band).length <= NUMERIC_TOLERANCE_M:
        category = 'ON_REFERENCE_BOUNDARY'
    elif len(interior_ids) > 1:
        category = 'CROSSES_REFERENCE_WARDS'
    else:
        category = 'INSUFFICIENT_EVIDENCE'
    return {'category': category, 'crossed_reference_ward_ids': sorted(interior_ids),
            'on_reference_boundary_m': round(boundary_length, 3)}


def relation_metadata(scope):
    ids = set(scope['osm_boundary_relations'].values())
    result = {}
    for relation in osmium.FileProcessor(str(SOURCE_CACHE / 'vietnam-261122.osm.pbf'), osmium.osm.RELATION):
        if str(relation.id) in ids:
            tags = dict(relation.tags)
            result[str(relation.id)] = {'osm_relation_id': str(relation.id), 'osm_version': relation.version,
                'osm_updated_at': str(relation.timestamp), 'type': tags.get('type'),
                'admin_level': tags.get('admin_level'), 'boundary': tags.get('boundary'),
                'name': tags.get('name'), 'administrative_code_tags': {key: value for key, value in tags.items() if key.startswith('ref') or 'code' in key},
                'member_count': len(relation.members)}
    if len(result) != 9:
        raise ValueError('The dated source does not contain all nine expected relations')
    return result


def audit():
    scope = read(ROOT / 'scripts/gis/scope.json')
    wards = read(DATA / 'wards.geojson')['features']
    roads = read(DATA / 'roads.geojson')['features']
    segments = read(DATA / 'road-segments.geojson')['features']
    ambiguous = [s for s in segments if s['properties']['verification_status'] == 'boundary_or_overlap_ambiguous']
    if len(wards) != 9 or len(roads) != 7001 or len(segments) != 7535 or len(ambiguous) != 426:
        raise ValueError('Stage 2 baseline changed; review instead of silently regenerating the audit')
    baseline = read(CACHE / 'baseline.json')
    for relative, expected_hash in baseline.items():
        if sha256(ROOT / relative) != expected_hash:
            raise ValueError(f'Existing baseline changed: {relative}')
    relations = relation_metadata(scope)
    print('Checked nine relation IDs and complete source tags from the retained PBF', flush=True)
    publisher = {row['ward_id']: row for row in read(CACHE / 'bando-review.json')}
    verified_codes = read(ROOT / 'scripts/gis/admin-codes-verified.json')
    if sha256(CACHE / 'admin-codes-19.body') != verified_codes['source_sha256']:
        raise ValueError('Official code table differs from the visually reviewed source')
    osm_polygons = {w['id']: transform(TO_METERS, validate_geometry(w['geometry'], {'Polygon', 'MultiPolygon'})) for w in wards}
    publisher_polygons = {}
    ward_checks = []
    source_manifest = read(SOURCE_CACHE / 'vietnam-261122.osm.pbf.source.json')
    for ward in wards:
        ward_id, properties = ward['id'], ward['properties']
        raw = relations[properties['osm_id']]
        if raw['admin_level'] != '6' or raw['boundary'] != 'administrative' or raw['name'] != f"Phường {properties['name']}":
            raise ValueError(f'OSM tags differ from expected baseline: {ward_id}')
        if properties['osm_id'] != scope['osm_boundary_relations'][ward_id]:
            raise ValueError('OSM relation identity mismatch')
        source = publisher[ward_id]
        if source['catalog']['ma'] != verified_codes['codes'][ward_id]:
            raise ValueError(f'Publisher code differs from the official 2025 table: {ward_id}')
        features = source['geometry'].get('features', [])
        if len(features) != 1:
            raise ValueError('Expected one publisher feature per requested ward')
        publisher_feature = features[0]
        if publisher_feature['properties']['a03_ten'] != f"Phường {properties['name']}":
            raise ValueError('Publisher geometry name mismatch')
        reference = transform(TO_METERS, validate_geometry(publisher_feature['geometry'], {'Polygon', 'MultiPolygon'}))
        publisher_polygons[ward_id] = reference
        osm_polygon = osm_polygons[ward_id]
        union_area = osm_polygon.union(reference).area
        source_name = f'bando-geometry-{ward_id}'
        review_notes = []
        if any(old['scope'] == 'partial' for old in properties['legacy_names']) and 'một phần' not in source['catalog']['truocsapnhap'].casefold():
            review_notes.append('Publisher merger summary does not specify partial transfer; resolution scopes remain authoritative for names/history, not geometry.')
        if str(publisher_feature['properties'].get('a08_ds')) != str(properties['osm_tags'].get('population')):
            review_notes.append('Publisher feature population differs from OSM; recorded as a metadata inconsistency, not proof of boundary error.')
        ward_checks.append({
            'ward_id': ward_id, 'name': properties['name'], 'verification_state': 'PROVISIONAL_OSM',
            **raw, 'osm_admin_code_status': 'MISSING' if not raw['administrative_code_tags'] else 'PRESENT_NOT_OFFICIALLY_VERIFIED',
            'snapshot_date': '2026-11-22', 'snapshot_downloaded_at': source_manifest['retrieved_at'],
            'geometry_extraction_date': '2026-11-23', 'geometry_type': ward['geometry']['type'],
            'geometry_valid': True, 'name_matches_resolution_1668': True,
            'legal_geometry_match': 'UNVERIFIED', 'official_administrative_code_verified': True,
            'official_administrative_code': verified_codes['codes'][ward_id],
            'administrative_code_verification_state': 'VERIFIED_OFFICIAL',
            'administrative_code_source': verified_codes['source_url'],
            'administrative_code_effective_date': verified_codes['effective_date'],
            'geometry_verification_state': 'PROVISIONAL_OSM',
            'publisher_reference_code': source['catalog']['ma'], 'publisher_feature_id': source['catalog']['malk'],
            'publisher_source': f'https://sapnhap.bando.com.vn/pread_json',
            'publisher_evidence_sha256': read(CACHE / f'{source_name}.request.json')['sha256'],
            'comparison_state': 'UNVERIFIED', 'comparison_basis': 'OSM versus public publisher reference, not versus an approved official boundary file',
            'area_method': 'EPSG:32648 planar area; not official natural-area statistics',
            'osm_area_km2': round(osm_polygon.area / 1e6, 6),
            'publisher_geometry_area_km2': round(reference.area / 1e6, 6),
            'publisher_reported_area_km2': source['metadata'][0].get('dientichkm2'),
            'symmetric_difference_km2': round(osm_polygon.symmetric_difference(reference).area / 1e6, 6),
            'intersection_over_union': round(osm_polygon.intersection(reference).area / union_area, 6),
            'sampled_boundary_hausdorff_m': round(float(hausdorff_distance(osm_polygon.boundary, reference.boundary, densify=0.25)), 3),
            'hausdorff_method': 'Discrete Hausdorff with 0.25 densification; sampled comparison, not certified positional accuracy',
            'review_notes': review_notes,
        })
        print(f'Compared {ward_id} with publisher reference geometry', flush=True)
    # Include outer boundaries against wards outside the selected nine as well
    # as internal shared boundaries; neither is an official ground truth.
    reference_boundary = unary_union([polygon.boundary for polygon in osm_polygons.values()])
    reference_interiors = {ward_id: polygon.buffer(-NUMERIC_TOLERANCE_M) for ward_id, polygon in osm_polygons.items()}
    boundary_band = reference_boundary.buffer(NUMERIC_TOLERANCE_M)
    road_candidates = {road['id']: road['properties'].get('candidate_ward_ids', []) for road in roads}
    rows = []
    for segment in ambiguous:
        properties = segment['properties']
        line = transform(TO_METERS, validate_geometry(segment['geometry'], {'LineString', 'MultiLineString'}))
        evidence = classify_segment(line, osm_polygons, reference_boundary, reference_interiors, boundary_band)
        parent_candidates = road_candidates[properties['road_id']]
        rows.append({'segment_id': segment['id'], 'road_id': properties['road_id'],
                     'verification_state': 'UNVERIFIED', 'evidence_state': 'PROVISIONAL_OSM',
                     'ward_id': None, **evidence, 'length_m': round(line.length, 3),
                     'osm_candidate_ward_ids': properties['candidate_ward_ids'],
                     'parent_road_has_multiple_candidates': len(parent_candidates) > 1,
                     'official_boundary_deviation': 'UNVERIFIED',
                     'note': 'Category is relative to OSM reference geometry; no official ward assignment is made.'})
    print('Classified all 426 ambiguous segments without assigning official wards', flush=True)
    impact_counts = Counter()
    impact_rows = []
    # Test entire segment against the second source, not a midpoint shortcut.
    for segment in segments:
        line = transform(TO_METERS, shape(segment['geometry']))
        candidates = sorted(ward_id for ward_id, polygon in publisher_polygons.items()
                            if polygon.covers(line) and line.distance(polygon.boundary) >= 5)
        original = segment['properties'].get('candidate_ward_id')
        if len(candidates) == 1 and original == candidates[0]:
            category = 'SAME_REFERENCE_INTERIOR'
        elif len(candidates) == 1 and original:
            category = 'DIFFERENT_REFERENCE_INTERIOR'
        elif len(candidates) == 1:
            category = 'OSM_AMBIGUOUS_PUBLISHER_INTERIOR'
        else:
            category = 'PUBLISHER_BOUNDARY_OR_OUTSIDE'
        impact_counts[category] += 1
        if category != 'SAME_REFERENCE_INTERIOR':
            impact_rows.append({'segment_id': segment['id'], 'comparison': category,
                                'osm_candidate_ward_id': original, 'publisher_candidate_ward_ids': candidates,
                                'verification_state': 'UNVERIFIED', 'ward_id': None})
    requests = [read(path) for path in sorted(CACHE.glob('*.request.json'))]
    report = {
        'schema_version': 1, 'review': 'PROMPT_02B', 'checked_at': datetime.now(timezone.utc).isoformat(),
        'verification_states': STATES, 'official_boundaries_verified': 0,
        'official_admin_codes_checked': 9, 'official_code_table_evidence': verified_codes,
        'stage_2_complete': False, 'official_assignment_ready': False,
        'osm_geometry_and_ui_preserved': True,
        'preserved_file_sha256': baseline,
        # Git core.autocrlf is enabled in this Windows checkout. Keep the raw
        # local evidence above and a text-canonical digest for Linux CI clones.
        'preserved_content_lf_sha256': {relative: hashlib.sha256((ROOT / relative).read_bytes().replace(b'\r\n', b'\n')).hexdigest() for relative in baseline},
        'source_requests': requests,
        'source_assessments': read(ROOT / 'scripts/gis/boundary-source-review.json')['assessments'],
        'wards': ward_checks,
        'ambiguous_segments': {'count': len(rows), 'classification_basis': 'OSM reference geometry only',
                               'numeric_collinearity_tolerance_m': NUMERIC_TOLERANCE_M,
                               'counts': {category: sum(row['category'] == category for row in rows) for category in ['ON_REFERENCE_BOUNDARY', 'CROSSES_REFERENCE_WARDS', 'GEOMETRY_ERROR', 'INSUFFICIENT_EVIDENCE']},
                               'confirmed_official_boundary_deviations': None,
                               'official_assignments_made': 0},
        'publisher_comparison_impact': {'basis': 'Reference sensitivity only; not an official validation or correction',
                                      'counts': dict(impact_counts), 'review_segment_ids': impact_rows},
        'limitations': ['No approved, current official nine-ward polygon package with verified redistribution rights obtained.',
                       'OSM tags and matching current names do not certify legal boundaries; population:date is not a boundary survey date.',
                       'No administrative-code tags present in the nine OSM relations; publisher codes are reference observations only.',
                       'Bando public responses have no verified boundary survey accuracy, source scale, revision date or open redistribution license.',
                       'No geometry from Bando is copied into public data; only source metadata and scalar review metrics are published.'],
    }
    validate_audit_outputs(report, rows, segments)
    write('boundary-verification.json', report)
    write('ambiguous-segments-audit.json', {'schema_version': 1, 'verification_state': 'UNVERIFIED',
                                          'count': len(rows), 'official_assignment_ready': False, 'segments': rows})
    print(json.dumps({'ward_count': len(ward_checks), 'official_verified': 0,
                      'ambiguous_counts': report['ambiguous_segments']['counts'],
                      'reference_comparison_impact': dict(impact_counts)}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    audit()
