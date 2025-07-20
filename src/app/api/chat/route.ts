import type { Message } from "ai";
import {
  streamText,
  createDataStreamResponse,
  appendResponseMessages,
} from "ai";
import { auth } from "~/server/auth";
import { model } from "~/models";
import { z } from "zod";
import { searchSerper } from "~/serper";
import { getRequestCountToday, insertRequest } from "~/server/db/queries";
import { upsertChat, getChat } from "~/server/db/queries";
import { Langfuse } from "langfuse";
import { env } from "~/env";
import { bulkCrawlWebsites, type BulkCrawlResponse } from "~/scraper";
import { cacheWithRedis } from "~/server/redis/redis";
import { streamFromDeepSearch } from "~/deep-search";
import { setTimeout } from "node:timers/promises";
import { checkRateLimit, recordRateLimit } from "~/server/rate-limit";
import type { RateLimitConfig } from "~/server/rate-limit";

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

  const config: RateLimitConfig = {
    maxRequests: 1,
    windowMs: 5_000,
    keyPrefix: "global",
  };

  let rateLimitCheck = await checkRateLimit(config);

  while (!rateLimitCheck.allowed) {
    console.log("Rate limit exceeded, waiting...");
    const waitTime = rateLimitCheck.resetTime - Date.now();
    if (waitTime > 0) {
      await setTimeout(waitTime);
    }
    rateLimitCheck = await checkRateLimit(config);
  }

  await recordRateLimit({
    windowMs: config.windowMs,
    keyPrefix: config.keyPrefix,
  });

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

      const result = streamFromDeepSearch({
        messages,
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
        telemetry: {
          isEnabled: true,
          functionId: "agent",
          metadata: {
            langfuseTraceId: trace.id,
          },
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
