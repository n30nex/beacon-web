import { useQuery } from "@tanstack/react-query";
import { getLiveSummary } from "../../api/client";
import { useRegion } from "../../hooks/useRegion";

export function useLiveSummary() {
  const { iatas, regionKey } = useRegion();

  return useQuery({
    queryKey: ["live-summary", regionKey],
    queryFn: () => getLiveSummary(iatas),
    refetchInterval: 5_000,
    staleTime: 3_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}
