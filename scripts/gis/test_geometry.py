"""Synthetic test geometry stays in tests; never copied to public data."""
import unittest
from shapely.geometry import LineString, MultiLineString, Polygon, MultiPolygon, GeometryCollection, mapping
from geometry import clean_name, normalize_name, validate_geometry, split_by_verified_wards


class GeometryTests(unittest.TestCase):
    def setUp(self):
        self.west = Polygon([(105.70, 10), (105.71, 10), (105.71, 10.01), (105.70, 10.01)])
        self.east = Polygon([(105.71, 10), (105.72, 10), (105.72, 10.01), (105.71, 10.01)])
        self.wards = [('test-west', self.west), ('test-east', self.east)]

    def test_normalization_keeps_original_and_diacritics_separate(self):
        self.assertEqual(clean_name('  Đường  Nguyễn\tTrãi '), 'Đường Nguyễn Trãi')
        self.assertEqual(normalize_name('  ĐƯỜNG Nguyễn Trãi '), 'duong nguyen trai')
        self.assertEqual(normalize_name('Đường Nguyễn Trãi'), 'duong nguyen trai')

    def test_crossing_road_splits_and_retains_boundary_ambiguity(self):
        line = LineString([(105.705, 10.005), (105.715, 10.005)])
        pieces = split_by_verified_wards(line, self.wards)
        self.assertEqual({p[0] for p in pieces}, {'test-west', 'test-east', None})
        self.assertTrue(any(p[2] == 'boundary_or_overlap_ambiguous' for p in pieces))

    def test_boundary_road_is_not_assigned(self):
        line = LineString([(105.71, 10.002), (105.71, 10.008)])
        self.assertTrue(all(p[0] is None for p in split_by_verified_wards(line, self.wards)))

    def test_near_boundary_and_overlapping_wards_not_assigned(self):
        line = LineString([(105.710001, 10.002), (105.710001, 10.008)])
        self.assertTrue(all(p[0] is None for p in split_by_verified_wards(line, self.wards)))
        line = LineString([(105.703, 10.003), (105.707, 10.003)])
        duplicate = [('a', self.west), ('b', self.west)]
        self.assertTrue(all(p[0] is None for p in split_by_verified_wards(line, duplicate)))

    def test_multiline_collection_and_multipolygon(self):
        lines = MultiLineString([[(105.705, 10.002), (105.715, 10.002)], [(105.705, 10.006), (105.715, 10.006)]])
        collection = GeometryCollection([lines])
        validate_geometry(mapping(collection), {'LineString', 'MultiLineString'})
        validate_geometry(mapping(MultiPolygon([self.west])), {'Polygon', 'MultiPolygon'})
        pieces = split_by_verified_wards(collection, [('a', MultiPolygon([self.west])), ('b', self.east)])
        self.assertEqual({p[0] for p in pieces}, {'a', 'b', None})

    def test_invalid_geometry_is_rejected(self):
        invalid = [{'type': 'LineString', 'coordinates': []}, {'type': 'LineString', 'coordinates': [[105, 10], [1000, 10]]}, {'type': 'GeometryCollection', 'geometries': []}, {'type': 'LineString', 'coordinates': [[105, float('nan')], [106, 10]]}]
        for geometry in invalid:
            with self.assertRaises(ValueError):
                validate_geometry(geometry)

    def test_unclosed_polygon_is_not_silently_closed(self):
        with self.assertRaisesRegex(ValueError, 'explicitly closed'):
            validate_geometry({'type': 'Polygon', 'coordinates': [[[105.7,10],[105.71,10],[105.71,10.01],[105.7,10.01]]]}, {'Polygon'})

    def test_polygon_hole_and_outside_are_not_assigned(self):
        polygon = Polygon(self.west.exterior.coords, [[(105.702,10.002),(105.708,10.002),(105.708,10.008),(105.702,10.008)]])
        line = LineString([(105.703,10.005),(105.707,10.005)])
        self.assertTrue(all(p[0] is None for p in split_by_verified_wards(line, [('hole', polygon)])))


if __name__ == '__main__':
    unittest.main()
