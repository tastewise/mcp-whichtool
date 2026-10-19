export const keys = {
  project: ["project"] as const,
  routing: (filter: string, model: string) => ["routing", filter, model] as const,
  run: (id: string) => ["routing-run", id] as const,
  catalog: ["routing-catalog"] as const,
  descriptions: ["routing-descriptions"] as const,
};
