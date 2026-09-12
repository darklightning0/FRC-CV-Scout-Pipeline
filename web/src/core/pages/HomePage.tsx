import { cn } from "@/core/lib/utils";
import { DataAttribution } from "@/core/components/DataAttribution";

interface HomePageProps {
  logo?: string;
  appName?: string;
  version?: string;
  tagline?: string;
}

const HomePage = ({
  logo,
  appName = "Hunter Eyes",
  version = "2026.8.0",
  tagline = "FRC CV scouting app",
}: HomePageProps = {}) => {
  return (
    <main className="relative h-screen w-full">
      <div
        className={cn(
          "flex flex-col h-screen w-full justify-center items-center gap-6 2xl:pb-6",
          "bg-size-[40px_40px]",
          "bg-[linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)]",
          "dark:bg-[linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)]"
        )}
      >
        <div className="relative z-10 flex flex-col w-auto justify-center items-center gap-5 scale-75 md:scale-90 lg:scale-100 px-6">
          {logo ? (
            <img
              src={logo}
              width="240"
              height="240"
              alt={`${appName} Logo`}
              className="mx-auto h-40 w-auto object-contain dark:invert"
            />
          ) : null}
          <div className="text-center space-y-2">
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">{appName}</h1>
            <p className="text-base sm:text-lg text-muted-foreground">{tagline}</p>
            <p className="text-xs text-muted-foreground pt-2">Version {version}</p>
            <DataAttribution sources={['tba', 'nexus']} variant="compact" />
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white mask-[radial-gradient(ellipse_at_center,transparent_70%,black)] dark:bg-black"></div>
    </main>
  );
};

export default HomePage;
