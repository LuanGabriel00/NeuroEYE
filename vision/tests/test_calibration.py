import json

import mapping.calibration as calibration_module
from mapping.calibration import Calibration, load_calibration


def test_default_calibration_maps_left_and_right_only():
    calibration = Calibration()

    assert calibration.eye_position("left") == -1.0
    assert calibration.eye_position("right") == 1.0
    assert calibration.eye_position("away") is None
    assert calibration.eye_position("noface") is None


def test_load_calibration_falls_back_to_default_when_profile_missing():
    calibration = load_calibration("does-not-exist")

    assert calibration.eye_position("left") == -1.0
    assert calibration.eye_position("right") == 1.0


def test_load_calibration_reads_profile_file(tmp_path, monkeypatch):
    monkeypatch.setattr(calibration_module, "PROFILES_DIR", tmp_path)
    (tmp_path / "custom.json").write_text(
        json.dumps({"label_positions": {"left": -0.5, "right": 0.5}})
    )

    calibration = load_calibration("custom")

    assert calibration.eye_position("left") == -0.5
    assert calibration.eye_position("right") == 0.5
