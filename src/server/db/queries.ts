import { db } from "./index";
import { userRequests } from "./schema";
import { and, eq, count, sql, asc, desc } from "drizzle-orm";
import { chats, messages } from "./schema";
import type { Message } from "ai";

export async function getRequestCountToday(userId: string): Promise<number> {
  const result = await db
    .select({ count: count() })
    .from(userRequests)
    .where(
      and(
        eq(userRequests.userId, userId),
        sql`${userRequests.createdAt} >= CURRENT_DATE`,
      ),
    );
  return result[0]?.count ?? 0;
}

export async function insertRequest(userId: string): Promise<void> {
  await db.insert(userRequests).values({ userId });
}

export const upsertChat = async (opts: {
  userId: string;
  chatId: string;
  title: string;
  messages: Message[];
}) => {
  const chatExists = await db
    .select()
    .from(chats)
    .where(eq(chats.id, opts.chatId))
    .limit(1);

  if (chatExists.length > 0) {
    if (chatExists[0]!.userId !== opts.userId) {
      throw new Error("Chat does not belong to user");
    }

    await db
      .update(chats)
      .set({ title: opts.title })
      .where(eq(chats.id, opts.chatId));
    await db.delete(messages).where(eq(messages.chatId, opts.chatId));
  } else {
    await db.insert(chats).values({
      id: opts.chatId,
      userId: opts.userId,
      title: opts.title,
      createdAt: new Date(),
    });
  }

  const inserts = opts.messages.map((m, index) => ({
    id: m.id,
    chatId: opts.chatId,
    role: m.role,
    parts: m.parts,
    order: index,
    createdAt: new Date(),
  }));

  if (inserts.length > 0) {
    await db.insert(messages).values(inserts);
  }
};

export const getChat = async (chatId: string, userId: string) => {
  const chat = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1);

  if (chat.length === 0) return null;

  const dbMessages = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, chatId))
    .orderBy(asc(messages.order));

  const aiMessages: Message[] = dbMessages.map((m) => ({
    id: m.id,
    role: m.role as Message["role"],
    parts: m.parts as Message["parts"],
    content: "",
  }));

  return { ...chat[0], messages: aiMessages };
};

export const getChats = async (userId: string) => {
  return await db
    .select()
    .from(chats)
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.createdAt));
};
