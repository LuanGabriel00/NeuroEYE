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
    recorder._writer.release()

    cap = cv2.VideoCapture(str(output_path))
    count = 0
    while True:
        ok, _ = cap.read()
        if not ok:
            break
        count += 1
    cap.release()

    assert count == 5


def test_drain_frames_holds_incomplete_frame_in_buffer():
    recorder = MjpegRecorder(url="http://unused", output_path=None, fps=10)
    full_payload = _build_mjpeg_payload(n_frames=1)
    incomplete = bytearray(full_payload[:-20])

    recorder._drain_frames(incomplete)

    assert recorder._writer is None
    assert len(incomplete) > 0
