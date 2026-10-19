import { create } from "zustand";
import type { CaseRow } from "@/api/types/routing";
import { consumeProgress, initialLive, resetProgress, updateProgressState, type Live } from "./routing-live";

export interface CaseDialogState { editing: string | null; initial: CaseRow; scenarioFocus: boolean }

// One test the AI proposed, as edited since, and whether it is ticked to run.
export interface ProposedItem { key: string; row: CaseRow; picked: boolean }
// The AI's proposals not kept yet: they outlive the page that shows them, so the library can lead back to them.
// `ran`: the keys the last run of them took, so Keep and the report are still there on the way back.
export interface Proposed { items: ProposedItem[]; cost: number | null; failed: string[]; ran: string[] | null }

interface RoutingState {
  draws: 1 | 3; setDraws: (draws: 1 | 3) => void;
  filter: string; setFilter: (filter: string) => void;
  ticked: Set<string>; setTicked: (ticked: Set<string>, filter: string) => void;
  model: string; setModel: (model: string) => void;
  // The model that writes tests with AI: empty until picked, then the same for every place that writes them.
  writer: string; setWriter: (writer: string) => void;
  // How many tests AI writes for each tool: the recommendation until the user picks another count.
  perTool: number; setPerTool: (perTool: number) => void;
  // Tests under review are on screen: their run shows there, not above the library.
  reviewing: boolean; setReviewing: (reviewing: boolean) => void;
  proposals: Proposed | null; setProposals: (proposals: Proposed | null) => void;
  // The page that adds tests, over a library that has some: its back arrow leads there.
  adding: boolean; setAdding: (adding: boolean) => void;
  live: Live; resetLive: () => void; updateLive: (running: boolean, exitCode: number | null | undefined, startedAt: number) => void;
  consumeLine: (line: string) => boolean;
  caseDialog: CaseDialogState | null; openCase: (initial: CaseRow, editing: string | null, scenarioFocus?: boolean) => void; closeCase: () => void;
  casePage: number; setCasePage: (page: number) => void;
  caseSearch: string; setCaseSearch: (search: string) => void;
  caseTool: string; setCaseTool: (tool: string) => void;
  caseStatus: string | null; setCaseStatus: (status: string | null) => void;
  addedTests: number; noteAdded: (count: number) => void; clearAdded: () => void;
  runOpen: string | null; setRunOpen: (id: string | null) => void;
}

// The server's recommendation (routing_advice.RECOMMENDED_CASES) and its ceiling.
export const RECOMMENDED_TESTS = 6;
export const MAX_TESTS = 15;

export const useRoutingStore = create<RoutingState>((set, get) => ({
  draws: 3, setDraws: (draws) => set({ draws }),
  filter: "", setFilter: (filter) => set({ filter }),
  // The ticked tests and the filter the run takes move together: the bar prices and runs exactly what is ticked.
  ticked: new Set(), setTicked: (ticked, filter) => set({ ticked, filter }),
  model: "", setModel: (model) => set({ model }),
  writer: "", setWriter: (writer) => set({ writer }),
  perTool: RECOMMENDED_TESTS, setPerTool: (perTool) => set({ perTool }),
  reviewing: false, setReviewing: (reviewing) => set({ reviewing }),
  proposals: null, setProposals: (proposals) => set({ proposals }),
  adding: false, setAdding: (adding) => set({ adding }),
  live: initialLive(),
  resetLive: () => set({ live: resetProgress(get().live) }),
  updateLive: (running, exitCode, startedAt) => { const next = updateProgressState(get().live, running, exitCode, startedAt); if (next !== get().live) set({ live: next }); },
  consumeLine: (line) => { const { live, consumed } = consumeProgress(get().live, line); if (consumed) set({ live }); return consumed; },
  caseDialog: null,
  openCase: (initial, editing, scenarioFocus = false) => set({ caseDialog: { editing, initial, scenarioFocus } }),
  closeCase: () => set({ caseDialog: null }),
  casePage: 1, setCasePage: (casePage) => set({ casePage }),
  caseSearch: "", setCaseSearch: (caseSearch) => set({ caseSearch, casePage: 1 }),
  caseTool: "", setCaseTool: (caseTool) => set({ caseTool, casePage: 1 }),
  caseStatus: null, setCaseStatus: (caseStatus) => set({ caseStatus }),
  // Tests added since the Add test drawer opened: adds add up until the notice is dismissed.
  addedTests: 0, noteAdded: (count) => set({ addedTests: get().addedTests + count }), clearAdded: () => set({ addedTests: 0 }),
  runOpen: null, setRunOpen: (runOpen) => set({ runOpen }),
}));
