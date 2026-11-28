import csv

import cv2
import numpy as np

from capture.camera_source import MjpegRecorder


def _build_mjpeg_payload(n_frames=5, size=(64, 48)):
    frame = np.full((size[1], size[0], 3), 128, dtype=np.uint8)
    _, encoded = cv2.imencode(".jpg", frame)
    jpeg_bytes = encoded.tobytes()

    payload = bytearray()
    for _ in range(n_frames):
        header = f"Content-Type: image/jpeg\r\nContent-Length: {len(jpeg_bytes)}\r\n\r\n".encode()
        payload += header + jpeg_bytes + b"\r\n"
    return payload


def test_drain_frames_writes_every_frame_to_the_video(tmp_path):
    output_path = tmp_path / "out.mp4"
    recorder = MjpegRecorder(url="http://unused", output_path=output_path, fps=10)
    buf = _build_mjpeg_payload(n_frames=5)

    recorder._drain_frames(buf)
    recorder.close()

    cap = cv2.VideoCapture(str(output_path))
    count = 0
    while True:
        ok, _ = cap.read()
        if not ok:
            break
        count += 1
    cap.release()

    assert count == 5


def test_drain_frames_logs_a_timestamp_per_frame(tmp_path):
    output_path = tmp_path / "out.mp4"
    recorder = MjpegRecorder(url="http://unused", output_path=output_path, fps=10, start_time=0.0)
    buf = _build_mjpeg_payload(n_frames=4)

    recorder._drain_frames(buf)
    recorder.close()

    with recorder.timestamps_path.open() as f:
        rows = list(csv.DictReader(f))

    assert len(rows) == 4
    assert [int(r["frame_idx"]) for r in rows] == [0, 1, 2, 3]
    times = [float(r["time_seconds"]) for r in rows]
    assert times == sorted(times)
    assert all(t >= 0 for t in times)


def test_two_recorders_sharing_start_time_use_the_same_clock_origin(tmp_path):
    shared_start = 100.0
    eye = MjpegRecorder(url="http://unused", output_path=tmp_path / "eye.mp4", fps=10, start_time=shared_start)
    scene = MjpegRecorder(url="http://unused", output_path=tmp_path / "scene.mp4", fps=10, start_time=shared_start)

    eye._drain_frames(_build_mjpeg_payload(n_frames=1))
    scene._drain_frames(_build_mjpeg_payload(n_frames=1))
    eye.close()
    scene.close()

    assert eye.start_time == scene.start_time == shared_start


def test_drain_frames_holds_incomplete_frame_in_buffer(tmp_path):
    recorder = MjpegRecorder(url="http://unused", output_path=tmp_path / "out.mp4", fps=10)
    full_payload = _build_mjpeg_payload(n_frames=1)
    incomplete = bytearray(full_payload[:-20])

    recorder._drain_frames(incomplete)

    assert recorder._writer is None
    assert len(incomplete) > 0
