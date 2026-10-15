#!/usr/bin/env python3
"""Build the comprehensive Global FRC stats bundle for all teams & all seasons."""

from __future__ import annotations

import json
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
import urllib.request
import urllib.error

ROOT = Path(__file__).resolve().parents[1]
OUT_PATH = ROOT / "public" / "data" / "global-frc-stats.json"
TURKEY_BUNDLE_PATH = ROOT / "public" / "data" / "turkey-frc-stats.json"
ENV_PATH = ROOT / ".env"
STATBOTICS_BASE = "https://api-statbotics.iterativerefinement.com/v3"
TBA_BASE = "https://www.thebluealliance.com/api/v3"
USER_AGENT = "HunterEyes/1.0 (Global FRC stats bundle)"


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


def get_json(url: str, headers: dict[str, str] | None = None) -> object:
    all_headers = {"User-Agent": USER_AGENT}
    if headers:
        all_headers.update(headers)
    req = urllib.request.Request(url, headers=all_headers)
    with urllib.request.urlopen(req, timeout=20) as resp:
        raw = resp.read().decode("utf-8")
        if not raw.strip():
            return None
        return json.loads(raw)


def as_num(val: object, digits: int = 2) -> float | None:
    if val is None or isinstance(val, bool):
        return None
    try:
        f = float(val)  # type: ignore[arg-type]
        return round(f, digits)
    except (ValueError, TypeError):
        return None


def compact_record(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    wins = int(as_num(raw.get("wins"), 0) or 0)
    losses = int(as_num(raw.get("losses"), 0) or 0)
    ties = int(as_num(raw.get("ties"), 0) or 0)
    count = int(as_num(raw.get("count"), 0) or (wins + losses + ties))
    winrate = as_num(raw.get("winrate"), 4)
    if winrate is None and count > 0:
        winrate = round((wins + 0.5 * ties) / count, 4)
    return {
        "wins": wins,
        "losses": losses,
        "ties": ties,
        "count": count,
        "winrate": winrate or 0.0,
    }


def compact_breakdown(raw: object) -> dict[str, float]:
    out: dict[str, float] = {}
    if not isinstance(raw, dict):
        return out
    for k, v in raw.items():
        if isinstance(v, dict):
            for sub_k, sub_v in v.items():
                parsed = as_num(sub_v, 2)
                if parsed is not None and parsed != 0.0:
                    out[f"{k}.{sub_k}"] = parsed
        else:
            parsed = as_num(v, 2)
            if parsed is not None and parsed != 0.0:
                out[str(k)] = parsed
    return out


def fetch_all_teams() -> dict[int, dict]:
    print("Fetching all teams from Statbotics...")
    teams: dict[int, dict] = {}
    offset = 0
    limit = 1000
    while True:
        url = f"{STATBOTICS_BASE}/teams?limit={limit}&offset={offset}"
        data = get_json(url)
        if not isinstance(data, list) or not data:
            break
        for item in data:
            if not isinstance(item, dict):
                continue
            num = int(item.get("team") or 0)
            if not num:
                continue
            norm_epa = item.get("norm_epa") if isinstance(item.get("norm_epa"), dict) else {}
            teams[num] = {
                "teamNumber": num,
                "name": item.get("name") or f"Team {num}",
                "city": None,
                "state": item.get("state"),
                "country": item.get("country"),
                "rookieYear": item.get("rookie_year"),
                "active": bool(item.get("active")),
                "lastActiveYear": item.get("last_active_year"),
                "careerRecord": compact_record(item.get("record")),
                "normEpa": {
                    "current": as_num(norm_epa.get("current"), 1),
                    "recent": as_num(norm_epa.get("recent"), 1),
                    "mean": as_num(norm_epa.get("mean"), 1),
                    "max": as_num(norm_epa.get("max"), 1),
                },
                "years": [],
                "source": "offline",
            }
        if len(data) < limit:
            break
        offset += limit
    print(f"Loaded {len(teams)} base teams from Statbotics.")
    return teams


def attach_tba_teams(teams: dict[int, dict], tba_key: str) -> None:
    if not tba_key:
        print("No TBA key; skipping TBA locations.")
        return
    print("Fetching team locations from TBA simple endpoints...")
    headers = {"X-TBA-Auth-Key": tba_key}
    
    def fetch_page(page_idx: int):
        url = f"{TBA_BASE}/teams/{page_idx}/simple"
        try:
            return page_idx, get_json(url, headers=headers)
        except Exception as e:
            return page_idx, None

    # TBA currently has ~21 pages (0..21)
    pages_to_fetch = list(range(23))
    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(fetch_page, p) for p in pages_to_fetch]
        for fut in as_completed(futures):
            page_idx, data = fut.result()
            if not isinstance(data, list):
                continue
            for item in data:
                if not isinstance(item, dict):
                    continue
                num = int(item.get("team_number") or 0)
                if num in teams:
                    if item.get("nickname"):
                        teams[num]["name"] = item.get("nickname")
                    if item.get("city"):
                        teams[num]["city"] = item.get("city")
                    if item.get("state_prov"):
                        teams[num]["state"] = item.get("state_prov")
                    if item.get("country"):
                        teams[num]["country"] = item.get("country")
    print("TBA locations attached.")


