from dataclasses import dataclass
from typing import Callable, List, Optional

from gaze.icatcher_adapter import GazeSample

from .calibration import Calibration


@dataclass
class TrackingPoint:
    time_seconds: float
    object_position: float
    eye_position: float


def map_to_tracking_points(
    samples: List[GazeSample],
    calibration: Calibration,
    object_position_fn: Optional[Callable[[float], float]] = None,
) -> List[TrackingPoint]:
    """Turns raw iCatcher+ labels into the (time, object, eye) series the
    dashboard's TrackingPoint model expects. `object_position_fn` says where
    the object was, in the scene camera, at a given time in seconds — until
    scene-video target tracking exists, it defaults to a fixed object at the
    center, which is enough to exercise the rest of the pipeline end to end.
    """
    object_position_fn = object_position_fn or (lambda _t: 0.0)

    points = []
    for sample in samples:
        eye_position = calibration.eye_position(sample.label)
        if eye_position is None:
            continue
        points.append(
            TrackingPoint(
                time_seconds=sample.time_seconds,
                object_position=object_position_fn(sample.time_seconds),
                eye_position=eye_position,
            )
        )
    return points
