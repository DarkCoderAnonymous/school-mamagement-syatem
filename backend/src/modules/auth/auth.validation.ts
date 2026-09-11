/**
 * Auth validation lives in `@sms/shared` so backend guards and the web/mobile
 * forms enforce literally the same rules (master prompt, rule 9). Re-exported
 * here so route files keep importing from their own module, as every other
 * module does.
 */
export {
  loginSchema,
  selectSchoolSchema,
  switchSchoolSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from '@sms/shared';

export type {
  LoginInput,
  SelectSchoolInput,
  SwitchSchoolInput,
  ResetPasswordInput,
  ChangePasswordInput,
} from '@sms/shared';
