#!/usr/bin/env python3
"""Enrich turkey-frc-stats.json with full TBA and FIRST Inspires metadata:
schoolName, robotName, fullName, website, postalCode, districtCode, etc.
"""

from __future__ import annotations

import base64
from concurrent.futures import ThreadPoolExecutor, as_completed
import json
from pathlib import Path
import time
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "public" / "data" / "turkey-frc-stats.json"
ENV_PATH = ROOT / ".env"
TBA_BASE = "https://www.thebluealliance.com/api/v3"
FIRST_BASE = "https://frc-api.firstinspires.org/v3.0"
USER_AGENT = "HunterEyes/1.0 (Turkey FRC Stats Enricher)"


def load_env() -> dict[str, str]:
    if not ENV_PATH.exists():
        return {}
    env: dict[str, str] = {}
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip("'").strip('"')
    return env


def load_tba_key(env: dict[str, str]) -> str:
    for k in ("TBA_API_KEY", "TBA_AUTH_KEY", "VITE_TBA_API_KEY"):
        if env.get(k):
            return env[k]
    return ""


def load_first_auth(env: dict[str, str]) -> str:
    if env.get("FIRST_API_KEY") or env.get("VITE_FIRST_API_KEY"):
        return env.get("FIRST_API_KEY") or env.get("VITE_FIRST_API_KEY") or ""
    user = env.get("FIRST_API_USERNAME") or env.get("VITE_FIRST_API_USERNAME") or "darklightning"
    token = env.get("FIRST_API_TOKEN") or env.get("VITE_FIRST_API_TOKEN") or "2044fa5a-8019-4919-937c-06641bb0c2ad"
    return base64.b64encode(f"{user}:{token}".encode("utf-8")).decode("ascii")


def http_json(url: str, headers: dict[str, str], timeout: int = 10) -> object:
    req = urllib.request.Request(url, headers={**headers, "User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read().decode("utf-8")
            if not data.strip():
                return None
            return json.loads(data)
    except Exception:
        return None


def fetch_first_2026_teams(auth: str) -> dict[int, dict]:
    print("Fetching 2026 roster from FIRST Inspires API...")
    teams_by_num: dict[int, dict] = {}
    page = 1
    total_pages = 1
    while page <= total_pages:
        url = f"{FIRST_BASE}/2026/teams?page={page}"
        data = http_json(url, {"Authorization": f"Basic {auth}"})
        if not isinstance(data, dict):
            break
        total_pages = int(data.get("pageTotal") or total_pages)
        team_list = data.get("teams") or data.get("Teams") or []
        for t in team_list:
            if not isinstance(t, dict):
                continue
            num = int(t.get("teamNumber") or 0)
            if num:
                teams_by_num[num] = t
        if not team_list or page >= total_pages:
            break
        page += 1
    print(f"Fetched {len(teams_by_num)} teams from FIRST Inspires 2026 roster.")
    return teams_by_num


def main() -> None:
    if not DATA_PATH.exists():
        print(f"Error: {DATA_PATH} not found.")
        return

    bundle = json.loads(DATA_PATH.read_text("utf-8"))
    teams = bundle.get("teams", [])
    print(f"Loaded {len(teams)} teams from {DATA_PATH}")

    env = load_env()
    tba_key = load_tba_key(env)
    first_auth = load_first_auth(env)

    first_2026 = fetch_first_2026_teams(first_auth)

    print("Fetching TBA detailed profiles and robots for all Turkey teams...")
    tba_headers = {"X-TBA-Auth-Key": tba_key} if tba_key else {}

    def fetch_tba_meta(team_num: int) -> tuple[int, dict | None, list | None]:
        if not tba_key:
            return team_num, None, None
        team_info = http_json(f"{TBA_BASE}/team/frc{team_num}", tba_headers)
        robots_info = http_json(f"{TBA_BASE}/team/frc{team_num}/robots", tba_headers)
        return (
            team_num,
            team_info if isinstance(team_info, dict) else None,
            robots_info if isinstance(robots_info, list) else None,
        )

    tba_results: dict[int, tuple[dict | None, list | None]] = {}
    with ThreadPoolExecutor(max_workers=15) as pool:
        futures = {pool.submit(fetch_tba_meta, t["teamNumber"]): t["teamNumber"] for t in teams}
        done = 0
        for fut in as_completed(futures):
            t_num, info, robots = fut.result()
            tba_results[t_num] = (info, robots)
            done += 1
            if done % 50 == 0 or done == len(teams):
                print(f"  Processed {done}/{len(teams)} teams...")

    enriched_count = 0
    with_school = 0
    with_robot = 0
    with_fullname = 0
    with_website = 0

    for t in teams:
        num = t["teamNumber"]
        tba_info, tba_robots = tba_results.get(num, (None, None))
        first_info = first_2026.get(num)

        # School Name
        school = None
        if first_info and first_info.get("schoolName"):
            school = first_info["schoolName"].strip()
        elif tba_info and tba_info.get("school_name"):
            school = tba_info["school_name"].strip()
        if school:
            t["schoolName"] = school
            with_school += 1

        # Robot Name (FIRST official 2026 or latest from TBA robots)
        robot = None
        if first_info and first_info.get("robotName"):
            robot = first_info["robotName"].strip()
        elif tba_robots:
            valid_robots = [r for r in tba_robots if isinstance(r, dict) and r.get("robot_name")]
            if valid_robots:
                # Pick the latest year robot
                latest_robot = sorted(valid_robots, key=lambda r: int(r.get("year") or 0))[-1]
                robot = latest_robot.get("robot_name")
        if robot:
            t["robotName"] = robot.strip()
            with_robot += 1

        # Full Name / Sponsors
        full_name = None
        if first_info and first_info.get("nameFull"):
            full_name = first_info["nameFull"].strip()
        elif tba_info and tba_info.get("name"):
            full_name = tba_info["name"].strip()
        if full_name:
            t["fullName"] = full_name
            with_fullname += 1

        # Website
        website = None
        if tba_info and tba_info.get("website"):
            website = tba_info["website"].strip()
        elif first_info and first_info.get("website"):
            website = first_info["website"].strip()
        if website:
            t["website"] = website
            with_website += 1

        # Postal code
        if tba_info and tba_info.get("postal_code"):
            t["postalCode"] = tba_info["postal_code"].strip()

        # District code
        if first_info and first_info.get("districtCode"):
            t["districtCode"] = first_info["districtCode"].strip()

        # Preserve active status if team was active recently (2024-2026)
        if t.get("active") or (t.get("lastActiveYear") and t["lastActiveYear"] >= 2024):
            t["active"] = True

        t["source"] = "offline"
        enriched_count += 1

    bundle["generatedAt"] = int(time.time() * 1000)
    bundle["teams"] = teams

    DATA_PATH.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    size_kb = DATA_PATH.stat().st_size / 1024
    print("\n--- Enrichment Complete ---")
    print(f"Saved: {DATA_PATH} ({size_kb:.1f} KB)")
    print(f"Total teams: {len(teams)}")
    print(f"Teams with School Name: {with_school}/{len(teams)}")
    print(f"Teams with Robot Name: {with_robot}/{len(teams)}")
    print(f"Teams with Full Sponsor Name: {with_fullname}/{len(teams)}")
    print(f"Teams with Website: {with_website}/{len(teams)}")


if __name__ == "__main__":
    main()
