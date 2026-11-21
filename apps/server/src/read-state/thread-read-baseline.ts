import type { Prisma } from '../prisma-client'

/** Freeze the inherited channel cursor before moving the root timeline forward. */
export async function preserveThreadReadBaselines(tx: Prisma.TransactionClient, userId: string, channelId: string, cutoff: Date) {
  await tx.$executeRaw`
    INSERT INTO inbox_thread_read_states (user_id, thread_parent_id, last_read_at)
    SELECT DISTINCT ${userId}, reply.thread_parent_id, COALESCE(crs.last_read_at, sm.joined_at)
    FROM messages reply
    JOIN channels c ON c.id = reply.channel_id
    JOIN server_members sm ON sm.server_id = c.server_id AND sm.user_id = ${userId}
    LEFT JOIN channel_read_states crs ON crs.channel_id = c.id AND crs.user_id = ${userId}
    WHERE reply.channel_id = ${channelId} AND reply.thread_parent_id IS NOT NULL AND reply.deleted = false
      AND reply.created_at > COALESCE(crs.last_read_at, sm.joined_at)
      AND reply.created_at <= ${cutoff}
    ORDER BY reply.thread_parent_id
    ON CONFLICT (user_id, thread_parent_id) DO NOTHING
  `
}
