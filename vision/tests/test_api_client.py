from unittest.mock import MagicMock, patch

from mapping.gaze_mapper import TrackingPoint
from pipeline.api_client import DashboardClient


def _mock_response(json_data):
    response = MagicMock()
    response.json.return_value = json_data
    response.raise_for_status.return_value = None
    return response


def test_login_posts_credentials():
    client = DashboardClient(base_url="http://localhost:3000")

    with patch.object(client.session, "post", return_value=_mock_response({})) as post:
        client.login(email="doc@example.com", password="secret")

    post.assert_called_once_with(
        "http://localhost:3000/api/auth/login",
        json={"email": "doc@example.com", "password": "secret"},
    )


def test_finish_session_builds_expected_body():
    client = DashboardClient(base_url="http://localhost:3000")
    points = [TrackingPoint(time_seconds=0.0, object_position=0.0, eye_position=-1.0)]

    with patch.object(client.session, "post", return_value=_mock_response({"session": {}})) as post:
        client.finish_session(
            "sess123",
            duration_seconds=10,
            tracking_points=points,
            tracking_accuracy=80.0,
        )

    post.assert_called_once_with(
        "http://localhost:3000/api/sessions/sess123/finish",
        json={
            "durationSeconds": 10,
            "series": [{"timeSeconds": 0.0, "objectPosition": 0.0, "eyePosition": -1.0}],
            "trackingAccuracy": 80.0,
        },
    )


def test_finish_session_omits_optional_fields_when_not_given():
    client = DashboardClient(base_url="http://localhost:3000")

    with patch.object(client.session, "post", return_value=_mock_response({})) as post:
        client.finish_session("sess123", duration_seconds=5, tracking_points=[])

    body = post.call_args.kwargs["json"]
    assert "trackingAccuracy" not in body
    assert "avgLatencyMs" not in body
    assert "saccadeCount" not in body
    assert "fixationDurationMs" not in body
