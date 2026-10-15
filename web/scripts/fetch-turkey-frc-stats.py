#!/usr/bin/env python3
"""Build the compact Turkey FRC stats bundle used for offline Statistics."""

from __future__ import annotations

import json
import subprocess
import time
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "public" / "data" / "turkey-frc-stats.json"
ENV_PATH = ROOT / ".env"
STATBOTICS_BASE = "https://api-statbotics.iterativerefinement.com/v3"
TBA_BASE = "https://www.thebluealliance.com/api/v3"
COUNTRIES = ("Turkey", "Türkiye")
USER_AGENT = "HunterEyes/1.0 (Turkey FRC stats bundle)"


def load_tba_key() -> str:
    if not ENV_PATH.exists():
        return ""
    for line in ENV_PATH.read_text().splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        value = value.strip().strip("'").strip('"')
        if key in {"TBA_API_KEY", "TBA_AUTH_KEY", "VITE_TBA_API_KEY"} and value:
            return value
    return ""


def curl_json(url: str, headers: list[str] | None = None) -> object:
    cmd = ["curl", "-sS", "-A", USER_AGENT, url]
    for header in headers or []:
        cmd.extend(["-H", header])
    raw = subprocess.check_output(cmd)
    if not raw.strip():
        return None
    return json.loads(raw)


def number(value: object) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        parsed = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return parsed


def compact_record(raw: object) -> dict[str, float | int] | None:
    if not isinstance(raw, dict):
        return None
    wins = int(number(raw.get("wins")) or 0)
    losses = int(number(raw.get("losses")) or 0)
    ties = int(number(raw.get("ties")) or 0)
    count = int(number(raw.get("count")) or (wins + losses + ties))
    winrate = number(raw.get("winrate"))
    if winrate is None and count:
        winrate = (wins + 0.5 * ties) / count
    return {
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "count": count,
        "winrate": round(winrate or 0, 4),
    }


def flatten_numbers(raw: object, prefix: str = "") -> dict[str, float]:
    out: dict[str, float] = {}
    if not isinstance(raw, dict):
        return out
    for key, value in raw.items():
        path = f"{prefix}.{key}" if prefix else str(key)
        if isinstance(value, dict):
            out.update(flatten_numbers(value, path))
        else:
            parsed = number(value)
            if parsed is not None:
                out[path] = round(parsed, 4) if abs(parsed) >= 0.0001 else parsed
    return out


def compact_year(raw: dict) -> dict:
    epa = raw.get("epa") if isinstance(raw.get("epa"), dict) else {}
    breakdown_src = epa.get("breakdown") if isinstance(epa.get("breakdown"), dict) else {}
    stats = epa.get("stats") if isinstance(epa.get("stats"), dict) else {}
    ranks = epa.get("ranks") if isinstance(epa.get("ranks"), dict) else {}
    total_rank = ranks.get("total") if isinstance(ranks.get("total"), dict) else {}
    country_rank = ranks.get("country") if isinstance(ranks.get("country"), dict) else {}
    return {
        "year": int(raw.get("year") or 0),
        "name": raw.get("name") or None,
        "epaTotal": number(epa.get("total_points")),
        "epaNorm": number(epa.get("norm")),
        "epaUnitless": number(epa.get("unitless")),
        "epaAuto": number(breakdown_src.get("auto_points")),
        "epaTeleop": number(breakdown_src.get("teleop_points")),
        "epaEndgame": number(breakdown_src.get("endgame_points")),
        "epaMax": number(stats.get("max")),
        "breakdown": flatten_numbers(breakdown_src),
        "record": compact_record(raw.get("record")),
        "ranks": {
            "worldRank": int(number(total_rank.get("rank")) or 0) or None,
            "worldPercentile": number(total_rank.get("percentile")),
            "countryRank": int(number(country_rank.get("rank")) or 0) or None,
            "countryPercentile": number(country_rank.get("percentile")),
        },
    }


