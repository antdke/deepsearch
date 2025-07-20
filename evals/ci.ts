import type { Message } from "ai";

export const ciData: { input: Message[]; expected: string }[] = [
  {
    input: [
      {
        id: "nba1",
        role: "user",
        content:
          "What is LeBron James' current points per game average in the 2024-2025 NBA season?",
      },
    ],
    expected: "24.4 points per game",
  },
  {
    input: [
      {
        id: "nba2",
        role: "user",
        content:
          "Did LeBron James participate in the 2024 NBA All-Star Game, and what was his performance?",
      },
    ],
    expected:
      "Yes, LeBron James participated in the 2024 NBA All-Star Game, and he scored 8 points.",
  },
];
