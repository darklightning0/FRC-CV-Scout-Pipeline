import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BarChart3,
  ExternalLink,
  Filter,
  Flame,
  Globe2,
  HardDriveDownload,
  Info,
  RotateCcw,
  RefreshCw,
  Search,
  Trophy,
  Wifi,
  WifiOff,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/core/components/ui/badge";
import { Button } from "@/core/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/core/components/ui/card";
import { DataAttribution } from "@/core/components/DataAttribution";
import { GenericSelector } from "@/core/components/ui/generic-selector";
import { Input } from "@/core/components/ui/input";
import { Label } from "@/core/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/core/components/ui/sheet";
import { Skeleton } from "@/core/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/core/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/core/components/ui/dialog";
import { Checkbox } from "@/core/components/ui/checkbox";
import { useGlobalTeamStats } from "@/core/hooks/useGlobalTeamStats";
import {
  canonicalCity,
  formatTeamLocation,
  yearForDisplay,
} from "@/core/lib/global-stats/normalize";
import type {
  GlobalStatsSortField,
  GlobalTeamProfile,
  GlobalTeamYear,
} from "@/core/lib/global-stats/types";

const PAGE_SIZE = 50;

function formatRecord(record: GlobalTeamProfile["careerRecord"] | GlobalTeamYear["record"]): string {
  if (!record) return "—";
  return `${record.wins}-${record.losses}-${record.ties}`;
}

function formatPct(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function formatNum(value: number | null | undefined, digits = 1): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(digits);
}

