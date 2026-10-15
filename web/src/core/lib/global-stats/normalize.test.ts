import { describe, expect, it } from "vitest";
import { canonicalCity, foldLocation, matchesGlobalStatsFilters } from "./normalize";
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
});
