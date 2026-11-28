import bisect
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, List, Optional, Tuple

import cv2
import numpy as np


@dataclass
class ObjectSample:
    time_seconds: float
    position: float  # -1..1, horizontal position normalized to frame width


class PlateTracker:
    """Finds a known object in a video frame by multi-scale template
    matching, then follows it with CSRT between detections.

    Ported from joaovpavan/child-eye-tracking's postprocessing/plate_tracker.py
    (MIT license) — same approach (CLAHE + multi-scale TM_CCOEFF_NORMED,
    CSRT for the frames in between), trimmed to the bounding box only, since
    this pipeline only needs a horizontal position, not rotation (the
    original never estimated rotation either — its `angle` field was always
    0.0 for this method).
    """

    def __init__(self, template_path: Path, detect_interval: int = 15, match_threshold: float = 0.35):
        self.detect_interval = detect_interval
        self.match_threshold = match_threshold

        self.template = cv2.imread(str(template_path), cv2.IMREAD_GRAYSCALE)
        if self.template is None:
            raise FileNotFoundError(f"Não consegui ler o template do objeto: {template_path}")
        self.template_h, self.template_w = self.template.shape[:2]

        self._clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
        blurred = cv2.GaussianBlur(self.template, (3, 3), 0)
        self.template_clahe = self._clahe.apply(blurred)

        self._tracker = None
        self._frame_count = 0

    def _create_tracker(self):
        # CSRT lived on cv2 directly pre-4.5, then moved to cv2.legacy, and
        # this OpenCV build (5.x) dropped it entirely in favour of the
        # learned trackers below — try all three so this keeps working
        # across the OpenCV version whoever runs it happens to have.
        for factory in (
            lambda: cv2.TrackerCSRT_create(),
            lambda: cv2.legacy.TrackerCSRT_create(),
            lambda: cv2.TrackerMIL_create(),
        ):
            try:
                return factory()
            except AttributeError:
                continue
        return None

    def _detect(self, frame_gray: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        fh, fw = frame_gray.shape[:2]
        denoised = cv2.GaussianBlur(frame_gray, (3, 3), 0)
        enhanced = self._clahe.apply(denoised)

        min_w = max(20, int(fw * 0.08))
        max_w = min(fw - 4, int(fw * 0.95))
        if min_w >= max_w:
            return None

        scales = np.geomspace(min_w / max(1, self.template_w), max_w / max(1, self.template_w), num=10)

        best_val, best_loc, best_tw, best_th = -1.0, None, 0, 0
        for scale in scales:
            tw, th = int(self.template_w * scale), int(self.template_h * scale)
            if tw < 20 or th < 20 or tw >= fw or th >= fh:
                continue
            resized = cv2.resize(self.template_clahe, (tw, th), interpolation=cv2.INTER_AREA)
            result = cv2.matchTemplate(enhanced, resized, cv2.TM_CCOEFF_NORMED)
            _, max_val, _, max_loc = cv2.minMaxLoc(result)
            if max_val > best_val:
                best_val, best_loc, best_tw, best_th = max_val, max_loc, tw, th

        if best_val < self.match_threshold or best_loc is None:
            return None
        x, y = best_loc
        return (x, y, best_tw, best_th)

    def track(self, frame: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        """Returns the object's (x, y, w, h) bounding box in `frame`, or None
        if it wasn't found this frame."""
        self._frame_count += 1

        if self._tracker is not None:
            ok, box = self._tracker.update(frame)
            if ok:
                return tuple(map(int, box))
            self._tracker = None

        if self._frame_count % self.detect_interval == 0 or self._tracker is None:
            frame_gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            bbox = self._detect(frame_gray)
            if bbox is not None:
                tracker = self._create_tracker()
                if tracker is not None:
                    try:
                        tracker.init(frame, bbox)
                        self._tracker = tracker
                    except cv2.error:
                        self._tracker = None
                return bbox
        return None


def track_object(video_path: Path, template_path: Path, fps: float = 30.0) -> List[ObjectSample]:
    """Runs PlateTracker over every frame of the scene video, returning one
    sample per frame where the object was found."""
    tracker = PlateTracker(template_path)
    cap = cv2.VideoCapture(str(video_path))
    samples: List[ObjectSample] = []
    frame_idx = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            bbox = tracker.track(frame)
            if bbox is not None:
                x, y, w, h = bbox
                center_x = x + w / 2.0
                position = (center_x / frame.shape[1]) * 2.0 - 1.0
                samples.append(ObjectSample(time_seconds=frame_idx / fps, position=position))
            frame_idx += 1
    finally:
        cap.release()
    return samples


def build_object_position_fn(samples: List[ObjectSample]) -> Callable[[float], float]:
    """Turns a sparse list of object samples into a lookup by timestamp,
    snapping to the nearest sample — frames where the object wasn't found
    just reuse their closest neighbour instead of losing the point."""
    if not samples:
        return lambda _t: 0.0
    times = [s.time_seconds for s in samples]

    def lookup(t: float) -> float:
        idx = bisect.bisect_left(times, t)
        if idx == 0:
            return samples[0].position
        if idx >= len(samples):
            return samples[-1].position
        before, after = samples[idx - 1], samples[idx]
        if (t - before.time_seconds) <= (after.time_seconds - t):
            return before.position
        return after.position

    return lookup
