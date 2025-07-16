import { db } from "./index";
import { userRequests } from "./schema";
import { and, eq, count, sql } from "drizzle-orm";

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
