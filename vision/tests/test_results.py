import csv

from mapping.gaze_mapper import TrackingPoint
from pipeline.results import save_csv, save_plot, summarize


def _sample_points():
    return [
        TrackingPoint(time_seconds=0.0, object_position=-1.0, eye_position=-1.0),
        TrackingPoint(time_seconds=1.0, object_position=0.0, eye_position=0.5),
        TrackingPoint(time_seconds=2.0, object_position=1.0, eye_position=1.0),
    ]


def test_save_csv_writes_one_row_per_point(tmp_path):
    path = save_csv(_sample_points(), tmp_path)

    with path.open() as f:
        rows = list(csv.DictReader(f))

    assert len(rows) == 3
    assert rows[1]["object_position"] == "0.0"
    assert rows[1]["eye_position"] == "0.5"


def test_summarize_reports_count_duration_and_average_diff():
    text = summarize(_sample_points())

    assert "3 pontos" in text
    assert "2.0s" in text


def test_summarize_handles_empty_points():
    text = summarize([])

    assert "Nenhum ponto" in text


def test_save_plot_creates_a_png_file(tmp_path):
    path = save_plot(_sample_points(), tmp_path)

    assert path.exists()
    assert path.suffix == ".png"
