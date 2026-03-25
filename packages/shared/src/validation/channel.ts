import { z } from 'zod'

export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1, 'Channel name is required')
    .max(100, 'Channel name must be at most 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Channel name can only contain lowercase letters, numbers, and hyphens'),
  type: z.enum(['text', 'voice'])
})

export const updateChannelSchema = z.object({
  name: z
    .string()
    .min(1, 'Channel name is required')
    .max(100, 'Channel name must be at most 100 characters')
    .regex(/^[a-z0-9-]+$/, 'Channel name can only contain lowercase letters, numbers, and hyphens')
    .optional(),
  position: z.number().int().min(0).optional()
})

export type CreateChannelInput = z.infer<typeof createChannelSchema>
export type UpdateChannelInput = z.infer<typeof updateChannelSchema>
