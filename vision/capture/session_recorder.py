import threading
import time
from dataclasses import dataclass
from pathlib import Path

from .camera_source import MjpegRecorder

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "sessions"


@dataclass
class SessionPaths:
    eye_video: Path
    scene_video: Path

    @property
    def eye_timestamps(self) -> Path:
        return self.eye_video.with_suffix(".timestamps.csv")

    @property
    def scene_timestamps(self) -> Path:
        return self.scene_video.with_suffix(".timestamps.csv")


def session_dir(session_id: str) -> Path:
    return DATA_DIR / session_id


def paths_for(session_id: str) -> SessionPaths:
    base = session_dir(session_id)
    return SessionPaths(eye_video=base / "eye.mp4", scene_video=base / "scene.mp4")


class SessionRecorder:
    """Records the eye and scene camera streams in parallel for one session,
    sharing a single clock origin (`start_time`) between both recorders so
    their timestamp logs stay comparable even if the two cameras deliver
    frames at different, jittery rates over Wi-Fi."""

    def __init__(self, session_id: str, eye_url: str, scene_url: str):
        self.paths = paths_for(session_id)
        start_time = time.monotonic()
        self._eye = MjpegRecorder(eye_url, self.paths.eye_video, start_time=start_time)
        self._scene = MjpegRecorder(scene_url, self.paths.scene_video, start_time=start_time)
        self._threads: list[threading.Thread] = []

    def start(self):
        self._threads = [
            threading.Thread(target=self._eye.run, daemon=True),
            threading.Thread(target=self._scene.run, daemon=True),
        ]
        for t in self._threads:
            t.start()

    def stop(self):
        self._eye.stop()
        self._scene.stop()
        for t in self._threads:
            t.join(timeout=5)