function TeamYearTable({ years }: { years: GlobalTeamYear[] }) {
  if (years.length === 0) {
    return <p className="text-sm text-muted-foreground">No season stats recorded for this team.</p>;
  }

  const latest = years[years.length - 1];
  const extraKeys = Object.keys(latest?.breakdown ?? {}).filter(
    (key) => !["total_points", "auto_points", "teleop_points", "endgame_points"].includes(key)
  );

  return (
    <div className="overflow-x-auto border rounded-lg">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow>
            <TableHead className="font-semibold">Year</TableHead>
            <TableHead className="font-semibold">EPA</TableHead>
            <TableHead className="font-semibold">Auto</TableHead>
            <TableHead className="font-semibold">Teleop</TableHead>
            <TableHead className="font-semibold">Endgame</TableHead>
            <TableHead className="font-semibold">Record</TableHead>
            <TableHead className="font-semibold">Win%</TableHead>
            <TableHead className="font-semibold">World Rank</TableHead>
            <TableHead className="font-semibold">Country Rank</TableHead>
            {extraKeys.slice(0, 10).map((key) => (
              <TableHead key={key} className="capitalize text-xs">
                {key.replace(/_/g, " ")}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {[...years].reverse().map((year) => (
            <TableRow key={year.year}>
              <TableCell className="font-bold">{year.year}</TableCell>
              <TableCell className="font-semibold text-primary">{formatNum(year.epaTotal)}</TableCell>
              <TableCell>{formatNum(year.epaAuto)}</TableCell>
              <TableCell>{formatNum(year.epaTeleop)}</TableCell>
              <TableCell>{formatNum(year.epaEndgame)}</TableCell>
              <TableCell>{formatRecord(year.record)}</TableCell>
              <TableCell>{formatPct(year.record?.winrate)}</TableCell>
              <TableCell>{year.ranks?.worldRank ? `#${year.ranks.worldRank}` : "—"}</TableCell>
              <TableCell>{year.ranks?.countryRank ? `#${year.ranks.countryRank}` : "—"}</TableCell>
              {extraKeys.slice(0, 10).map((key) => (
                <TableCell key={key} className="text-xs">
                  {formatNum(year.breakdown?.[key], 2)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function GlobalStatisticsPage() {
  const [searchParams] = useSearchParams();
  const {
    teams,
    filteredTeams,
    filters,
    setFilters,
    loading,
    lookupLoading,
    syncLoading,
    error,
    bundleGeneratedAt,
    countryOptions,
    cityOptions,
    yearOptions,
    toggleSort,
    resetFilters,
    lookupTeam,
    syncStatbotics,
  } = useGlobalTeamStats();

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<GlobalTeamProfile | null>(null);
  const [lookupValue, setLookupValue] = useState("");
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const handleSyncStatbotics = async () => {
    const targetYear =
      filters.year !== "all" && Number.isFinite(Number(filters.year))
        ? Number(filters.year)
        : 2026;
    toast.loading(`Pulling latest ${targetYear} season data from Statbotics...`, {
      id: "statbotics-sync",
    });
    const res = await syncStatbotics(targetYear);
    if (res.error) {
      toast.error(`Sync failed: ${res.error}`, { id: "statbotics-sync" });
    } else {
      toast.success(
        `Synced ${res.updated} teams for season ${res.year} from Statbotics`,
        { id: "statbotics-sync" }
      );
    }
  };

  // Sync query params (e.g. ?team=7140 or ?city=Izmir)
  useEffect(() => {
    const teamParam = searchParams.get("team");
    if (teamParam && teams.length > 0) {
      const teamNum = Number.parseInt(teamParam, 10);
      const found = teams.find((t) => t.teamNumber === teamNum);
      if (found) {
        setSelectedTeam(found);
      }
    }

    const cityParam = searchParams.get("city");
    if (cityParam) {
      setFilters((prev) => ({ ...prev, country: "Turkey", city: cityParam }));
    }
  }, [searchParams, teams, setFilters]);

  // Reset pagination when filter results change
  useEffect(() => {
    setDisplayCount(PAGE_SIZE);
  }, [filters]);

  const selectedYearLabel = filters.year === "all" ? "Career / All-Time" : filters.year;

  const rows = useMemo(
    () =>
      filteredTeams.slice(0, displayCount).map((team) => {
        const year = yearForDisplay(team, filters.year);
        return { team, year };
      }),
    [filteredTeams, filters.year, displayCount]
  );

  const izmirCount = useMemo(() => {
    return teams.filter(
      (t) => canonicalCity(t.city, t.state) === "Izmir" && (!filters.activeOnly || t.active)
    ).length;
  }, [teams, filters.activeOnly]);

  const topEpa = useMemo(() => {
    if (filteredTeams.length === 0) return null;
    let maxEpa = -1;
    for (const t of filteredTeams) {
      const y = yearForDisplay(t, filters.year);
      const epa = y?.epaTotal ?? t.normEpa?.current ?? 0;
      if (epa > maxEpa) maxEpa = epa;
    }
    return maxEpa > 0 ? maxEpa : null;
  }, [filteredTeams, filters.year]);

  const handleLookup = async (inputNum?: number) => {
    const num = inputNum ?? Number.parseInt(lookupValue, 10);
    if (!Number.isFinite(num) || num <= 0) {
      toast.error("Please enter a valid FRC team number");
      return;
    }

    const existing = teams.find((t) => t.teamNumber === num);
    if (existing) {
      setSelectedTeam(existing);
      toast.success(`Found Team ${num} (${existing.name})`);
      return;
    }

    const profile = await lookupTeam(num);
    if (profile) {
      toast.success(`Loaded Team ${profile.teamNumber} · ${profile.name}`);
      setSelectedTeam(profile);
      setLookupValue("");
    } else {
      toast.error(`Could not find or load Team ${num} from TBA/Statbotics`);
    }
  };

  const getSortIcon = (field: GlobalStatsSortField) => {
    if (filters.sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 text-muted-foreground/60 inline-block ml-1" />;
    }
    return filters.sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-primary inline-block ml-1" />
    ) : (
      <ArrowDown className="h-3 w-3 text-primary inline-block ml-1" />
    );
  };

  return (
    <div className="min-h-screen w-full flex flex-col px-3 sm:px-6 pt-10 pb-28">
      <div className="flex flex-col max-w-7xl w-full mx-auto gap-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-primary/10 rounded-lg text-primary">
                <BarChart3 className="h-6 w-6" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">Statistics</h1>
              <Badge variant="outline" className="hidden sm:inline-flex gap-1 text-xs">
                <Globe2 className="h-3 w-3" />
                Global & Turkey
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Historical FRC performance, EPA telemetry, match records, and awards. Full global archive across all seasons stored offline; sync live season data from Statbotics on-demand.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncStatbotics}
              disabled={syncLoading}
              className="gap-2 text-xs h-9 border-primary/20 hover:border-primary/50 hover:bg-primary/5 shadow-xs"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${syncLoading ? "animate-spin text-primary" : "text-muted-foreground"}`} />
              {syncLoading ? "Syncing..." : `Sync Statbotics (${filters.year === "all" ? "2026" : filters.year})`}
            </Button>
            <DataAttribution sources={["tba", "statbotics"]} variant="compact" />
          </div>
        </div>

        {/* KPI Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card className="bg-card/50">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs">Offline Pack</CardDescription>
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <HardDriveDownload className="h-4 w-4 text-emerald-500" />
                {teams.filter((t) => t.source === "offline").length} Teams
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-[11px] text-muted-foreground">
              {bundleGeneratedAt
                ? `Global archive updated ${new Date(bundleGeneratedAt).toLocaleDateString()}`
                : "Full global pack stored locally for zero-latency offline use"}
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs">Filter Matches</CardDescription>
              <CardTitle className="text-lg flex items-center gap-2 font-bold">
                <Globe2 className="h-4 w-4 text-blue-500" />
                {filteredTeams.length} Teams
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-[11px] text-muted-foreground">
              {filters.city !== "all" ? `Filtered by ${filters.city}` : "All loaded regions"}
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs">Active Season</CardDescription>
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-primary">
                {selectedYearLabel}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-[11px] text-muted-foreground">
              Displaying {filters.year === "all" ? "all-time career stats" : `${filters.year} season stats`}
            </CardContent>
          </Card>

          <Card className="bg-card/50">
            <CardHeader className="p-3 pb-1">
              <CardDescription className="text-xs">Peak EPA in Filter</CardDescription>
              <CardTitle className="text-lg flex items-center gap-2 font-bold text-amber-500">
                <Flame className="h-4 w-4" />
                {topEpa ? formatNum(topEpa, 1) : "—"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0 text-[11px] text-muted-foreground">
              Highest scoring power in current view
            </CardContent>
          </Card>
        </div>

        {/* Search, Filter bar, Quick Chips */}
        <Card className="border shadow-sm">
          <CardContent className="p-4 flex flex-col gap-3">
            {/* Search and online lookup row */}
            <div className="flex flex-col md:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={filters.search}
                  onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
                  placeholder="Search team #, name, Izmir, Istanbul, or award..."
                  className="pl-9"
                />
              </div>

              <div className="flex items-center gap-2">
                <div className="w-36">
                  <GenericSelector
                    label="Year"
                    value={filters.year}
                    onValueChange={(val) => setFilters((prev) => ({ ...prev, year: val }))}
                    availableOptions={["all", ...yearOptions.map(String)]}
                    displayFormat={(val) => (val === "all" ? "All Seasons" : val)}
                  />
                </div>
                <Button variant="outline" onClick={() => setFiltersOpen(true)} className="gap-1.5">
                  <Filter className="h-4 w-4" />
                  Filters
                  {(filters.city !== "all" ||
                    filters.activeOnly ||
                    filters.offlineOnly ||
                    filters.hasAwardsOnly ||
                    filters.country !== "all") && (
                    <Badge variant="secondary" className="h-4 px-1 text-[10px] bg-primary text-primary-foreground">
                      Active
                    </Badge>
                  )}
                </Button>
              </div>
            </div>

            {/* Quick Filter Chips (Global, Turkey, Izmir, Istanbul, Ankara, etc.) */}
            <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t">
              <span className="text-xs font-semibold text-muted-foreground mr-1">Quick:</span>

              {/* Global (All) */}
              <Button
                size="sm"
                variant={filters.city === "all" && filters.country === "all" ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setFilters((prev) => ({ ...prev, country: "all", city: "all" }))}
              >
                Global (All)
              </Button>

              {/* All Turkey */}
              <Button
                size="sm"
                variant={filters.city === "all" && filters.country === "Turkey" ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setFilters((prev) => ({ ...prev, country: "Turkey", city: "all" }))}
              >
                All Turkey
              </Button>

              {/* Izmir (Explicitly requested by user) */}
              <Button
                size="sm"
                variant={canonicalCity(filters.city) === "Izmir" ? "default" : "outline"}
                className="h-7 text-xs px-2.5 gap-1 font-medium border-primary/40"
                onClick={() => setFilters((prev) => ({ ...prev, country: "Turkey", city: "Izmir" }))}
              >
                <span>İzmir Teams</span>
                <span className="ml-0.5 px-1 py-0.2 rounded text-[10px] bg-background/20 font-bold">
                  {izmirCount}
                </span>
              </Button>

              {/* Istanbul */}
              <Button
                size="sm"
                variant={canonicalCity(filters.city) === "Istanbul" ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setFilters((prev) => ({ ...prev, country: "Turkey", city: "Istanbul" }))}
              >
                İstanbul
              </Button>

              {/* Ankara */}
              <Button
                size="sm"
                variant={canonicalCity(filters.city) === "Ankara" ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setFilters((prev) => ({ ...prev, country: "Turkey", city: "Ankara" }))}
              >
                Ankara
              </Button>

              {/* Kocaeli */}
              <Button
                size="sm"
                variant={canonicalCity(filters.city) === "Kocaeli" ? "default" : "outline"}
                className="h-7 text-xs px-2.5"
                onClick={() => setFilters((prev) => ({ ...prev, country: "Turkey", city: "Kocaeli" }))}
              >
                Kocaeli
              </Button>

              {/* Active Only Toggle */}
              <Button
                size="sm"
                variant={filters.activeOnly ? "default" : "ghost"}
                className="h-7 text-xs px-2.5"
                onClick={() => setFilters((prev) => ({ ...prev, activeOnly: !prev.activeOnly }))}
              >
                Active Only
              </Button>

              {/* With Awards */}
              <Button
                size="sm"
                variant={filters.hasAwardsOnly ? "default" : "ghost"}
                className="h-7 text-xs px-2.5 gap-1"
                onClick={() => setFilters((prev) => ({ ...prev, hasAwardsOnly: !prev.hasAwardsOnly }))}
              >
                <Trophy className="h-3 w-3 text-amber-500" />
                With Awards
              </Button>

              {(filters.city !== "all" ||
                filters.search ||
                filters.activeOnly ||
                filters.hasAwardsOnly ||
                filters.year !== "all") && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground gap-1 ml-auto"
                  onClick={resetFilters}
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </Button>
              )}
            </div>

            {/* Worldwide lookup input */}
            <div className="flex flex-col sm:flex-row items-center gap-2 pt-2 border-t">
              <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
                <Globe2 className="h-3.5 w-3.5 text-primary" />
                Find any team worldwide:
              </span>
              <Input
                inputMode="numeric"
                value={lookupValue}
                onChange={(e) => setLookupValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleLookup();
                }}
                placeholder="Enter team # (e.g. 254, 1678, 118, 971...)"
                className="h-8 text-xs max-w-xs"
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={() => void handleLookup()}
                disabled={lookupLoading}
              >
                {lookupLoading ? "Fetching..." : "Fetch Online"}
              </Button>
              <span className="text-[11px] text-muted-foreground hidden lg:inline">
                Fetches complete season telemetry & awards from TBA + Statbotics, caching it offline.
              </span>
            </div>

            {error && <p className="text-xs text-destructive mt-1 font-medium">{error}</p>}
          </CardContent>
        </Card>

        {/* Results Table */}
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (
          <Card className="border shadow-sm overflow-hidden">
            <CardHeader className="py-3 px-4 bg-muted/20 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span>Team Leaderboard · {selectedYearLabel}</span>
                  <Badge variant="outline" className="text-xs font-normal">
                    Showing {rows.length} of {filteredTeams.length}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs">
                  Click any team row to inspect career progression, game breakdown points, and awards.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader className="bg-muted/40 text-xs">
                  <TableRow>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold"
                      onClick={() => toggleSort("teamNumber")}
                    >
                      Team {getSortIcon("teamNumber")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold"
                      onClick={() => toggleSort("name")}
                    >
                      Name {getSortIcon("name")}
                    </TableHead>
                    <TableHead className="font-semibold">Location</TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold text-center"
                      onClick={() => toggleSort("winrate")}
                    >
                      Record {getSortIcon("winrate")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold text-center"
                      onClick={() => toggleSort("epa")}
                    >
                      EPA {getSortIcon("epa")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold text-center hidden md:table-cell"
                      onClick={() => toggleSort("auto")}
                    >
                      Auto {getSortIcon("auto")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold text-center hidden md:table-cell"
                      onClick={() => toggleSort("teleop")}
                    >
                      Teleop {getSortIcon("teleop")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold text-center hidden md:table-cell"
                      onClick={() => toggleSort("endgame")}
                    >
                      Endgame {getSortIcon("endgame")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold text-center hidden lg:table-cell"
                      onClick={() => toggleSort("worldRank")}
                    >
                      World Rank {getSortIcon("worldRank")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold text-center hidden lg:table-cell"
                      onClick={() => toggleSort("countryRank")}
                    >
                      Country Rank {getSortIcon("countryRank")}
                    </TableHead>
                    <TableHead
                      className="cursor-pointer hover:bg-muted/70 font-semibold text-center"
                      onClick={() => toggleSort("awards")}
                    >
                      Awards {getSortIcon("awards")}
                    </TableHead>
                    <TableHead className="font-semibold text-right">Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="text-sm">
                  {rows.map(({ team, year }) => (
                    <TableRow
                      key={team.teamNumber}
                      className="cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => setSelectedTeam(team)}
                    >
                      <TableCell className="font-bold text-primary">
                        {team.teamNumber}
                        {!team.active && (
                          <span className="ml-1.5 px-1 py-0.5 rounded text-[9px] bg-muted text-muted-foreground font-normal">
                            Inactive
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="font-medium max-w-[200px] truncate" title={team.name}>
                        {team.name}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatTeamLocation(team)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {filters.year === "all" ? formatRecord(team.careerRecord) : formatRecord(year?.record)}
                        <span className="text-[10px] text-muted-foreground block">
                          {formatPct(filters.year === "all" ? team.careerRecord?.winrate : year?.record?.winrate)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center font-bold text-primary">
                        {formatNum(year?.epaTotal ?? team.normEpa?.current)}
                      </TableCell>
                      <TableCell className="text-center text-xs hidden md:table-cell">
                        {formatNum(year?.epaAuto)}
                      </TableCell>
                      <TableCell className="text-center text-xs hidden md:table-cell">
                        {formatNum(year?.epaTeleop)}
                      </TableCell>
                      <TableCell className="text-center text-xs hidden md:table-cell">
                        {formatNum(year?.epaEndgame)}
                      </TableCell>
                      <TableCell className="text-center text-xs hidden lg:table-cell">
                        {year?.ranks.worldRank ? (
                          <span>
                            #{year.ranks.worldRank}
                            {filters.year === "all" && year.year && (
                              <span className="text-[10px] text-muted-foreground ml-1 font-mono">
                                ('{String(year.year).slice(-2)})
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-center text-xs hidden lg:table-cell">
                        {year?.ranks.countryRank ? (
                          <span>
                            #{year.ranks.countryRank}
                            {filters.year === "all" && year.year && (
                              <span className="text-[10px] text-muted-foreground ml-1 font-mono">
                                ('{String(year.year).slice(-2)})
                              </span>
                            )}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {team.awards && team.awards.length > 0 ? (
                          <Badge variant="secondary" className="gap-1 text-[11px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            <Trophy className="h-3 w-3" />
                            {team.awards.length}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {team.source === "offline" ? (
                          <Badge variant="secondary" className="gap-1 text-[10px] whitespace-nowrap">
                            <WifiOff className="h-3 w-3 text-emerald-500" />
                            Offline
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1 text-[10px] whitespace-nowrap">
                            <Wifi className="h-3 w-3 text-blue-500" />
                            Online
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {rows.length === 0 && (
                <div className="py-12 flex flex-col items-center justify-center gap-3 text-center px-4">
                  <div className="p-3 bg-muted rounded-full">
                    <Info className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="font-semibold text-base">No teams found matching current filters</p>
                  <p className="text-xs text-muted-foreground max-w-md">
                    Try clearing filters or looking up any FRC team globally by their team number using the online search above.
                  </p>
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    Reset all filters
                  </Button>
                </div>
              )}

              {filteredTeams.length > displayCount && (
                <div className="p-4 border-t flex justify-center bg-muted/10">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDisplayCount((prev) => prev + PAGE_SIZE)}
                    className="w-full sm:w-auto"
                  >
                    Load next {Math.min(PAGE_SIZE, filteredTeams.length - displayCount)} teams (showing {displayCount} of {filteredTeams.length})
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filter Sheet */}
      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="right" className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Statistics Filters</SheetTitle>
            <SheetDescription>
              Filter the global and regional telemetry database by location, season, and performance.
            </SheetDescription>
          </SheetHeader>
          <div className="flex flex-col gap-4 px-4 pb-8 pt-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Country</Label>
              <GenericSelector
                label="Country"
                value={filters.country}
                onValueChange={(val) => setFilters((prev) => ({ ...prev, country: val, city: "all" }))}
                availableOptions={countryOptions}
                displayFormat={(val) => (val === "all" ? "All Countries (Global)" : val)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">City / District</Label>
              <GenericSelector
                label="City"
                value={filters.city}
                onValueChange={(val) => setFilters((prev) => ({ ...prev, city: val }))}
                availableOptions={["all", ...cityOptions]}
                displayFormat={(val) => (val === "all" ? "All Cities & Regions" : val)}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Season / Year</Label>
              <GenericSelector
                label="Year"
                value={filters.year}
                onValueChange={(val) => setFilters((prev) => ({ ...prev, year: val }))}
                availableOptions={["all", ...yearOptions.map(String)]}
                displayFormat={(val) => (val === "all" ? "All Seasons / Career" : val)}
              />
            </div>

            <div className="space-y-2 pt-2 border-t">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={filters.activeOnly}
                  onCheckedChange={(checked) =>
                    setFilters((prev) => ({ ...prev, activeOnly: checked === true }))
                  }
                />
                Active teams only
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={filters.hasAwardsOnly}
                  onCheckedChange={(checked) =>
                    setFilters((prev) => ({ ...prev, hasAwardsOnly: checked === true }))
                  }
                />
                Has won awards
              </label>

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={filters.offlineOnly}
                  onCheckedChange={(checked) =>
                    setFilters((prev) => ({ ...prev, offlineOnly: checked === true }))
                  }
                />
                Offline Turkey pack only
              </label>
            </div>

            <div className="pt-4 border-t flex flex-col gap-2">
              <Button variant="default" onClick={() => setFiltersOpen(false)}>
                Apply Filters
              </Button>
              <Button variant="outline" onClick={resetFilters}>
                Reset to Default
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Team Detail Modal */}
      <Dialog open={selectedTeam != null} onOpenChange={(open) => !open && setSelectedTeam(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedTeam && (
            <div className="flex flex-col gap-5">
              {/* Header */}
              <DialogHeader className="border-b pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <DialogTitle className="text-2xl font-bold">
                        Team {selectedTeam.teamNumber} · {selectedTeam.name}
                      </DialogTitle>
                      {selectedTeam.active ? (
                        <Badge variant="default" className="text-xs bg-emerald-600">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                    </div>
                    <DialogDescription className="text-sm mt-1">
                      {formatTeamLocation(selectedTeam)}
                      {selectedTeam.rookieYear ? ` · Rookie ${selectedTeam.rookieYear}` : ""}
                      {selectedTeam.lastActiveYear ? ` · Last Active ${selectedTeam.lastActiveYear}` : ""}
                    </DialogDescription>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      asChild
                    >
                      <a
                        href={`https://www.thebluealliance.com/team/${selectedTeam.teamNumber}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" />
                        TBA
                      </a>
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs gap-1"
                      asChild
                    >
                      <a
                        href={`https://statbotics.io/team/${selectedTeam.teamNumber}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Statbotics
                      </a>
                    </Button>
                  </div>
                </div>
              </DialogHeader>

              {/* Career Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Career Record</div>
                  <div className="text-lg font-bold">{formatRecord(selectedTeam.careerRecord)}</div>
                  <div className="text-xs text-muted-foreground">{formatPct(selectedTeam.careerRecord?.winrate)} Winrate</div>
                </Card>

                <Card className="bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Norm EPA (Current)</div>
                  <div className="text-lg font-bold text-primary">
                    {formatNum(selectedTeam.normEpa?.current, 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Peak: {formatNum(selectedTeam.normEpa?.max, 0)} · Mean: {formatNum(selectedTeam.normEpa?.mean, 0)}
                  </div>
                </Card>

                <Card className="bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Seasons Played</div>
                  <div className="text-lg font-bold">{selectedTeam.years.length} Years</div>
                  <div className="text-xs text-muted-foreground">
                    {selectedTeam.years[0]?.year} – {selectedTeam.years[selectedTeam.years.length - 1]?.year}
                  </div>
                </Card>

                <Card className="bg-muted/40 p-3">
                  <div className="text-xs text-muted-foreground">Awards Won</div>
                  <div className="text-lg font-bold text-amber-500 flex items-center gap-1.5">
                    <Trophy className="h-4 w-4" />
                    {selectedTeam.awards?.length ?? 0}
                  </div>
                  <div className="text-xs text-muted-foreground">FRC Official Accolades</div>
                </Card>
              </div>

              {/* Awards List if available */}
              {selectedTeam.awards && selectedTeam.awards.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold flex items-center gap-1.5 text-foreground">
                    <Trophy className="h-4 w-4 text-amber-500" />
                    Awards ({selectedTeam.awards.length})
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1 border rounded-lg bg-card">
                    {selectedTeam.awards.map((award, i) => (
                      <div
                        key={`${award.year}-${award.name}-${award.eventKey}-${i}`}
                        className="flex items-center gap-2 p-2 rounded bg-muted/30 text-xs border border-border/50"
                      >
                        <Badge variant="outline" className="font-mono text-[10px] shrink-0 font-bold">
                          {award.year}
                        </Badge>
                        <div className="truncate">
                          <p className="font-semibold truncate">{award.name}</p>
                          {award.eventKey && (
                            <p className="text-[10px] text-muted-foreground uppercase">{award.eventKey}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Year by Year Progression */}
              <div className="space-y-2">
                <h3 className="text-sm font-bold text-foreground">Season by Season Progression</h3>
                <TeamYearTable years={selectedTeam.years} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
