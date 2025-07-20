import type { Message } from "ai";
import { streamText, createDataStreamResponse } from "ai";
import { auth } from "~/server/auth";
import { model } from "~/models";
import { z } from "zod";
import { searchSerper } from "~/serper";
import { getRequestCountToday, insertRequest } from "~/server/db/queries";
import { appendResponseMessages } from "ai";
import { upsertChat, getChat } from "~/server/db/queries";
import { Langfuse } from "langfuse";
import { env } from "~/env";
import { bulkCrawlWebsites, type BulkCrawlResponse } from "~/scraper";
import { cacheWithRedis } from "~/server/redis/redis";

export const maxDuration = 60;

const langfuse = new Langfuse({
  secretKey: env.LANGFUSE_SECRET_KEY,
  publicKey: env.LANGFUSE_PUBLIC_KEY,
  baseUrl: env.LANGFUSE_BASEURL,
  environment: env.NODE_ENV,
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = session.user.isAdmin;

  const {
    messages,
    chatId,
    isNewChat,
  }: { messages: Message[]; chatId: string; isNewChat?: boolean } =
    await request.json();

  const trace = langfuse.trace({
    name: "chat",
    userId: session.user.id,
  });

  let currentChatId = chatId;

  trace.update({
    sessionId: currentChatId,
  });

  if (!isAdmin) {
    const countSpan = trace.span({
      name: "get-request-count-today",
      input: { userId },
    });
    const count = await getRequestCountToday(userId);
    countSpan.end({
      output: { count },
    });
    const LIMIT = 1;
    if (count >= LIMIT) {
      return new Response("Too Many Requests", { status: 429 });
    }
  }

  const insertSpan = trace.span({
    name: "insert-request",
    input: { userId },
  });
  await insertRequest(userId);
  insertSpan.end({});

  const scrapePages = cacheWithRedis(
    "scrapePages",
    async (urls: string[]): Promise<BulkCrawlResponse> => {
      return bulkCrawlWebsites({ urls });
    },
  );

  let title = "New Chat";

  if (isNewChat) {
    const userMessageContent =
      messages.find((m) => m.role === "user")?.content ?? "New Chat";
    title = userMessageContent.slice(0, 100);
    const upsertNewSpan = trace.span({
      name: "upsert-new-chat",
      input: { userId, chatId: currentChatId, title, messages },
    });
    await upsertChat({ userId, chatId: currentChatId, title, messages });
    upsertNewSpan.end({});
  }

  return createDataStreamResponse({
    execute: async (dataStream) => {
      if (isNewChat) {
        dataStream.writeData({
          type: "NEW_CHAT_CREATED",
          chatId: currentChatId,
        });
      }
      const currentDate = new Date().toISOString().split("T")[0];

      const result = streamText({
        model,
        messages,
        system: `You are a helpful AI assistant with access to a 'searchWeb' tool that allows you to search the internet for up-to-date information. For every user query, first use the searchWeb tool to gather relevant information. Then, ALWAYS use the 'scrapePages' tool to scrape the full content from multiple relevant URLs returned by the search (THIS IS IMPORTANT). Formulate your response based on the scraped content and search results. Always cite your sources using inline markdown links, like [source](link). Provide accurate and helpful answers.

The current date is ${currentDate}. When the user asks for up-to-date information, incorporate this date into your search queries to ensure timeliness. For example, if asking about recent events, include the year or date in the query.`,
        tools: {
          searchWeb: {
            parameters: z.object({
              query: z.string().describe("The query to search the web for"),
            }),
            execute: async ({ query }, { abortSignal }) => {
              const results = await searchSerper(
                { q: query, num: 10 },
                abortSignal,
              );

              return results.organic.map((result) => ({
                title: result.title,
                link: result.link,
                snippet: result.snippet,
                date: result.date ?? "unknown",
              }));
            },
          },
          scrapePages: {
            parameters: z.object({
              urls: z.array(
                z.string().describe("The URLs to scrape for full content"),
              ),
            }),
            execute: async ({ urls }) => {
              return scrapePages(urls);
            },
          },
        },
        maxSteps: 10,
        experimental_telemetry: {
          isEnabled: true,
          functionId: "agent",
          metadata: {
            langfuseTraceId: trace.id,
          },
        },
        onFinish: async ({ response }) => {
          const responseMessages = response.messages ?? [];
          const updatedMessages = appendResponseMessages({
            messages,
            responseMessages,
          });

          if (!isNewChat) {
            const getSpan = trace.span({
              name: "get-existing-chat",
              input: { chatId: currentChatId, userId },
            });
            const existingChat = await getChat(currentChatId, userId);
            getSpan.end({
              output: existingChat,
            });
            if (existingChat) {
              title = existingChat.title ?? "Chat With AI";
            }
          }

          await langfuse.flushAsync();
          const upsertSpan = trace.span({
            name: "upsert-chat-messages",
            input: {
              userId,
              chatId: currentChatId,
              title,
              messages: updatedMessages,
            },
          });
          await upsertChat({
            userId,
            chatId: currentChatId,
            title,
            messages: updatedMessages,
          });
          upsertSpan.end({});
        },
      });

      result.mergeIntoDataStream(dataStream);
    },
    onError: (e) => {
      console.error(e);
      return "Oops, an error occured!";
    },
  });
}
