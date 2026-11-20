import { useQuery } from "@tanstack/react-query";
import { getPlugins } from "./services/plugin-service";

// Settings > Plugins switch for the current workspace (default off).
// One shared query, so every feature gate reuses the same cached request.
export function usePluginEnabled(pluginId: string): boolean {
  const { data } = useQuery({
    queryKey: ["plugins"],
    queryFn: getPlugins,
    staleTime: 10_000,
  });
  return !!data?.some((p) => p.id === pluginId && p.enabled);
}
