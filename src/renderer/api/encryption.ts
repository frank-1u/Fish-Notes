import { unavailable } from './client';

// T3 replaces these placeholders.
export const encryption = {
  async hasPassword(): Promise<boolean> {
    return false;
  },
  async isUnlocked(): Promise<boolean> {
    return false;
  },
  async verifyPassword(_password: string): Promise<boolean> {
    throw unavailable('Note encryption');
  },
  async setPassword(_password: string): Promise<boolean> {
    throw unavailable('Note encryption');
  },
  async changePassword(_oldPassword: string, _newPassword: string): Promise<boolean> {
    throw unavailable('Note encryption');
  },
  async removePassword(_password: string): Promise<boolean> {
    throw unavailable('Note encryption');
  },
  async lockAll(): Promise<boolean> {
    throw unavailable('Note encryption');
  },
};
