import type { Message } from "ai";
import { streamText, createDataStreamResponse } from "ai";
import { auth } from "~/server/auth";
import { model } from "~/models";
import { z } from "zod";
import { searchSerper } from "~/serper";
import { getRequestCountToday, insertRequest } from "~/server/db/queries";
import { appendResponseMessages } from "ai";
import { upsertChat, getChat } from "~/server/db/queries";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = session.user.isAdmin;

  const { messages, chatId }: { messages: Message[]; chatId?: string } =
    await request.json();

  if (!isAdmin) {
    const count = await getRequestCountToday(userId);
    const LIMIT = 1;
    if (count >= LIMIT) {
      return new Response("Too Many Requests", { status: 429 });
    }
  }

  await insertRequest(userId);

  let currentChatId = chatId ?? crypto.randomUUID();
  let title = "New Chat";

  if (!chatId) {
    const userMessageContent =
      messages.find((m) => m.role === "user")?.content ?? "New Chat";
    title = userMessageContent.slice(0, 100);
    await upsertChat({ userId, chatId: currentChatId, title, messages });
  }

  return createDataStreamResponse({
    execute: async (dataStream) => {
      const result = streamText({
        model,
        messages,
        system: `You are a helpful AI assistant with access to a 'searchWeb' tool that allows you to search the internet for up-to-date information. For every user query, first use the searchWeb tool to gather relevant information. Then, formulate your response based on the search results. Always cite your sources using inline markdown links, like [source](link). Provide accurate and helpful answers.`,
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
              }));
            },
          },
        },
        maxSteps: 10,
        onFinish: async ({ response }) => {
          const responseMessages = response.messages ?? [];
          const updatedMessages = appendResponseMessages({
            messages,
            responseMessages,
          });

          if (chatId) {
            const existingChat = await getChat(chatId!, userId);
            if (existingChat) {
              title = existingChat.title ?? "Chat With AI";
            }
          }

          await upsertChat({
            userId,
            chatId: currentChatId,
            title,
            messages: updatedMessages,
          });
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
