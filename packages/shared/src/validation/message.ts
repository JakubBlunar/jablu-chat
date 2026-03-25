import { z } from 'zod'

export const sendMessageSchema = z.object({
  content: z.string().max(4000, 'Message must be at most 4000 characters').optional(),
  attachmentIds: z.array(z.string().uuid()).optional(),
  replyToId: z.string().uuid().optional(),
  threadParentId: z.string().uuid().optional()
})

export const editMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(4000, 'Message must be at most 4000 characters')
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type EditMessageInput = z.infer<typeof editMessageSchema>
