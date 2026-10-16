import Dexie, { type Table } from "dexie";
import { isTurkeyCountry } from "./normalize";
import type { GlobalTeamProfile } from "./types";

export const GLOBAL_DATA_DOWNLOADED_KEY = "global_data_downloaded_v2";

class GlobalStatsDB extends Dexie {
  teams!: Table<GlobalTeamProfile, number>;

  constructor() {
    super("GlobalTeamStatsDB");
    this.version(1).stores({
      teams: "teamNumber, country, city, source, active, lastActiveYear",
    });
  }
}

const db = new GlobalStatsDB();

export async function loadCachedGlobalTeams(): Promise<GlobalTeamProfile[]> {
  try {
    const all = await db.teams.toArray();
    const hasDownloadedGlobal = localStorage.getItem(GLOBAL_DATA_DOWNLOADED_KEY) === "true";

    if (!hasDownloadedGlobal) {
      // Purge any leftover global teams from the obsolete 16MB bundle so only Turkey teams stay offline
      const nonTurkey = all.filter((t) => !isTurkeyCountry(t.country));
      if (nonTurkey.length > 0) {
        const nonTurkeyIds = nonTurkey.map((t) => t.teamNumber);
        void db.teams.bulkDelete(nonTurkeyIds);
      }
      return all.filter((t) => isTurkeyCountry(t.country));
    }

    return all;
  } catch (error) {
    console.warn("[GlobalStats] Failed to read cache", error);
    return [];
  }
}

export async function clearNonTurkeyCachedTeams(): Promise<void> {
  try {
    const all = await db.teams.toArray();
    const nonTurkeyIds = all.filter((t) => !isTurkeyCountry(t.country)).map((t) => t.teamNumber);
    if (nonTurkeyIds.length > 0) {
      await db.teams.bulkDelete(nonTurkeyIds);
    }
  } catch (error) {
    console.warn("[GlobalStats] Failed to prune non-Turkey cache", error);
  }
}

export async function putCachedGlobalTeams(teams: GlobalTeamProfile[]): Promise<void> {
  if (teams.length === 0) return;
  try {
    await db.teams.bulkPut(teams);
  } catch (error) {
    console.warn("[GlobalStats] Failed to write cache", error);
  }
}

export async function putCachedGlobalTeam(team: GlobalTeamProfile): Promise<void> {
  try {
    await db.teams.put(team);
  } catch (error) {
    console.warn("[GlobalStats] Failed to cache team", error);
  }
}
