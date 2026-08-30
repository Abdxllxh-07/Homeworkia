export type SolutionStep = {
  stepNumber: number;
  title: string;
  explanation: string;
  mathFormula: string;
};

export type SolveResult = {
  problemText: string;
  finalAnswer: string;
  steps: SolutionStep[];
  /** Which AI provider actually solved this (groq | gemini | cloudflare).
   *  Present on fresh solves; absent on old/loaded data. Lets the UI explain
   *  why two solves of the same question can differ (different model). */
  provider?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};
