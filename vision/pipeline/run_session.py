import argparse
import time
from pathlib import Path

from capture.session_recorder import SessionRecorder, paths_for
from gaze.icatcher_adapter import run_icatcher
from mapping.calibration import load_calibration
from mapping.gaze_mapper import map_to_tracking_points
from mapping.target_zone import build_object_position_fn, track_object
from pipeline.api_client import DashboardClient


def record(session_id: str, eye_url: str, scene_url: str, duration_seconds: int):
    recorder = SessionRecorder(session_id, eye_url, scene_url)
    recorder.start()
    time.sleep(duration_seconds)
    recorder.stop()


def process(session_id: str, template_path: Path, profile: str = "default"):
    paths = paths_for(session_id)
    gaze_samples = run_icatcher(paths.eye_video)
    object_samples = track_object(paths.scene_video, template_path)
    object_position_fn = build_object_position_fn(object_samples)

    calibration = load_calibration(profile)
    points = map_to_tracking_points(gaze_samples, calibration, object_position_fn)

    client = DashboardClient()
    client.login()
    duration_seconds = int(points[-1].time_seconds) if points else 0
    return client.finish_session(session_id, duration_seconds, points)


def main():
    parser = argparse.ArgumentParser(description="Grava e processa sessões de rastreamento ocular.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    record_parser = subparsers.add_parser("record", help="Grava os dois streams de câmera durante a sessão.")
    record_parser.add_argument("session_id")
    record_parser.add_argument("--eye-url", required=True)
    record_parser.add_argument("--scene-url", required=True)
    record_parser.add_argument("--duration", type=int, required=True, help="Duração da gravação, em segundos.")

    process_parser = subparsers.add_parser(
        "process", help="Roda o iCatcher+ e o rastreamento do objeto numa sessão já gravada e envia o resultado pro dashboard."
    )
    process_parser.add_argument("session_id")
    process_parser.add_argument("--template", required=True, help="Foto de referência do objeto (ver mapping/target_zone.py).")
    process_parser.add_argument("--profile", default="default")

    args = parser.parse_args()
    if args.command == "record":
        record(args.session_id, args.eye_url, args.scene_url, args.duration)
    elif args.command == "process":
        result = process(args.session_id, Path(args.template), args.profile)
        print(result)


if __name__ == "__main__":
    main()
