import re
import sys
import threading
import time
from collections import deque

import cv2
import numpy as np
import requests
from flask import Flask, Response

MAX_DIFF_US = 50_000     # acima disso o par é descartado
WAIT_S = 0.08            # espera máxima pelo frame da outra câmera
OUT_QUALITY = 80


class Source:
    def __init__(self, name, url):
        self.name = name
        self.url = url
        self.frames = deque(maxlen=16)   # (ts_us, chegada_monotonica, jpeg)
        self.count = 0
        self.bytes = 0


cond = threading.Condition()             # protege as duas fontes
out_cond = threading.Condition()         # protege o frame combinado
out = {"jpeg": None, "seq": 0}

A = Source("A", sys.argv[1] if len(sys.argv) > 1 else "")
B = Source("B", sys.argv[2] if len(sys.argv) > 2 else "")


def reader(src):
    """Lê o stream MJPEG e separa os frames pelo Content-Length."""
    while True:
        try:
            print(f"[cam {src.name}] conectando em {src.url}", file=sys.stderr)
            with requests.get(src.url, stream=True, timeout=5) as r:
                buf = bytearray()
                for chunk in r.iter_content(chunk_size=None):
                    buf += chunk
                    while True:
                        he = buf.find(b"\r\n\r\n")
                        if he < 0:
                            if len(buf) > (1 << 20):
                                buf.clear()
                            break
                        hdr = bytes(buf[:he]).decode("latin1")
                        body = he + 4
                        m = re.search(r"content-length:\s*(\d+)", hdr, re.I)
                        if not m:
                            del buf[:body]
                            continue
                        n = int(m.group(1))
                        if len(buf) < body + n:
                            break
                        jpeg = bytes(buf[body:body + n])
                        t = re.search(r"x-timestamp:\s*(\d+)", hdr, re.I)
                        ts = int(t.group(1)) if t else time.time_ns() // 1000
                        del buf[:body + n]
                        with cond:
                            src.frames.append((ts, time.monotonic(), jpeg))
                            src.count += 1
                            src.bytes += n
                            cond.notify_all()
        except Exception as e:
            print(f"[cam {src.name}] erro: {e}", file=sys.stderr)
        time.sleep(1)


def pad_to(img, h):
    if img.shape[0] == h:
        return img
    return cv2.copyMakeBorder(img, 0, h - img.shape[0], 0, 0, cv2.BORDER_CONSTANT)


def pairer():
    last_a = 0
    t0 = time.monotonic()
    n_pairs, sum_dt, drops = 0, 0, 0

    while True:
        now = time.monotonic()
        if now - t0 >= 2.0:
            secs = now - t0
            with cond:
                fa_, fb_ = A.count / secs, B.count / secs
                ka = A.bytes / 1024 / A.count if A.count else 0
                kb = B.bytes / 1024 / B.count if B.count else 0
                A.count = B.count = A.bytes = B.bytes = 0
            print(f"A: {fa_:.1f} fps {ka:.0f} KB/frame | B: {fb_:.1f} fps {kb:.0f} KB/frame | "
                  f"pares/s: {n_pairs / secs:.1f} | |dt| medio: "
                  f"{(sum_dt / n_pairs / 1000) if n_pairs else 0:.1f} ms | descartados: {drops}",
                  file=sys.stderr)
            t0, n_pairs, sum_dt, drops = now, 0, 0, 0

        with cond:
            novos = [f for f in A.frames if f[0] > last_a]
            if not novos or not B.frames:
                cond.wait(0.02)
                continue
            fa = min(novos, key=lambda f: f[0])
            newest_b = max(f[0] for f in B.frames)
            if newest_b < fa[0] and time.monotonic() - fa[1] < WAIT_S:
                cond.wait(0.005)
                continue
            fb = min(B.frames, key=lambda f: abs(f[0] - fa[0]))
            last_a = fa[0]
            dt = fb[0] - fa[0]
            if abs(dt) > MAX_DIFF_US:
                drops += 1
                continue

        ia = cv2.imdecode(np.frombuffer(fa[2], np.uint8), cv2.IMREAD_COLOR)
        ib = cv2.imdecode(np.frombuffer(fb[2], np.uint8), cv2.IMREAD_COLOR)
        if ia is None or ib is None:
            continue

        # >>> aqui entra o rastreamento de pupila, sobre ia e ib já decodificados <<<

        h = max(ia.shape[0], ib.shape[0])
        canvas = np.hstack((pad_to(ia, h), pad_to(ib, h)))
        ok, enc = cv2.imencode(".jpg", canvas, [cv2.IMWRITE_JPEG_QUALITY, OUT_QUALITY])
        if not ok:
            continue

        with out_cond:
            out["jpeg"] = enc.tobytes()
            out["seq"] += 1
            out_cond.notify_all()
        n_pairs += 1
        sum_dt += abs(dt)


app = Flask(__name__)


@app.route("/")
def index():
    return ('<!doctype html><html><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1">'
            '<title>Cameras sincronizadas</title></head>'
            '<body style="margin:0;background:#111">'
            '<img src="/stream" style="width:100%;display:block;margin:auto">'
            '</body></html>')


@app.route("/stream")
def stream():
    def gen():
        last = 0
        while True:
            with out_cond:
                while out["seq"] == last:
                    out_cond.wait(1.0)
                jpeg, last = out["jpeg"], out["seq"]
            yield (b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: "
                   + str(len(jpeg)).encode() + b"\r\n\r\n" + jpeg + b"\r\n")
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame",
                    headers={"Cache-Control": "no-store"})


if __name__ == "__main__":
    if len(sys.argv) < 3:
        sys.exit("uso: python pair_server.py URL_CAM_A URL_CAM_B [porta]\n"
                 "ex.: python pair_server.py http://192.168.0.50/stream http://192.168.0.51/stream 8080")
    port = int(sys.argv[3]) if len(sys.argv) > 3 else 8080
    for s in (A, B):
        threading.Thread(target=reader, args=(s,), daemon=True).start()
    threading.Thread(target=pairer, daemon=True).start()
    app.run(host="0.0.0.0", port=port, threaded=True)
