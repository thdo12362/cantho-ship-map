"""Tests specific to the additive 02B review; synthetic geometry is test-only."""
import copy
import hashlib
import json
import unittest
from shapely.geometry import Polygon, LineString
from shapely.ops import unary_union
from audit_boundaries import classify_segment, validate_audit_outputs, ROOT, DATA


class BoundaryClassificationTests(unittest.TestCase):
    def setUp(self):
        self.polygons = {'left': Polygon([(0,0),(10,0),(10,10),(0,10)]),
                         'right': Polygon([(10,0),(20,0),(20,10),(10,10)])}
        self.boundary = unary_union([p.boundary for p in self.polygons.values()])

    def classify(self, line):
        return classify_segment(line, self.polygons, self.boundary)

    def test_line_on_reference_boundary(self):
        self.assertEqual(self.classify(LineString([(10,2),(10,8)]))['category'], 'ON_REFERENCE_BOUNDARY')

    def test_outer_reference_boundary_is_included(self):
        self.assertEqual(self.classify(LineString([(0,2),(0,8)]))['category'], 'ON_REFERENCE_BOUNDARY')

    def test_crossing_distinct_interiors(self):
        result = self.classify(LineString([(5,5),(15,5)]))
        self.assertEqual(result['category'], 'CROSSES_REFERENCE_WARDS')
        self.assertEqual(result['crossed_reference_ward_ids'], ['left', 'right'])

    def test_near_boundary_cannot_be_promoted(self):
        self.assertEqual(self.classify(LineString([(10.5,2),(10.5,8)]))['category'], 'INSUFFICIENT_EVIDENCE')

    def test_partial_boundary_overlap_not_claimed_as_whole_line(self):
        result = self.classify(LineString([(10,1),(10,5),(15,5)]))
        self.assertEqual(result['category'], 'INSUFFICIENT_EVIDENCE')
        self.assertGreater(result['on_reference_boundary_m'], 0)

    def test_invalid_zero_length_line(self):
        self.assertEqual(self.classify(LineString([(10,2),(10,2)]))['category'], 'GEOMETRY_ERROR')


@unittest.skipUnless((DATA / 'boundary-verification.json').exists(), 'Run the 02B audit first')
class PublishedAuditTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.report = json.loads((DATA / 'boundary-verification.json').read_text(encoding='utf-8'))
        cls.rows = json.loads((DATA / 'ambiguous-segments-audit.json').read_text(encoding='utf-8'))['segments']
        cls.segments = json.loads((DATA / 'road-segments.geojson').read_text(encoding='utf-8'))['features']

    def test_all_426_segments_are_accounted_for_without_official_assignment(self):
        self.assertEqual(len(self.rows), 426)
        validate_audit_outputs(self.report, self.rows, self.segments)

    def test_original_osm_and_ui_content_unchanged_across_git_line_endings(self):
        for relative, expected in self.report['preserved_content_lf_sha256'].items():
            self.assertEqual(hashlib.sha256((ROOT / relative).read_bytes().replace(b'\r\n', b'\n')).hexdigest(), expected, relative)

    def test_missing_segment_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'lost, duplicated or invented'):
            validate_audit_outputs(self.report, self.rows[:-1], self.segments)

    def test_unjustified_official_promotion_is_rejected(self):
        rows = copy.deepcopy(self.rows)
        rows[0]['ward_id'] = 'ct-ninh-kieu'
        with self.assertRaisesRegex(ValueError, 'must not promote'):
            validate_audit_outputs(self.report, rows, self.segments)

    def test_publisher_geometry_leak_is_rejected(self):
        report = copy.deepcopy(self.report)
        report['unexpected'] = {'coordinates': [[0,0],[1,1]]}
        with self.assertRaisesRegex(ValueError, 'must not redistribute'):
            validate_audit_outputs(report, self.rows, self.segments)

    def test_official_codes_do_not_verify_official_boundaries(self):
        self.assertEqual(self.report['official_admin_codes_checked'], 9)
        self.assertEqual(self.report['official_boundaries_verified'], 0)
        self.assertTrue(all(w['administrative_code_verification_state'] == 'VERIFIED_OFFICIAL'
                            and w['geometry_verification_state'] == 'PROVISIONAL_OSM' for w in self.report['wards']))


if __name__ == '__main__':
    unittest.main()
