import { z } from 'zod'

export const createServerSchema = z.object({
  name: z.string().min(1, 'Server name is required').max(100, 'Server name must be at most 100 characters')
})

export const updateServerSchema = z.object({
  name: z.string().min(1, 'Server name is required').max(100, 'Server name must be at most 100 characters').optional()
})

export type CreateServerInput = z.infer<typeof createServerSchema>
export type UpdateServerInput = z.infer<typeof updateServerSchema>
