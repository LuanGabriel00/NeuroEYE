import os
from typing import List, Optional

import requests
from dotenv import load_dotenv

from mapping.gaze_mapper import TrackingPoint

load_dotenv()

DEFAULT_BASE_URL = "http://localhost:3000"


class DashboardClient:
    """Thin wrapper around the Next.js dashboard's own API. This is the only
    way the vision pipeline touches session data — it never talks to
    Postgres directly, so the dashboard stays the single owner of the DB."""

    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or os.environ.get("NEUROEYE_API_URL", DEFAULT_BASE_URL)
        self.session = requests.Session()

    def login(self, email: Optional[str] = None, password: Optional[str] = None):
        email = email or os.environ["NEUROEYE_EMAIL"]
        password = password or os.environ["NEUROEYE_PASSWORD"]
        response = self.session.post(
            f"{self.base_url}/api/auth/login",
            json={"email": email, "password": password},
        )
        response.raise_for_status()

    def finish_session(
        self,
        session_id: str,
        duration_seconds: int,
        tracking_points: List[TrackingPoint],
        tracking_accuracy: Optional[float] = None,
        avg_latency_ms: Optional[float] = None,
        saccade_count: Optional[int] = None,
        fixation_duration_ms: Optional[float] = None,
    ):
        body = {
            "durationSeconds": duration_seconds,
            "series": [
                {
                    "timeSeconds": p.time_seconds,
                    "objectPosition": p.object_position,
                    "eyePosition": p.eye_position,
                }
                for p in tracking_points
            ],
        }
        if tracking_accuracy is not None:
            body["trackingAccuracy"] = tracking_accuracy
        if avg_latency_ms is not None:
            body["avgLatencyMs"] = avg_latency_ms
        if saccade_count is not None:
            body["saccadeCount"] = saccade_count
        if fixation_duration_ms is not None:
            body["fixationDurationMs"] = fixation_duration_ms

        response = self.session.post(
            f"{self.base_url}/api/sessions/{session_id}/finish",
            json=body,
        )
        response.raise_for_status()
        return response.json()
