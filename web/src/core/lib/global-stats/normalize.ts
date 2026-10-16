import type { GlobalStatsFilters, GlobalTeamProfile, GlobalTeamYear } from "./types";

const TURKEY_COUNTRIES = new Set(["turkey", "turkiye", "türkiye"]);

const IZMIR_KEYWORDS = [
  "izmir", "bornova", "konak", "karsiyaka", "cigli", "gaziemir",
  "buca", "menemen", "torbali", "kemalpasa", "balcova", "narlidere",
  "guzelbahce", "urla", "cesme", "foca", "seferihisar", "menderes",
  "tire", "odemis", "aliaga", "bayrakli", "karabaglar", "goztepe",
];

const ISTANBUL_KEYWORDS = [
  "istanbul", "kadikoy", "besiktas", "kartal", "buyukcekmece", "basaksehir",
  "fatih", "sariyer", "uskudar", "beyoglu", "maltepe", "atasehir",
  "bakirkoy", "sisli", "beylikduzu", "pendik", "umraniye", "tuzla",
  "eyup", "kagithane", "avcilar", "zeytinburnu", "bagcilar", "esenyurt",
  "kucukcekmece", "sultangazi", "silivri", "catalca", "sancaktepe", "cekmekoy",
  "sultanbeyli", "arnavutkoy", "gungoren", "bayrampasa", "gaziosmanpasa",
  "bahcelievler", "adalar", "sile",
];

const ANKARA_KEYWORDS = [
  "ankara", "cankaya", "yenimahalle", "kecioren", "etimesgut", "mamak",
  "sincan", "golbasi", "altindag", "pursaklar", "polatli", "baskent", "kazan",
];

const KOCAELI_KEYWORDS = [
  "kocaeli", "gebze", "izmit", "cayirova", "darica", "korfez", "golcuk",
  "derince", "kartepe", "basiskele", "karamursel", "dilovasi", "kandira",
];

export function foldLocation(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function canonicalCity(city?: string | null | undefined, state?: string | null | undefined): string {
  const foldedCity = foldLocation(city);
  const foldedState = foldLocation(state);
  const combined = `${foldedCity} ${foldedState}`.trim();

  if (!combined) return "";

  if (IZMIR_KEYWORDS.some((kw) => combined.includes(kw))) return "Izmir";
  if (ISTANBUL_KEYWORDS.some((kw) => combined.includes(kw))) return "Istanbul";
  if (ANKARA_KEYWORDS.some((kw) => combined.includes(kw))) return "Ankara";
  if (KOCAELI_KEYWORDS.some((kw) => combined.includes(kw))) return "Kocaeli";
  if (combined.includes("bursa") || combined.includes("nilufer") || combined.includes("osmangazi")) return "Bursa";
  if (combined.includes("antalya") || combined.includes("muratpasa") || combined.includes("kepez")) return "Antalya";
  if (combined.includes("eskisehir") || combined.includes("odunpazari") || combined.includes("tepebasi")) return "Eskişehir";
  if (combined.includes("adana") || combined.includes("seyhan") || combined.includes("cukurova")) return "Adana";
  if (combined.includes("gaziantep") || combined.includes("sehitkamil") || combined.includes("sahinbey")) return "Gaziantep";
  if (combined.includes("konya") || combined.includes("selcuklu") || combined.includes("meram")) return "Konya";
  if (combined.includes("mersin") || combined.includes("yenisehir") || combined.includes("mezitli")) return "Mersin";
  if (combined.includes("kayseri") || combined.includes("melikgazi")) return "Kayseri";
  if (combined.includes("samsun")) return "Samsun";
  if (combined.includes("trabzon")) return "Trabzon";
  if (combined.includes("denizli")) return "Denizli";

  const rawCity = (city ?? "").trim().replace(/\s+/g, " ");
  const rawState = (state ?? "").trim().replace(/\s+/g, " ");
  return rawCity || rawState || "";
}

export function formatTeamLocation(team: {
  city?: string | null;
  state?: string | null;
  country?: string | null;
}): string {
  const canon = canonicalCity(team.city, team.state);
  const rawCity = (team.city ?? "").trim();
  const rawState = (team.state ?? "").trim();
  const isTr = isTurkeyCountry(team.country);

  if (isTr) {
    if (canon && rawCity && foldLocation(rawCity) !== foldLocation(canon)) {
      return `${canon} (${rawCity})`;
    }
    return canon || rawCity || rawState || "Turkey";
  }

  const parts = [rawCity, rawState, team.country].filter(Boolean);
  return parts.join(", ") || "—";
}

export function isTurkeyCountry(value: string | null | undefined): boolean {
  return TURKEY_COUNTRIES.has(foldLocation(value).replace(/\s/g, ""));
}

export function yearForDisplay(team: GlobalTeamProfile, yearFilter: string): GlobalTeamYear | null {
  if (yearFilter && yearFilter !== "all") {
    const year = Number.parseInt(yearFilter, 10);
    return team.years.find((entry) => entry.year === year) ?? null;
  }
  if (team.years.length === 0) return null;
  return team.years[team.years.length - 1] ?? null;
}

export function isTeamActive(team: { active?: boolean | null; lastActiveYear?: number | null }): boolean {
  if (team.active) return true;
  if (team.lastActiveYear && team.lastActiveYear >= 2024) return true;
  return false;
}

export function matchesGlobalStatsFilters(
  team: GlobalTeamProfile,
  filters: GlobalStatsFilters
): boolean {
  if (filters.offlineOnly && team.source !== "offline") return false;
  if (filters.activeOnly && !isTeamActive(team)) return false;
  if (filters.hasAwardsOnly && (!team.awards || team.awards.length === 0)) return false;

  if (filters.country && filters.country !== "all") {
    if (filters.country === "Turkey") {
      if (!isTurkeyCountry(team.country)) return false;
    } else if (foldLocation(team.country) !== foldLocation(filters.country)) {
      return false;
    }
  }

  if (filters.city && filters.city !== "all") {
    const teamCanon = canonicalCity(team.city, team.state);
    const filterCanon = canonicalCity(filters.city);
    if (teamCanon !== filterCanon && foldLocation(team.city) !== foldLocation(filters.city)) {
      return false;
    }
  }

  if (filters.year && filters.year !== "all") {
    const year = Number.parseInt(filters.year, 10);
    if (!team.years.some((entry) => entry.year === year)) return false;
  }

  if (filters.district && filters.district !== "all") {
    if ((team.districtCode || "").toUpperCase() !== filters.district.toUpperCase()) {
      return false;
    }
  }

  const query = foldLocation(filters.search);
  if (!query) return true;

  const awardsStr = (team.awards ?? []).map((a) => `${a.year} ${a.name}`).join(" ");
  const canon = canonicalCity(team.city, team.state);
  const haystack = foldLocation(
    `${team.teamNumber} ${team.name} ${team.fullName ?? ""} ${team.schoolName ?? ""} ${team.robotName ?? ""} ${team.districtCode ?? ""} ${canon} ${team.city ?? ""} ${team.state ?? ""} ${team.country ?? ""} ${awardsStr}`
  );
  return haystack.includes(query);
}
