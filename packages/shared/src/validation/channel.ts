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

const permissionBits = z
  .string()
  .regex(/^(0|[1-9][0-9]{0,18})$/)
  .pipe(z.string().refine((value) => BigInt(value) <= (1n << 63n) - 1n, 'Permission bits out of range'))
const accessRuleSchema = z.object({ roleId: z.uuid(), allow: permissionBits, deny: permissionBits })
const accessRulesSchema = z
  .array(accessRuleSchema)
  .max(1000)
  .refine((rules) => new Set(rules.map((rule) => rule.roleId)).size === rules.length, 'Duplicate role')
export const saveChannelAccessSchema = z.object({
  overrides: accessRulesSchema,
  expectedOverrides: accessRulesSchema
})
