import { z } from "zod";

export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(2, "Username must be at least 2 characters")
    .max(32, "Username must be at most 32 characters")
    .regex(
      /^[a-zA-Z0-9_-]+$/,
      "Username can only contain letters, numbers, hyphens, and underscores",
    )
    .optional(),
  bio: z.string().max(190, "Bio must be at most 190 characters").optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password must be at most 128 characters"),
});

export const changeEmailSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required for verification"),
});

export const userStatusSchema = z.enum(["online", "idle", "dnd", "offline"]);

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
