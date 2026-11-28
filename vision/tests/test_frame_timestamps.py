from frame_timestamps import HEADER, load


def test_loads_frame_index_to_time_mapping(tmp_path):
    path = tmp_path / "eye.timestamps.csv"
    path.write_text(HEADER + "0,0.000000\n1,0.033000\n2,0.071000\n")

    times = load(path)

    assert times == {0: 0.0, 1: 0.033, 2: 0.071}