def fetch_all_team_years() -> dict[int, list[dict]]:
    print("Fetching all season team-years from Statbotics (2002-2026)...")
    years_meta = get_json(f"{STATBOTICS_BASE}/years")
    if isinstance(years_meta, list):
        years = sorted([int(y["year"]) for y in years_meta if "year" in y])
    else:
        years = list(range(2002, 2027))

    team_years_map: dict[int, list[dict]] = {}

    def fetch_single_year(year: int):
        records = []
        offset = 0
        limit = 1000
        while True:
            url = f"{STATBOTICS_BASE}/team_years?year={year}&limit={limit}&offset={offset}"
            try:
                data = get_json(url)
            except Exception as e:
                print(f"Error fetching year {year} offset {offset}: {e}")
                break
            if not isinstance(data, list) or not data:
                break
            records.extend(data)
            if len(data) < limit:
                break
            offset += limit
        return year, records

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch_single_year, y) for y in years]
        total_recs = 0
        for fut in as_completed(futures):
            year, recs = fut.result()
            total_recs += len(recs)
            for r in recs:
                t_num = int(r.get("team") or 0)
                if not t_num:
                    continue
                epa = r.get("epa") if isinstance(r.get("epa"), dict) else {}
                breakdown_src = epa.get("breakdown") if isinstance(epa.get("breakdown"), dict) else {}
                ranks_src = epa.get("ranks") if isinstance(epa.get("ranks"), dict) else {}
                total_rank = ranks_src.get("total") if isinstance(ranks_src.get("total"), dict) else {}
                country_rank = ranks_src.get("country") if isinstance(ranks_src.get("country"), dict) else {}
                
                entry = {
                    "year": year,
                    "name": r.get("name"),
                    "epaTotal": as_num(epa.get("total_points"), 1),
                    "epaNorm": as_num(epa.get("norm"), 1),
                    "epaUnitless": as_num(epa.get("unitless"), 1),
                    "epaAuto": as_num(breakdown_src.get("auto_points"), 1),
                    "epaTeleop": as_num(breakdown_src.get("teleop_points"), 1),
                    "epaEndgame": as_num(breakdown_src.get("endgame_points"), 1),
                    "epaMax": as_num(epa.get("stats", {}).get("max") if isinstance(epa.get("stats"), dict) else None, 1),
                    "breakdown": compact_breakdown(breakdown_src),
                    "record": compact_record(r.get("record")),
                    "ranks": {
                        "worldRank": int(total_rank.get("rank")) if total_rank.get("rank") else None,
                        "worldPercentile": as_num(total_rank.get("percentile"), 4),
                        "countryRank": int(country_rank.get("rank")) if country_rank.get("rank") else None,
                        "countryPercentile": as_num(country_rank.get("percentile"), 4),
                    },
                }
                if t_num not in team_years_map:
                    team_years_map[t_num] = []
                team_years_map[t_num].append(entry)

    print(f"Processed {total_recs} team-year entries across {len(years)} years.")
    return team_years_map


