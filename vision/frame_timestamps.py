import csv
from pathlib import Path
from typing import Dict

HEADER = "frame_idx,time_seconds\n"


def load(path: Path) -> Dict[int, float]:
    """Reads a timestamps sidecar file written by capture.camera_source,
    mapping each recorded frame index to its real arrival time (seconds
    since the session's shared clock origin)."""
    times: Dict[int, float] = {}
    with path.open() as f:
        reader = csv.DictReader(f)
        for row in reader:
            times[int(row["frame_idx"])] = float(row["time_seconds"])
    return times
