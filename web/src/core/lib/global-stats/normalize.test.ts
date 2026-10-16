import { describe, expect, it } from "vitest";
import { canonicalCity, foldLocation, isTeamActive, matchesGlobalStatsFilters } from "./normalize";
import type { GlobalTeamProfile } from "./types";

const team = (overrides: Partial<GlobalTeamProfile> = {}): GlobalTeamProfile => ({
  teamNumber: 11240,
  name: "Rotatech",
  city: "İzmir",
  country: "Türkiye",
  active: true,
  years: [{ year: 2026, breakdown: {}, record: null, ranks: {} }],
  source: "offline",
  updatedAt: 1,
  ...overrides,
});

describe("global stats location filters", () => {
  it("treats Izmir spelling variants as the same city", () => {
    expect(canonicalCity("IZMIR")).toBe("Izmir");
    expect(canonicalCity("izmir")).toBe("Izmir");
    expect(canonicalCity("İzmir")).toBe("Izmir");
    expect(canonicalCity("Bornova", "Izmir")).toBe("Izmir");
    expect(canonicalCity("Konak")).toBe("Izmir");
    expect(canonicalCity("Kadikoy", "Istanbul")).toBe("Istanbul");
    expect(canonicalCity("Cankaya", "Ankara")).toBe("Ankara");
    expect(foldLocation("İstanbul")).toContain("istanbul");
  });

  it("filters Izmir teams from the Turkey offline pack including district registrations", () => {
    const izmirDirect = team();
    const izmirDistrict = team({ teamNumber: 6429, name: "4th Dimension", city: "BORNOVA", state: "Izmir" });
    const istanbul = team({ teamNumber: 6431, name: "NoktaParantez", city: "Istanbul" });
    const filters = {
      search: "",
      country: "Turkey",
      city: "Izmir",
      year: "all",
      activeOnly: false,
      offlineOnly: false,
    };
    expect(matchesGlobalStatsFilters(izmirDirect, filters)).toBe(true);
    expect(matchesGlobalStatsFilters(izmirDistrict, filters)).toBe(true);
    expect(matchesGlobalStatsFilters(istanbul, filters)).toBe(false);
  });

  it("correctly identifies active teams even if statbotics sets active to false but team competed in 2024-2026", () => {
    const celestial9070 = team({
      teamNumber: 9070,
      name: "CELESTIAL",
      active: false,
      lastActiveYear: 2025,
    });
    expect(isTeamActive(celestial9070)).toBe(true);

    const oldInactiveTeam = team({
      teamNumber: 1,
      name: "Old Team",
      active: false,
      lastActiveYear: 2018,
    });
    expect(isTeamActive(oldInactiveTeam)).toBe(false);

    const filters = {
      search: "",
      country: "all",
      city: "all",
      year: "all",
      activeOnly: true,
      offlineOnly: false,
    };
    expect(matchesGlobalStatsFilters(celestial9070, filters)).toBe(true);
    expect(matchesGlobalStatsFilters(oldInactiveTeam, filters)).toBe(false);
  });
});

