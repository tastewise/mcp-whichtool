// A tool description the console can rewrite in the source; `declared` is false when there is no description= yet.
export interface SourceDescription { name: string; title: string; description: string; revision: string; declared: boolean; path: string }
export interface Sources { tools: SourceDescription[] }
// A description written into the source: where, and the file's revision after it.
export interface Saved { tool: string; path: string; revision: string }
// An AI rewrite of one tool description, for review before it becomes the draft.
