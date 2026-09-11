"""
api_fetch.py — The Blue Alliance helpers for RobotDetector
==========================================================
Uses TBA_AUTH_KEY / TBA_API_KEY / VITE_TBA_API_KEY from the environment
(or a .env file at the project root / web/.env).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Optional

import requests

PROJECT_ROOT = Path(__file__).resolve().parents[1]


def _load_dotenv() -> None:
    """Lightweight .env loader (no python-dotenv dependency required)."""
    for candidate in (
        PROJECT_ROOT / ".env",
        PROJECT_ROOT / "web" / ".env",
    ):
        if not candidate.exists():
            continue
        for line in candidate.read_text().splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            os.environ.setdefault(key, value)


_load_dotenv()


def get_tba_auth_key() -> str:
    return (
        os.environ.get("TBA_AUTH_KEY")
        or os.environ.get("TBA_API_KEY")
        or os.environ.get("VITE_TBA_API_KEY")
        or ""
    ).strip()


def fetch_match_alliances(match_key: str, auth_key: Optional[str] = None) -> tuple[list[str], list[str]]:
    """
    Returns (red_team_numbers, blue_team_numbers) as digit strings.
    Raises RuntimeError on failure.
    """
    key = (auth_key or get_tba_auth_key()).strip()
    if not key:
        raise RuntimeError(
            "No TBA API key. Set TBA_AUTH_KEY / TBA_API_KEY / VITE_TBA_API_KEY in the environment or web/.env"
        )

    url = f"https://www.thebluealliance.com/api/v3/match/{match_key}"
    headers = {"X-TBA-Auth-Key": key, "Accept": "application/json"}
    response = requests.get(url, headers=headers, timeout=30)

    if response.status_code == 401:
        raise RuntimeError("TBA 401 Unauthorized — check your API key")
    if response.status_code == 404:
        raise RuntimeError(f"TBA 404 — match '{match_key}' not found")
    if response.status_code != 200:
        raise RuntimeError(f"TBA error {response.status_code}: {response.text[:200]}")

    data = response.json()
    red = [t[3:] if t.startswith("frc") else t for t in data["alliances"]["red"]["team_keys"]]
    blue = [t[3:] if t.startswith("frc") else t for t in data["alliances"]["blue"]["team_keys"]]
    return red, blue


def test_tba_api(match_key: str) -> None:
    print(f"📡 Testing TBA connection for: {match_key}...\n")
    try:
        red, blue = fetch_match_alliances(match_key)
        print("✅ CONNECTION SUCCESSFUL!\n")
        print("🔴 RED ALLIANCE: ", red)
        print("🔵 BLUE ALLIANCE:", blue)
    except Exception as e:
        print(f"❌ {e}")


def fetch_zebra_motionworks(match_key: str):
    print(f"🦓 Fetching Zebra MotionWorks for: {match_key}...\n")
    key = get_tba_auth_key()
    if not key:
        print("❌ No TBA API key configured")
        return None

    url = f"https://www.thebluealliance.com/api/v3/match/{match_key}/zebra_motionworks"
    headers = {"X-TBA-Auth-Key": key, "Accept": "application/json"}

    try:
        response = requests.get(url, headers=headers, timeout=60)
        if response.status_code != 200:
            print(f"❌ ERROR {response.status_code}")
            return None
        data = response.json()
        if not data:
            print(f"⚠️ Zebra data not available for '{match_key}'.")
            return None
        print("✅ Zebra data retrieved")
        print(json.dumps({k: data[k] for k in ("key",) if k in data}, indent=2))
        return data
    except requests.exceptions.RequestException as e:
        print(f"🚨 NETWORK ERROR: {e}")
        return None


if __name__ == "__main__":
    match_key = sys.argv[1] if len(sys.argv) > 1 else None
    if not match_key:
        print("Usage: python src/api_fetch.py <tba_match_key>")
        sys.exit(1)
    if not get_tba_auth_key():
        print("⚠️ Set TBA_AUTH_KEY or VITE_TBA_API_KEY first")
    else:
        test_tba_api(match_key)
        print("\n" + "=" * 50 + "\n")
        fetch_zebra_motionworks(match_key)
