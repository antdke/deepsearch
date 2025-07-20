import type { Message, Tool, ToolExecutionOptions } from "ai";
import { streamText } from "ai";
import type { StreamTextResult } from "ai";

import { model } from "~/models";
import { z } from "zod";
import { searchSerper } from "~/serper";
import { bulkCrawlWebsites } from "~/scraper";
import type { BulkCrawlResponse } from "~/scraper";
import { cacheWithRedis } from "~/server/redis/redis";

type TelemetrySettings = Parameters<
  typeof streamText
>[0]["experimental_telemetry"];
type OnFinish = Parameters<typeof streamText>[0]["onFinish"];

export const streamFromDeepSearch = (opts: {
  messages: Message[];
  onFinish?: OnFinish;
  telemetry?: TelemetrySettings;
  isTest?: boolean; // Add this
}) => {
  const isTest = opts.isTest ?? false;

  if (isTest) {
    const mockText =
      "Mock answer with [source](https://mock.com) based on test data.";
    return {
      textStream: new ReadableStream({
        start(controller) {
          controller.enqueue(mockText);
          controller.close();
        },
      }),
      text: Promise.resolve(mockText),
    } as unknown as StreamTextResult<any, any>;
  }

  const currentDate = new Date().toISOString().split("T")[0] ?? "unknown";

  const scrapePages = cacheWithRedis(
    "scrapePages",
    async (urls: string[]): Promise<BulkCrawlResponse> =>
      bulkCrawlWebsites({ urls }),
  );

  const searchParams = z.object({
    query: z.string().describe("The query to search the web for"),
  });

  const scrapeParams = z.object({
    urls: z.array(z.string().describe("The URLs to scrape for full content")),
  });

  const searchExecute = async (
    args: z.infer<typeof searchParams>,
    options: ToolExecutionOptions,
  ) => {
    if (isTest) {
      return [
        {
          title: "Mock Title",
          link: "https://mock.com",
          snippet: "Mock snippet",
          date: "2023",
        },
      ];
    } else {
      const { query } = args;
      const { abortSignal } = options;
      const results = await searchSerper({ q: query, num: 10 }, abortSignal);
      return results.organic.map((result) => ({
        title: result.title,
        link: result.link,
        snippet: result.snippet,
        date: result.date ?? "unknown",
      }));
    }
  };

  const scrapeExecute = async (
    args: z.infer<typeof scrapeParams>,
    options: ToolExecutionOptions,
  ) => {
    if (isTest) {
      return {
        results: [
          { url: "https://mock.com", content: "Mock content", success: true },
        ],
      };
    } else {
      const { urls } = args;
      return scrapePages(urls);
    }
  };

  const tools: Record<string, Tool<any, any>> = {
    searchWeb: {
      parameters: searchParams,
      execute: searchExecute,
    },
    scrapePages: {
      parameters: scrapeParams,
      execute: scrapeExecute,
    },
  };

  return streamText({
    model,
    messages: opts.messages,
    system: `You are a helpful AI assistant with access to a 'searchWeb' tool that allows you to search the internet for up-to-date information. For every user query, first use the searchWeb tool to gather relevant information. Then, ALWAYS use the 'scrapePages' tool to scrape the full content from multiple relevant URLs returned by the search (THIS IS IMPORTANT). Formulate your response based on the scraped content and search results. Always cite your sources using inline markdown links, like [source](link). Provide accurate and helpful answers.

The current date is ${currentDate}. When the user asks for up-to-date information, incorporate this date into your search queries to ensure timeliness. For example, if asking about recent events, include the year or date in the query.`,
    tools,
    maxSteps: isTest ? 2 : 10, // Reduce steps for tests
    onFinish: opts.onFinish,
    experimental_telemetry: opts.telemetry,
  });
};

export async function askDeepSearch(messages: Message[]) {
  const result = streamFromDeepSearch({
    messages,
    onFinish: () => {},
    telemetry: { isEnabled: false },
    isTest: false, // Change to false for real model in evals
  });

  console.log("Starting stream consumption...");

  const reader = result.textStream.getReader();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    console.log("Chunk received:", value);
    fullText += value;
  }

  console.log("Full text:", fullText);

  return fullText;
}
