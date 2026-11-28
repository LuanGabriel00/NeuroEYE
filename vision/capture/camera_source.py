import re
from pathlib import Path
from typing import Optional

import cv2
import numpy as np
import requests


class MjpegRecorder:
    """Reads an MJPEG HTTP stream (same framing used by the ESP32 firmware
    and by sync.py) and writes every frame to a video file until stopped."""

    def __init__(self, url: str, output_path: Path, fps: int = 20):
        self.url = url
        self.output_path = output_path
        self.fps = fps
        self._stop = False
        self._writer: Optional[cv2.VideoWriter] = None

    def stop(self):
        self._stop = True

    def run(self):
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        buf = bytearray()
        try:
            with requests.get(self.url, stream=True, timeout=5) as r:
                for chunk in r.iter_content(chunk_size=None):
                    if self._stop:
                        break
                    buf += chunk
                    self._drain_frames(buf)
        finally:
            if self._writer is not None:
                self._writer.release()

    def _drain_frames(self, buf: bytearray):
        while True:
            header_end = buf.find(b"\r\n\r\n")
            if header_end < 0:
                if len(buf) > (1 << 20):
                    buf.clear()
                return
            header = bytes(buf[:header_end]).decode("latin1")
            body_start = header_end + 4
            match = re.search(r"content-length:\s*(\d+)", header, re.I)
            if not match:
                del buf[:body_start]
                continue
            length = int(match.group(1))
            if len(buf) < body_start + length:
                return
            jpeg = bytes(buf[body_start : body_start + length])
            del buf[: body_start + length]
            self._write_frame(jpeg)

    def _write_frame(self, jpeg: bytes):
        frame = cv2.imdecode(np.frombuffer(jpeg, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            return
        if self._writer is None:
            h, w = frame.shape[:2]
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            self._writer = cv2.VideoWriter(str(self.output_path), fourcc, self.fps, (w, h))
        self._writer.write(frame)
