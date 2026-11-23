import { invokeCommand } from './client';

export const encryption = {
  hasPassword: () => invokeCommand<boolean>('encryption_has_password'),
  isUnlocked: () => invokeCommand<boolean>('encryption_is_unlocked'),
  verifyPassword: (password: string) =>
    invokeCommand<boolean>('encryption_verify_password', { password }),
  setPassword: (password: string) => invokeCommand<void>('encryption_set_password', { password }),
  changePassword: (oldPassword: string, newPassword: string) =>
    invokeCommand<boolean>('encryption_change_password', { oldPassword, newPassword }),
  removePassword: (password: string) =>
    invokeCommand<boolean>('encryption_remove_password', { password }),
  lockAll: () => invokeCommand<void>('encryption_lock_all'),
};
