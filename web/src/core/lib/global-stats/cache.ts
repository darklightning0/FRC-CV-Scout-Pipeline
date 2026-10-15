import Dexie, { type Table } from "dexie";
import type { GlobalTeamProfile } from "./types";

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
    return await db.teams.toArray();
  } catch (error) {
    console.warn("[GlobalStats] Failed to read cache", error);
    return [];
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
