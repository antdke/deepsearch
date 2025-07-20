import { evalite } from "evalite";
import { askDeepSearch } from "~/deep-search";
import type { Message } from "ai";
import { createScorer } from "evalite";
import { generateObject } from "ai";
import { z } from "zod";
import { factualityModel } from "~/models";

const checkFactuality = async (opts: {
  question: string;
  groundTruth: string;
  submission: string;
}) => {
  const { object } = await generateObject({
    model: factualityModel,
    /**
     * Prompt taken from autoevals:
     *
     * {@link https://github.com/braintrustdata/autoevals/blob/5aa20a0a9eb8fc9e07e9e5722ebf71c68d082f32/templates/factuality.yaml}
     */
    prompt: `
      You are comparing a submitted answer to an expert answer on a given question. Here is the data:
      [BEGIN DATA]
      ************
      [Question]: ${opts.question}
      ************
      [Expert]: ${opts.groundTruth}
      ************
      [Submission]: ${opts.submission}
      ************
      [END DATA]

      Compare the factual content of the submitted answer with the expert answer. Ignore any differences in style, grammar, or punctuation.
      The submitted answer may either be a subset or superset of the expert answer, or it may conflict with it. Determine which case applies. Answer the question by selecting one of the following options:
      (A) The submitted answer is a subset of the expert answer and is fully consistent with it.
      (B) The submitted answer is a superset of the expert answer and is fully consistent with it.
      (C) The submitted answer contains all the same details as the expert answer.
      (D) There is a disagreement between the submitted answer and the expert answer.
      (E) The answers differ, but these differences don't matter from the perspective of factuality.
    `,
    schema: z.object({
      answer: z.enum(["A", "B", "C", "D", "E"]).describe("Your selection."),
      rationale: z
        .string()
        .describe("Why you chose this answer. Be very detailed."),
    }),
  });

  /**
   * LLM's are well documented at being poor at generating
   */
  const scores = {
    A: 0.4,
    B: 0.6,
    C: 1,
    D: 0,
    E: 1,
  };

  return {
    score: scores[object.answer],
    metadata: {
      rationale: object.rationale,
    },
  };
};

export const Factuality = createScorer<Message[], string, string>({
  name: "Factuality",
  scorer: async ({ input, expected, output }) => {
    const question = input[0]?.content ?? "";
    return checkFactuality({
      question,
      groundTruth: expected!,
      submission: output,
    });
  },
});

evalite("Deep Search Eval", {
  data: async (): Promise<{ input: Message[]; expected: string }[]> => {
    return [
      {
        input: [
          {
            id: "1",
            role: "user",
            content: "What is the latest version of TypeScript?",
          },
        ],
        expected: "The current TypeScript version is 5.8",
      },
      {
        input: [
          {
            id: "2",
            role: "user",
            content: "What are the main features of Next.js 15?",
          },
        ],
        expected: `
@next/codemod CLI: Easily upgrade to the latest Next.js and React versions.
Async Request APIs (Breaking): Incremental step towards a simplified rendering and caching model.
Caching Semantics (Breaking): fetch requests, GET Route Handlers, and client navigations are no longer cached by default.
React 19 Support: Support for React 19, React Compiler (Experimental), and hydration error improvements.
Turbopack Dev (Stable): Performance and stability improvements.
Static Indicator: New visual indicator shows static routes during development.
unstable_after API (Experimental): Execute code after a response finishes streaming.
instrumentation.js API (Stable): New API for server lifecycle observability.
Enhanced Forms (next/form): Enhance HTML forms with client-side navigation.
next.config: TypeScript support for next.config.ts.
Self-hosting Improvements: More control over Cache-Control headers.
Server Actions Security: Unguessable endpoints and removal of unused actions.
Bundling External Packages (Stable): New config options for App and Pages Router.
ESLint 9 Support: Added support for ESLint 9.
Development and Build Performance: Improved build times and Faster Fast Refresh.
`,
      },
      // New simple questions about LeBron James (requiring recent NBA knowledge)
      // User: Fill in the 'expected' with the current ground truth based on your expertise
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
            content:
              "What is the latest milestone LeBron James achieved in 2024?",
          },
        ],
        expected:
          "LeBron James became the first player in NBA history to play in his teens, 20s, 30s, and 40s. And he hit the milestone of 50,000 career points (regular season and playoffs combined) in 2025.",
      },

      // New multi-hop questions about LeBron James (requiring combining info from multiple sources/seasons/games)
      // These test multi-step reasoning, like comparing stats or combining historical and recent data
      // User: Fill in the 'expected' with the current ground truth
      // {
      //   input: [
      //     {
      //       id: "nba5",
      //       role: "user",
      //       content:
      //         "Compare LeBron James' scoring average in the 2024 playoffs to his average in the 2023 playoffs. What was the difference, and which teams did the Lakers face in those playoffs?",
      //     },
      //   ],
      //   expected:
      //     "[FILL IN GROUND TRUTH HERE, e.g., 'In 2024, LeBron averaged X PPG (vs Y in 2023, difference of Z). Lakers faced A, B in 2024 and C, D in 2023.']",
      // },
      // {
      //   input: [
      //     {
      //       id: "nba6",
      //       role: "user",
      //       content:
      //         "Which of LeBron James' current Lakers teammates has the most assists per game in 2024, and how does that compare to LeBron's assists per game? Who led the team in assists during LeBron's first season with the Lakers?",
      //     },
      //   ],
      //   expected: "[FILL IN GROUND TRUTH HERE]",
      // },
      // {
      //   input: [
      //     {
      //       id: "nba7",
      //       role: "user",
      //       content:
      //         "How many NBA championships has LeBron James won, and for each, what was his points per game average in those Finals series? How does his most recent championship PPG compare to his first?",
      //     },
      //   ],
      //   expected: "[FILL IN GROUND TRUTH HERE]",
      // },
      // {
      //   input: [
      //     {
      //       id: "nba8",
      //       role: "user",
      //       content:
      //         "What is LeBron James' all-time ranking in career points, and how many points does he need to reach the next milestone (e.g., 45,000 points)? Compare this to his points total at the end of the 2023 season.",
      //     },
      //   ],
      //   expected: "[FILL IN GROUND TRUTH HERE]",
      // },
    ];
  },
  task: async (input) => {
    return askDeepSearch(input);
  },
  scorers: [
    {
      name: "Contains Links",
      description: "Checks if the output contains any markdown links.",
      scorer: ({ output }) => {
        const containsLinks = /\[.*?\]\(https?:\/\/.*?\)/.test(output);
        return containsLinks ? 1 : 0;
      },
    },
    Factuality,
  ],
});
