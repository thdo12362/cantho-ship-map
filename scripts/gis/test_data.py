import json
import tempfile
import unittest
from pathlib import Path
from shutil import copytree
from build_data import normalize_road, road_type, vehicle_candidate
from validate_data import validate, DATA


class RoadRulesTests(unittest.TestCase):
    def test_service_does_not_automatically_mean_alley(self):
        self.assertEqual(road_type({'highway': 'service'}, None), 'service_road')
        self.assertEqual(road_type({'highway': 'service', 'service': 'alley'}, None), 'unnamed_alley')
        self.assertEqual(road_type({'highway': 'residential'}, 'Hẻm 9'), 'named_alley')
        self.assertEqual(road_type({'highway': 'residential'}, None), 'unnamed_branch')

    def test_no_invented_names_addresses_or_default_access(self):
        raw = {'osm_id': '1', 'tags': {'highway': 'service', 'oneway': '-1', 'access': 'private'},
               'geometry': {'type': 'LineString', 'coordinates': [[105.7, 10], [105.71, 10]]}}
        props = normalize_road(raw)['properties']
        self.assertIsNone(props['name'])
        self.assertIsNone(props['normalized_name'])
        self.assertIsNone(props['alley_number'])
        self.assertEqual(props['oneway'], '-1')
        self.assertEqual(props['access'], 'private')
        self.assertIsNone(props['surface'])

    def test_duplicate_names_keep_distinct_osm_identity(self):
        raw = {'osm_id': '1', 'tags': {'highway': 'residential', 'name': 'Đường  A', 'alt_name': 'Tên cũ; Tên khác', 'name:vi': 'Đường A'},
               'geometry': {'type': 'LineString', 'coordinates': [[105.7, 10], [105.71, 10]]}}
        first = normalize_road(raw)
        second = normalize_road({**raw, 'osm_id': '2'})
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(first['properties']['name'], 'Đường A')
        self.assertEqual(first['properties']['osm_tags']['name'], 'Đường  A')
        self.assertEqual(first['properties']['aliases'], ['Tên cũ', 'Tên khác'])

    def test_motorcycle_permission_and_area_exclusions(self):
        self.assertFalse(vehicle_candidate({'highway': 'footway'})[0])
        self.assertTrue(vehicle_candidate({'highway': 'footway', 'motorcycle': 'yes'})[0])
        self.assertFalse(vehicle_candidate({'highway': 'service', 'area': 'yes'})[0])
        self.assertTrue(vehicle_candidate({'highway': 'service', 'access': 'private'})[0])


@unittest.skipUnless((DATA / 'roads.geojson').exists(), 'Build real data before integration validation')
class DatasetValidationTests(unittest.TestCase):
    def test_real_data_quality_is_distinct_from_readiness(self):
        report = validate()
        self.assertTrue(report['technical_validation_passed'], report['errors'])
        self.assertFalse(report['stage_2_complete'])
        self.assertEqual(report['counts']['ward_records'], 9)
        self.assertEqual(report['counts']['official_verified_ward_polygons'], 0)
        self.assertGreater(report['counts']['roads'], 0)

    def mutate_and_validate(self, filename, mutate):
        with tempfile.TemporaryDirectory(prefix='cantho-gis-test-') as temporary:
            destination = Path(temporary) / 'data'
            copytree(DATA, destination)
            path = destination / filename
            value = json.loads(path.read_text(encoding='utf-8'))
            mutate(value)
            path.write_text(json.dumps(value, ensure_ascii=False), encoding='utf-8')
            return validate(destination, check_cache=False)

    def test_duplicate_ids_are_rejected(self):
        report = self.mutate_and_validate('roads.geojson', lambda data: data['features'].append(data['features'][0]))
        self.assertFalse(report['technical_validation_passed'])
        self.assertTrue(any('duplicate IDs' in error for error in report['errors']))

    def test_unverified_ward_assignment_is_rejected(self):
        def mutate(data):
            data['features'][0]['properties']['ward_id'] = 'ct-ninh-kieu'
        report = self.mutate_and_validate('road-segments.geojson', mutate)
        self.assertFalse(report['technical_validation_passed'])
        self.assertTrue(any('assignment without verified' in error for error in report['errors']))

    def test_modified_source_geometry_is_rejected(self):
        def mutate(data):
            data['features'][0]['geometry']['coordinates'][0][0] += 0.001
        report = self.mutate_and_validate('roads.geojson', mutate)
        self.assertFalse(report['technical_validation_passed'])
        self.assertTrue(any('geometry hash mismatch' in error for error in report['errors']))

    def test_osm_reference_cannot_be_promoted_to_official_boundary(self):
        def mutate(data):
            props = data['features'][0]['properties']
            props['verification_status'] = 'official_verified'
            props['updated_at'] = '2026-11-22'
        report = self.mutate_and_validate('wards.geojson', mutate)
        self.assertFalse(report['technical_validation_passed'])
        self.assertTrue(any('official boundary authority' in error for error in report['errors']))


if __name__ == '__main__':
    unittest.main()
