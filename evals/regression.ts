import type { Message } from "ai";

export const regressionData: { input: Message[]; expected: string }[] = [
  {
    input: [
      {
        id: "nba3",
        role: "user",
        content:
          "How many games has LeBron James missed due to injury in the 2024-2025 season so far?",
      },
    ],
    expected:
      "LeBron James missed a total of 31 games due to injury during the 2024-2025 season.",
  },
  {
    input: [
      {
        id: "nba4",
        role: "user",
        content: "What is the latest milestone LeBron James achieved in 2024?",
      },
    ],
    expected:
      "LeBron James became the first player in NBA history to play in his teens, 20s, 30s, and 40s. And he hit the milestone of 50,000 career points (regular season and playoffs combined) in 2025.",
  },
];
