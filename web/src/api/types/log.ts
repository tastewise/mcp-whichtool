// logfmt.LogLine plus the raw line; task output only carries `line`.
export interface LogEntry { line: string; ts?: string; level?: string; text?: string; continuation?: boolean }
