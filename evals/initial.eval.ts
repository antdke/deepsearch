import { evalite } from "evalite";
import { askDeepSearch } from "~/deep-search";
import type { Message } from "ai";

evalite("Deep Search Eval", {
  data: async (): Promise<{ input: Message[] }[]> => {
    return [
      {
        input: [
          {
            id: "1",
            role: "user",
            content: "What is the latest news on the Lakers?",
          },
        ],
      },
      {
        input: [
          {
            id: "2",
            role: "user",
            content: "Search for the latest stock market news.",
          },
        ],
      },
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
  ],
});