def fetch_teams() -> dict[int, dict]:
    teams: dict[int, dict] = {}
    for country in COUNTRIES:
        for active in ("true", "false"):
            offset = 0
            while True:
                query = urllib.parse.urlencode(
                    {
                        "country": country,
                        "active": active,
                        "limit": 1000,
                        "offset": offset,
                    }
                )
                payload = curl_json(f"{STATBOTICS_BASE}/teams?{query}")
                rows = payload if isinstance(payload, list) else []
                if not rows:
                    break
                for row in rows:
                    if not isinstance(row, dict):
                        continue
                    team = int(row.get("team") or 0)
                    if team <= 0:
                        continue
                    existing = teams.get(team, {})
                    norm = row.get("norm_epa") if isinstance(row.get("norm_epa"), dict) else {}
                    teams[team] = {
                        "teamNumber": team,
                        "name": row.get("name") or existing.get("name") or f"Team {team}",
                        "country": row.get("country") or existing.get("country") or country,
                        "state": row.get("state") or existing.get("state"),
                        "rookieYear": row.get("rookie_year") or existing.get("rookieYear"),
                        "active": bool(row.get("active")) or bool(existing.get("active")),
                        "lastActiveYear": row.get("last_active_year")
                        or existing.get("lastActiveYear"),
                        "careerRecord": compact_record(row.get("record"))
                        or existing.get("careerRecord"),
                        "normEpa": {
                            "current": number(norm.get("current")),
                            "recent": number(norm.get("recent")),
                            "mean": number(norm.get("mean")),
                            "max": number(norm.get("max")),
                        },
                        "years": existing.get("years") or [],
                        "source": "offline",
                    }
                if len(rows) < 1000:
                    break
                offset += 1000
    return teams


def attach_years(teams: dict[int, dict]) -> None:
    years_by_team: dict[int, list[dict]] = {team: [] for team in teams}
    for country in COUNTRIES:
        offset = 0
        while True:
            query = urllib.parse.urlencode(
                {"country": country, "limit": 1000, "offset": offset, "metric": "year"}
            )
            payload = curl_json(f"{STATBOTICS_BASE}/team_years?{query}")
            rows = payload if isinstance(payload, list) else []
            if not rows:
                break
            for row in rows:
                if not isinstance(row, dict):
                    continue
                team = int(row.get("team") or 0)
                if team not in years_by_team:
                    continue
                years_by_team[team].append(compact_year(row))
            if len(rows) < 1000:
                break
            offset += 1000

    for team, years in years_by_team.items():
        unique: dict[int, dict] = {}
        for year in years:
            unique[int(year["year"])] = year
        teams[team]["years"] = [unique[year] for year in sorted(unique)]


def attach_tba_locations(teams: dict[int, dict], tba_key: str) -> None:
    if not tba_key:
        print("No TBA API key found; city/state will be missing.")
        return
    for index, team in enumerate(sorted(teams)):
        url = f"{TBA_BASE}/team/frc{team}/simple"
        try:
            payload = curl_json(url, headers=[f"X-TBA-Auth-Key: {tba_key}"])
        except subprocess.CalledProcessError:
            payload = None
        if isinstance(payload, dict):
            teams[team]["name"] = payload.get("nickname") or teams[team]["name"]
            teams[team]["city"] = payload.get("city")
            teams[team]["state"] = payload.get("state_prov") or teams[team].get("state")
            teams[team]["country"] = payload.get("country") or teams[team].get("country")
        if index % 20 == 19:
            time.sleep(0.2)


def attach_tba_awards(teams: dict[int, dict], tba_key: str) -> None:
    if not tba_key:
        return
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import urllib.request
    def fetch_awards(team_num: int):
        url = f"{TBA_BASE}/team/frc{team_num}/awards"
        req = urllib.request.Request(url, headers={"X-TBA-Auth-Key": tba_key, "User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw_awards = json.loads(resp.read().decode("utf-8"))
                return team_num, [
                    {"year": a.get("year", 0), "name": a.get("name", "Award"), "eventKey": a.get("event_key")}
                    for a in raw_awards if a.get("year")
                ]
        except Exception:
            return team_num, []
    with ThreadPoolExecutor(max_workers=10) as pool:
        futures = [pool.submit(fetch_awards, team) for team in teams]
        for fut in as_completed(futures):
            team_num, awards = fut.result()
            teams[team_num]["awards"] = awards


def main() -> None:
    teams = fetch_teams()
    attach_years(teams)
    tba_key = load_tba_key()
    attach_tba_locations(teams, tba_key)
    attach_tba_awards(teams, tba_key)
    now = int(time.time() * 1000)
    records = []
    for team in sorted(teams):
        record = teams[team]
        record["updatedAt"] = now
        records.append(record)
    year_rows = sum(len(team["years"]) for team in records)
    cities = sorted({team.get("city") for team in records if team.get("city")})
    bundle = {
        "generatedAt": now,
        "region": "Turkey",
        "teamCount": len(records),
        "yearRowCount": year_rows,
        "cities": cities,
        "teams": records,
    }
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(json.dumps(bundle, ensure_ascii=False, separators=(",", ":")))
    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"Wrote {OUT_PATH} ({size_kb:.1f} KB, {len(records)} teams, {year_rows} team-years, {len(cities)} cities)")


if __name__ == "__main__":
    main()
