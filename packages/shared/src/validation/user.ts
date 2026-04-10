import { z } from 'zod'

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .min(5, 'Display name must be at least 5 characters')
    .max(20, 'Display name must be at most 20 characters')
    .optional(),
  bio: z.string().max(190, 'Bio must be at most 190 characters').optional()
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
})

export const changeEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required for verification')
})

export const userStatusSchema = z.enum(['online', 'idle', 'dnd', 'offline'])

export const updatePushPrefsSchema = z.object({
  pushSuppressAll: z.boolean().optional(),
  pushQuietHoursEnabled: z.boolean().optional(),
  pushQuietHoursTz: z.string().max(80).nullable().optional(),
  pushQuietHoursStartMin: z.number().int().min(0).max(1439).optional(),
  pushQuietHoursEndMin: z.number().int().min(0).max(1439).optional()
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type UpdatePushPrefsInput = z.infer<typeof updatePushPrefsSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>
