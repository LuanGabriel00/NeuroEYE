import argparse
import sys
from pathlib import Path

import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from mapping.target_zone import track_object


def detect_fps(video_path: Path) -> float:
    cap = cv2.VideoCapture(str(video_path))
    fps = cap.get(cv2.CAP_PROP_FPS)
    cap.release()
    return fps if fps and fps > 0 else 30.0


def main():
    parser = argparse.ArgumentParser(description="Roda o rastreamento do objeto num vídeo de cena real.")
    parser.add_argument("video", type=Path, help="Caminho do vídeo da cena (mp4, etc.)")
    parser.add_argument("--template", type=Path, required=True, help="Foto de referência do objeto")
    parser.add_argument("--fps", type=float, default=None)
    args = parser.parse_args()

    fps = args.fps or detect_fps(args.video)
    print(f"Rastreando objeto em {args.video} ({fps:.1f} fps)...")

    samples = track_object(args.video, args.template, fps=fps)

    cap = cv2.VideoCapture(str(args.video))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    cap.release()

    print(f"\nObjeto encontrado em {len(samples)}/{total_frames} frames.")
    if samples:
        print(f"  posição inicial: {samples[0].position:.2f}")
        print(f"  posição final:   {samples[-1].position:.2f}")
    else:
        print("  Nenhuma detecção - confira o template (muito recortado? cor/luz muito diferente do vídeo?).")


if __name__ == "__main__":
    main()
