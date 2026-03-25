import { z } from 'zod'

export const MAX_MESSAGE_LENGTH = 4000

export const sendMessageSchema = z
  .object({
    content: z
      .string()
      .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`)
      .optional(),
    attachmentIds: z.array(z.string().uuid()).max(20, 'At most 20 attachments allowed').optional(),
    replyToId: z.string().uuid().optional()
  })
  .refine((data) => (data.content && data.content.trim().length > 0) || (data.attachmentIds && data.attachmentIds.length > 0), {
    message: 'Message must have content or at least one attachment'
  })

export const editMessageSchema = z.object({
  content: z
    .string()
    .min(1, 'Message content is required')
    .max(MAX_MESSAGE_LENGTH, `Message must be at most ${MAX_MESSAGE_LENGTH} characters`)
})

export type SendMessageInput = z.infer<typeof sendMessageSchema>
export type EditMessageInput = z.infer<typeof editMessageSchema>
