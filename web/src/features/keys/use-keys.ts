import { useQuery } from "@tanstack/react-query";
import { getMachineKeys } from "@/api/endpoints/keys";

export const useMachineKeys = () => useQuery({ queryKey: ["machine-keys"], queryFn: getMachineKeys, staleTime: Infinity });
