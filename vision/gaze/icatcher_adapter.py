import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import List


@dataclass
class GazeSample:
    time_seconds: float
    label: str  # "left" | "right" | "away" | "noface"
    confidence: float


def run_icatcher(video_path: Path, fps: float = 30.0, gpu_id: int = -1) -> List[GazeSample]:
    """Runs iCatcher+ on a recorded face video and returns one label per frame.

    iCatcher+'s pip package is inference-only (no stable importable API), so
    we shell out to its own CLI and parse the annotation file it writes to
    --output_annotation, instead of calling into its internals directly.
    """
    output_dir = video_path.parent
    annotation_path = output_dir / f"{video_path.stem}.txt"

    subprocess.run(
        [
            "icatcher",
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
    return _parse_annotation(annotation_path, fps)


def _parse_annotation(annotation_path: Path, fps: float) -> List[GazeSample]:
    samples: List[GazeSample] = []
    with annotation_path.open() as f:
        for line in f:
            if not line.strip():
                continue
            frame_idx, label, confidence = (part.strip() for part in line.split(","))
            samples.append(
                GazeSample(
                    time_seconds=int(frame_idx) / fps,
                    label=label,
                    confidence=float(confidence),
                )
            )
    return samples
