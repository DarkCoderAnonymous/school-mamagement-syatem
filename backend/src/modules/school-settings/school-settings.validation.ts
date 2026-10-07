import { z } from 'zod';
import { SCHOOL_THEME_KEYS } from '@sms/shared';

export const updateSchoolSettingsSchema = z
  .object({
    theme: z.enum(SCHOOL_THEME_KEYS, { message: 'Choose one of the palettes' }),
  })
  .strict();

export type UpdateSchoolSettingsInput = z.infer<typeof updateSchoolSettingsSchema>;
