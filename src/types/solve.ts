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
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};
