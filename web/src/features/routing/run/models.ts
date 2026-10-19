export const MODEL_GROUPS = [
  { label: "Current Claude models", options: [["claude-opus-5-5", "Claude Opus 5.5"], ["claude-sonnet-5-5", "Claude Sonnet 5.5"], ["claude-haiku-5-5", "Claude Haiku 5.5"]] },
  { label: "Previous Claude models", options: [
    ["claude-opus-5", "Claude Opus 5"], ["claude-sonnet-5", "Claude Sonnet 5"], ["claude-opus-4-8", "Claude Opus 4.8"],
    ["claude-opus-4-7", "Claude Opus 4.7"], ["claude-sonnet-4-6", "Claude Sonnet 4.6"], ["claude-haiku-4-5", "Claude Haiku 4.5"]] },
  // Any model name works: one that does not start with claude- goes to OpenAI's API.
  { label: "OpenAI models", options: [["gpt-6-sol", "GPT-6 Sol"], ["gpt-6-astra", "GPT-6 Astra"], ["gpt-6-luna", "GPT-6 Luna"]] },
] as const;
export const MODEL_IDS: string[] = MODEL_GROUPS.flatMap((g) => g.options.map(([id]) => id));
export const ROUTING_TASK = "routing-eval";
