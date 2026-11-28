from pathlib import Path
from unittest.mock import MagicMock

import pipeline.run_session as run_session
from gaze.icatcher_adapter import GazeSample


def test_process_wires_gaze_and_object_tracking_into_dashboard_call(monkeypatch, tmp_path):
    fake_paths = MagicMock(eye_video=tmp_path / "eye.mp4", scene_video=tmp_path / "scene.mp4")
    monkeypatch.setattr(run_session, "paths_for", lambda session_id: fake_paths)
    monkeypatch.setattr(
        run_session,
        "run_icatcher",
        lambda video, timestamps_path=None: [GazeSample(time_seconds=0.0, label="left", confidence=0.9)],
    )
    monkeypatch.setattr(run_session, "track_object", lambda video, template, timestamps_path=None: [])

    fake_client = MagicMock()
    monkeypatch.setattr(run_session, "DashboardClient", lambda: fake_client)

    run_session.process("session123", Path("template.jpg"))

    fake_client.login.assert_called_once()
    assert fake_client.finish_session.called
    args, _ = fake_client.finish_session.call_args
    assert args[0] == "session123"


def test_process_reports_zero_duration_when_no_points_found(monkeypatch, tmp_path):
    fake_paths = MagicMock(eye_video=tmp_path / "eye.mp4", scene_video=tmp_path / "scene.mp4")
    monkeypatch.setattr(run_session, "paths_for", lambda session_id: fake_paths)
    monkeypatch.setattr(run_session, "run_icatcher", lambda video, timestamps_path=None: [])
    monkeypatch.setattr(run_session, "track_object", lambda video, template, timestamps_path=None: [])

    fake_client = MagicMock()
    monkeypatch.setattr(run_session, "DashboardClient", lambda: fake_client)

    run_session.process("session123", Path("template.jpg"))

    _, kwargs = fake_client.finish_session.call_args
    args, _ = fake_client.finish_session.call_args
    assert args[1] == 0
