import { z } from 'zod'

export const createEventSchema = z
  .object({
    name: z.string().min(1, 'Event name is required').max(100, 'Event name must be at most 100 characters'),
    description: z.string().max(1000, 'Description must be at most 1000 characters').optional(),
    locationType: z.enum(['voice_channel', 'custom']),
    channelId: z.string().uuid().optional(),
    locationText: z.string().max(200).optional(),
    startAt: z.string().datetime(),
    endAt: z.string().datetime().optional(),
    recurrenceRule: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional()
  })
  .superRefine((data, ctx) => {
    if (data.locationType === 'voice_channel' && !data.channelId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Channel is required for voice channel events', path: ['channelId'] })
    }
    if (data.locationType === 'custom' && !data.locationText?.trim()) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Location is required for custom events', path: ['locationText'] })
    }
    if (data.endAt && data.startAt && new Date(data.endAt) <= new Date(data.startAt)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'End time must be after start time', path: ['endAt'] })
    }
  })

export const updateEventSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  locationType: z.enum(['voice_channel', 'custom']).optional(),
  channelId: z.string().uuid().optional().nullable(),
  locationText: z.string().max(200).optional().nullable(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().optional().nullable(),
  recurrenceRule: z.enum(['daily', 'weekly', 'biweekly', 'monthly']).optional().nullable()
})

export type CreateEventInput = z.infer<typeof createEventSchema>
export type UpdateEventInput = z.infer<typeof updateEventSchema>
