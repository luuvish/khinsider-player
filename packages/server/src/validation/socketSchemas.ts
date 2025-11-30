import { z } from 'zod';

/**
 * Socket.IO event validation schemas using Zod
 * All incoming socket events should be validated against these schemas
 */

// Playback play event data
export const playbackPlaySchema = z.object({
  trackId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
});

// Playback seek event data
export const playbackSeekSchema = z.object({
  time: z.number().finite().nonnegative().max(86400) // Max 24 hours in seconds
});

// Playback time update event data
export const playbackTimeUpdateSchema = z.object({
  currentTime: z.number().finite().nonnegative().max(86400),
  duration: z.number().finite().nonnegative().max(86400)
});

// Type exports for use in handlers
export type PlaybackPlayData = z.infer<typeof playbackPlaySchema>;
export type PlaybackSeekData = z.infer<typeof playbackSeekSchema>;
export type PlaybackTimeUpdateData = z.infer<typeof playbackTimeUpdateSchema>;

/**
 * Validate socket event data against a schema
 * Returns validated data or throws an error
 */
export function validateSocketData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.map((issue: z.ZodIssue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
    throw new Error(`Validation failed: ${issues}`);
  }
  return result.data;
}
