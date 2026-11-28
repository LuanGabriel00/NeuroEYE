from gaze.icatcher_adapter import _parse_annotation


def test_parses_real_icatcher_output_format(tmp_path):
    annotation = tmp_path / "sample.txt"
    annotation.write_text(
        "0, noface, -1.00\n"
        "1, left, 0.92\n"
        "2, right, 0.81\n"
        "3, away, 0.60\n"
    )

    samples = _parse_annotation(annotation, fps=10.0)

    assert len(samples) == 4
    assert samples[1].time_seconds == 0.1
    assert samples[1].label == "left"
    assert samples[1].confidence == 0.92


def test_skips_blank_lines(tmp_path):
    annotation = tmp_path / "sample.txt"
    annotation.write_text("0, left, 0.9\n\n1, right, 0.8\n")

    samples = _parse_annotation(annotation, fps=10.0)

    assert len(samples) == 2
    assert samples[1].label == "right"


def test_uses_real_frame_times_when_given_instead_of_fps(tmp_path):
    annotation = tmp_path / "sample.txt"
    annotation.write_text("0, left, 0.9\n1, right, 0.8\n")
    # jittery real-world gap, not the 0.1s a fixed 10fps would assume
    frame_times = {0: 0.0, 1: 0.284}

    samples = _parse_annotation(annotation, fps=10.0, frame_times=frame_times)

    assert samples[0].time_seconds == 0.0
    assert samples[1].time_seconds == 0.284


def test_falls_back_to_fps_for_frames_missing_from_frame_times(tmp_path):
    annotation = tmp_path / "sample.txt"
    annotation.write_text("0, left, 0.9\n1, right, 0.8\n")
    frame_times = {0: 0.0}  # frame 1 missing on purpose

    samples = _parse_annotation(annotation, fps=10.0, frame_times=frame_times)

    assert samples[1].time_seconds == 0.1
