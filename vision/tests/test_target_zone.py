import cv2
import numpy as np

from mapping.target_zone import ObjectSample, PlateTracker, build_object_position_fn, track_object


def _make_template(tmp_path, size=30):
    tpl = np.full((size, size, 3), 255, dtype=np.uint8)
    cv2.rectangle(tpl, (2, 2), (size - 2, size - 2), (20, 20, 200), -1)
    path = tmp_path / "template.png"
    cv2.imwrite(str(path), tpl)
    return path


def _make_scene_video(tmp_path, n_frames=30, width=320, height=240, obj_size=30):
    path = tmp_path / "scene.mp4"
    writer = cv2.VideoWriter(str(path), cv2.VideoWriter_fourcc(*"mp4v"), 20, (width, height))
    for i in range(n_frames):
        frame = np.full((height, width, 3), 255, dtype=np.uint8)
        x = int(10 + (width - obj_size - 20) * (i / (n_frames - 1)))
        y = height // 2 - obj_size // 2
        cv2.rectangle(frame, (x, y), (x + obj_size, y + obj_size), (20, 20, 200), -1)
        writer.write(frame)
    writer.release()
    return path


def test_tracks_object_moving_left_to_right(tmp_path):
    template_path = _make_template(tmp_path)
    video_path = _make_scene_video(tmp_path)

    samples = track_object(video_path, template_path, fps=20.0)

    assert len(samples) >= 25
    assert samples[0].position < 0
    assert samples[-1].position > 0
    assert samples[0].position < samples[-1].position


def test_plate_tracker_returns_none_when_object_absent(tmp_path):
    template_path = _make_template(tmp_path)
    blank = np.full((240, 320, 3), 255, dtype=np.uint8)

    tracker = PlateTracker(template_path)
    assert tracker.track(blank) is None


def test_build_object_position_fn_snaps_to_nearest_sample():
    samples = [
        ObjectSample(time_seconds=0.0, position=-1.0),
        ObjectSample(time_seconds=1.0, position=0.0),
        ObjectSample(time_seconds=2.0, position=1.0),
    ]
    fn = build_object_position_fn(samples)

    assert fn(0.0) == -1.0
    assert fn(0.4) == -1.0
    assert fn(0.6) == 0.0
    assert fn(2.0) == 1.0
    assert fn(5.0) == 1.0


def test_build_object_position_fn_defaults_to_center_when_empty():
    fn = build_object_position_fn([])
    assert fn(0.0) == 0.0
    assert fn(10.0) == 0.0
