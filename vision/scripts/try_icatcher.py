import argparse
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from gaze.icatcher_adapter import run_icatcher


def detect_fps(video_path: Path) -> float:
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    return fps if fps and fps > 0 else 30.0


def main():
    parser = argparse.ArgumentParser(description="Roda o iCatcher+ num vídeo de olho real e mostra um resumo.")
    parser.add_argument("video", type=Path, help="Caminho do vídeo do olho (mp4, etc.)")
    parser.add_argument("--fps", type=float, default=None, help="FPS do vídeo (detecta automaticamente se não passar)")
    parser.add_argument(
        "--timestamps",
        type=Path,
        default=None,
        help="Sidecar .timestamps.csv gravado por capture.camera_source numa sessão ao vivo (usa o tempo real de cada frame em vez do fps).",
    )
    args = parser.parse_args()

    fps = args.fps or detect_fps(args.video)
    print(f"Rodando iCatcher+ em {args.video} ({fps:.1f} fps)...")

    samples = run_icatcher(args.video, fps=fps, timestamps_path=args.timestamps)

    counts = {}
    for s in samples:
        counts[s.label] = counts.get(s.label, 0) + 1

    print(f"\n{len(samples)} frames processados.")
    for label, count in sorted(counts.items(), key=lambda kv: -kv[1]):
        pct = 100 * count / len(samples) if samples else 0
        print(f"  {label:12s} {count:5d} ({pct:.1f}%)")


if __name__ == "__main__":
    main()
