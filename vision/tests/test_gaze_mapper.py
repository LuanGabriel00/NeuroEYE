from gaze.icatcher_adapter import GazeSample
from mapping.calibration import Calibration
from mapping.gaze_mapper import map_to_tracking_points


def test_maps_known_labels_and_skips_unknown():
    samples = [
        GazeSample(time_seconds=0.0, label="left", confidence=0.9),
        GazeSample(time_seconds=0.5, label="away", confidence=0.4),
        GazeSample(time_seconds=1.0, label="right", confidence=0.95),
    ]
    points = map_to_tracking_points(samples, Calibration())

    assert len(points) == 2
    assert points[0].eye_position == -1.0
    assert points[1].eye_position == 1.0
    assert all(p.object_position == 0.0 for p in points)


def test_uses_object_position_fn_when_given():
    samples = [GazeSample(time_seconds=2.0, label="left", confidence=0.9)]
    points = map_to_tracking_points(samples, Calibration(), object_position_fn=lambda t: t * 10)

    assert points[0].object_position == 20.0
