"""Geometry operations with explicit ambiguity and conservation checks."""
import math
import unicodedata
from pyproj import Transformer
from shapely.geometry import shape
from shapely import transform as shapely_transform
from shapely.ops import unary_union


def transform(function, geometry):
    return shapely_transform(geometry, function, interleaved=False)

TO_METERS = Transformer.from_crs('EPSG:4326', 'EPSG:32648', always_xy=True).transform
FROM_METERS = Transformer.from_crs('EPSG:32648', 'EPSG:4326', always_xy=True).transform


def clean_name(value):
    return ' '.join(unicodedata.normalize('NFC', value or '').split())


def normalize_name(value):
    text = clean_name(value).casefold().replace('đ', 'd')
    return ''.join(c for c in unicodedata.normalize('NFD', text) if unicodedata.category(c) != 'Mn')


def validate_geometry(value, allowed=None):
    if value is None or not isinstance(value, dict):
        raise ValueError('Missing geometry')
    if value.get('type') == 'GeometryCollection':
        if not value.get('geometries'):
            raise ValueError('Empty GeometryCollection')
        for child in value['geometries']:
            validate_geometry(child, allowed)
    else:
        if allowed and value.get('type') not in allowed:
            raise ValueError(f"Unexpected geometry type: {value.get('type')}")
        def check_coordinates(coords):
            if not isinstance(coords, (list, tuple)) or not coords:
                raise ValueError('Empty coordinates')
            if isinstance(coords[0], (int, float)):
                if not 2 <= len(coords) <= 3 or not all(isinstance(n, (int, float)) and not isinstance(n, bool) and math.isfinite(n) for n in coords):
                    raise ValueError('Invalid coordinates')
                if not (-180 <= coords[0] <= 180 and -90 <= coords[1] <= 90):
                    raise ValueError('Coordinates outside WGS84 longitude/latitude range')
            else:
                for child in coords:
                    check_coordinates(child)
        check_coordinates(value.get('coordinates'))
        if value['type'] in ('Polygon', 'MultiPolygon'):
            polygons = [value['coordinates']] if value['type'] == 'Polygon' else value['coordinates']
            for polygon in polygons:
                for ring in polygon:
                    if len(ring) < 4 or ring[0] != ring[-1]:
                        raise ValueError('GeoJSON polygon rings must have at least four positions and be explicitly closed')
    geometry = shape(value)
    if geometry.is_empty or not geometry.is_valid:
        raise ValueError('Empty or invalid topology; source geometry is not silently repaired')
    return geometry


def line_parts(geometry):
    if geometry.is_empty:
        return
    if geometry.geom_type == 'LineString':
        if geometry.length > 0:
            yield geometry
    elif geometry.geom_type in ('MultiLineString', 'GeometryCollection'):
        for part in geometry.geoms:
            yield from line_parts(part)


class WardPartitioner:
    """Geometric partition only; caller must distinguish reference and official IDs.

    Reuses projected interiors for bulk processing. With OSM reference polygons,
    returned IDs are CANDIDATES and must never be promoted to official ward_id.
    """
    def __init__(self, wards, tolerance_m=5):
        if tolerance_m <= 0 or not math.isfinite(tolerance_m):
            raise ValueError('Boundary tolerance must be positive')
        self.tolerance_m = tolerance_m
        self.projected = [(ward_id, transform(TO_METERS, polygon)) for ward_id, polygon in wards]
        if len({ward_id for ward_id, _ in self.projected}) != len(self.projected):
            raise ValueError('Duplicate ward IDs')
        # GEOS approximates circles with chords. Inflate the radius so the
        # inscribed buffer never dips inside the requested safety distance.
        buffer_radius = tolerance_m / math.cos(math.pi / 64) + 0.000001
        bands = [polygon.boundary.buffer(buffer_radius, quad_segs=16) for _, polygon in self.projected]
        ambiguity = unary_union(bands)
        self.interiors = []
        for ward_id, polygon in self.projected:
            others = unary_union([other for other_id, other in self.projected if other_id != ward_id])
            self.interiors.append((ward_id, polygon.difference(ambiguity).difference(others)))

    def candidates(self, geometry):
        line_m = transform(TO_METERS, geometry)
        return [ward_id for ward_id, polygon in self.projected if line_m.distance(polygon) <= self.tolerance_m + 0.001]

    def split(self, geometry):
        road = transform(TO_METERS, geometry)
        pieces = []
        for original_part in line_parts(road):
            remaining = original_part
            for ward_id, interior in self.interiors:
                if not remaining.intersects(interior):
                    continue
                for part in line_parts(remaining.intersection(interior)):
                    pieces.append((ward_id, transform(FROM_METERS, part), 'geometry_verified'))
                remaining = remaining.difference(interior)
            for part in line_parts(remaining):
                candidates = [ward_id for ward_id, polygon in self.projected if part.distance(polygon) <= self.tolerance_m + 0.001]
                reason = 'boundary_or_overlap_ambiguous' if candidates else 'outside_verified_coverage'
                pieces.append((None, transform(FROM_METERS, part), reason))
        original_lines = unary_union(list(line_parts(road)))
        output_lines = unary_union([transform(TO_METERS, line) for _, line, _ in pieces])
        if not original_lines.difference(output_lines.buffer(0.001)).is_empty:
            raise ValueError('Segmentation lost source line geometry')
        return pieces


def split_by_verified_wards(geometry, wards, tolerance_m=5):
    """Convenience entry point for independently verified polygons (used by tests)."""
    return WardPartitioner(wards, tolerance_m).split(geometry)