def main() -> None:
    t0 = time.time()
    tba_key = load_tba_key()
    teams = fetch_all_teams()
    attach_tba_teams(teams, tba_key)
    team_years_map = fetch_all_team_years()

    # Inherit existing Turkey awards if turkey bundle exists
    turkey_awards: dict[int, list[dict]] = {}
    if TURKEY_BUNDLE_PATH.exists():
        try:
            tb_data = json.loads(TURKEY_BUNDLE_PATH.read_text())
            for t in tb_data.get("teams", []):
                t_num = t.get("teamNumber")
                if t_num and t.get("awards"):
                    turkey_awards[t_num] = t["awards"]
        except Exception:
            pass

    now = int(time.time() * 1000)
    final_list = []
    total_year_rows = 0

    for num in sorted(teams.keys()):
        team = teams[num]
        ne = team.get("normEpa")
        if ne:
            for k in ["current", "recent", "mean", "max"]:
                if ne.get(k) is not None:
                    ne[k] = round(ne[k], 1)
        cr = team.get("careerRecord")
        if cr:
            if cr.get("count") == 0:
                team.pop("careerRecord", None)
            elif cr.get("winrate") is not None:
                cr["winrate"] = round(cr["winrate"], 3)

        raw_years = sorted(team_years_map.get(num, []), key=lambda x: x["year"])
        years_list = []
        for idx, y in enumerate(raw_years):
            is_latest = idx == len(raw_years) - 1
            if y.get("name") == team.get("name"):
                y.pop("name", None)
            y.pop("epaUnitless", None)
            y.pop("epaMax", None)
            y.pop("epaNorm", None)

            for epa_k in ["epaTotal", "epaAuto", "epaTeleop", "epaEndgame"]:
                if y.get(epa_k) is not None:
                    y[epa_k] = round(y[epa_k], 1)

            if not is_latest:
                y["breakdown"] = {}
            elif "breakdown" in y:
                for dup in ["total_points", "auto_points", "teleop_points", "endgame_points"]:
                    y["breakdown"].pop(dup, None)
                cleaned_bd = {k: round(v, 1) for k, v in y["breakdown"].items() if v and round(v, 1) != 0.0}
                y["breakdown"] = cleaned_bd

            ranks = y.get("ranks") or {}
            cr_ranks = {}
            if ranks.get("worldRank"):
                cr_ranks["worldRank"] = ranks["worldRank"]
            if ranks.get("countryRank"):
                cr_ranks["countryRank"] = ranks["countryRank"]
            y["ranks"] = cr_ranks

            rec = y.get("record")
            if rec:
                if rec.get("count") == 0:
                    y.pop("record", None)
                elif rec.get("winrate") is not None:
                    rec["winrate"] = round(rec["winrate"], 3)

            years_list.append(y)

        team["years"] = years_list
        team["updatedAt"] = now
        if num in turkey_awards:
            team["awards"] = turkey_awards[num]
        total_year_rows += len(years_list)
        final_list.append(team)

    cities = sorted({t["city"] for t in final_list if t.get("city")})
    bundle = {
        "generatedAt": now,
        "region": "Global",
        "teamCount": len(final_list),
        "yearRowCount": total_year_rows,
        "cities": cities,
        "teams": final_list,
    }

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    compact_json = json.dumps(bundle, ensure_ascii=False, separators=(",", ":"))
    OUT_PATH.write_text(compact_json, encoding="utf-8")

    size_mb = OUT_PATH.stat().st_size / (1024 * 1024)
    duration = time.time() - t0
    print(f"Successfully generated {OUT_PATH}")
    print(f"Size: {size_mb:.2f} MB ({len(final_list)} teams, {total_year_rows} team-years, duration: {duration:.1f}s)")


if __name__ == "__main__":
    main()
