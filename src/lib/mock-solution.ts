import type { SolveResult } from "@/types/solve";

/** Demo payload so we can verify layout before wiring OmniRoute / Gemini. */
export const MOCK_SOLUTION: SolveResult = {
  problemText: "Solve for \\( x \\): \\( 2x^2 - 5x - 3 = 0 \\)",
  finalAnswer: "x = 3 \\quad \\text{or} \\quad x = -\\dfrac{1}{2}",
  steps: [
    {
      stepNumber: 1,
      title: "Identify the quadratic",
      explanation:
        "This is a quadratic equation in standard form \\( ax^2 + bx + c = 0 \\). Here \\( a = 2 \\), \\( b = -5 \\), and \\( c = -3 \\).",
      mathFormula: "2x^2 - 5x - 3 = 0",
    },
    {
      stepNumber: 2,
      title: "Factor by grouping",
      explanation:
        "Look for two numbers that multiply to \\( a \\cdot c = -6 \\) and add to \\( b = -5 \\). Those numbers are \\( -6 \\) and \\( 1 \\).",
      mathFormula: "2x^2 - 6x + x - 3 = 0",
    },
    {
      stepNumber: 3,
      title: "Group and factor",
      explanation:
        "Factor each pair, then pull out the common binomial factor \\( (x - 3) \\).",
      mathFormula: "2x(x - 3) + 1(x - 3) = (2x + 1)(x - 3) = 0",
    },
    {
      stepNumber: 4,
      title: "Solve each factor",
      explanation:
        "Set each factor equal to zero and solve for \\( x \\).",
      mathFormula: "2x + 1 = 0 \\Rightarrow x = -\\tfrac{1}{2}, \\quad x - 3 = 0 \\Rightarrow x = 3",
    },
  ],
};
