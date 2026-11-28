import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

PROFILES_DIR = Path(__file__).resolve().parent / "profiles"

# Starting guess only: maps iCatcher+'s categorical labels to the -1..1
# horizontal scale the dashboard's TrackingPoint.eyePosition expects. Needs
# tuning against real calibration sessions once we have them. iCatcher+ only
# ever emits left/right/away/noface/nobabyface/none (see icatcher.classes) —
# away and the no-detection labels are left unmapped on purpose, so they get
# skipped by gaze_mapper instead of faking a position.
DEFAULT_LABEL_POSITIONS = {
    "left": -1.0,
    "right": 1.0,
}


@dataclass
class Calibration:
    label_positions: dict = field(default_factory=lambda: dict(DEFAULT_LABEL_POSITIONS))

    def eye_position(self, label: str) -> Optional[float]:
        return self.label_positions.get(label)


def load_calibration(profile: str = "default") -> Calibration:
    path = PROFILES_DIR / f"{profile}.json"
    if not path.exists():
        return Calibration()
    with path.open() as f:
        data = json.load(f)
    return Calibration(label_positions=data.get("label_positions", DEFAULT_LABEL_POSITIONS))
