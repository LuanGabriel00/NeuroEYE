import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from frame_timestamps import load as load_frame_times


def _icatcher_executable() -> str:
    """Resolves the `icatcher` console script next to the Python interpreter
    actually running this process, instead of relying on PATH — the venv's
    Scripts/bin dir is only on PATH when it's been activated, and this
    pipeline is meant to run fine without activating it (just calling
    `.venv/Scripts/python ...` directly)."""
    bin_dir = Path(sys.executable).parent
    for name in ("icatcher.exe", "icatcher"):
        candidate = bin_dir / name
        if candidate.exists():
            return str(candidate)
    return "icatcher"


@dataclass
class GazeSample:
    time_seconds: float
    label: str  # "left" | "right" | "away" | "noface" | "nobabyface" | "none"
    confidence: float


def run_icatcher(
    video_path: Path,
    fps: float = 30.0,
    timestamps_path: Optional[Path] = None,
    gpu_id: int = -1,
) -> List[GazeSample]:
    """Runs iCatcher+ on a recorded face video and returns one label per frame.

    iCatcher+'s pip package is inference-only (no stable importable API), so
    we shell out to its own CLI and parse the annotation file it writes to
    --output_annotation, instead of calling into its internals directly.

    `timestamps_path` is the sidecar `.timestamps.csv` that
    capture.camera_source writes during a live recording — when given, each
    frame's real arrival time is used instead of assuming a fixed `fps`,
    which matters once this is matched up against the scene video's object
    positions (see mapping.target_zone).
    """
    output_dir = video_path.parent
    annotation_path = output_dir / f"{video_path.stem}.txt"

    subprocess.run(
        [
            _icatcher_executable(),
            str(video_path),
            "--source_type",
            "file",
            "--gpu_id",
            str(gpu_id),
            "--output_annotation",
            str(output_dir),
            "--output_format",
            "raw_output",
            "--overwrite",
        ],
        check=True,
    )

    frame_times = load_frame_times(timestamps_path) if timestamps_path and timestamps_path.exists() else None
    return _parse_annotation(annotation_path, fps, frame_times)


def _parse_annotation(
    annotation_path: Path, fps: float, frame_times: Optional[Dict[int, float]] = None
) -> List[GazeSample]:
    samples: List[GazeSample] = []
    with annotation_path.open() as f:
        for line in f:
            if not line.strip():
                continue
            frame_idx, label, confidence = (part.strip() for part in line.split(","))
            idx = int(frame_idx)
            time_seconds = frame_times[idx] if frame_times and idx in frame_times else idx / fps
            samples.append(GazeSample(time_seconds=time_seconds, label=label, confidence=float(confidence)))
    return samples
