import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomBytes } from 'crypto';

interface TokenEntry {
  createdAt: number;
  ip: string;
}

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

@Injectable()
export class AdminTokenStore implements OnModuleDestroy {
  private readonly tokens = new Map<string, TokenEntry>();
  private readonly cleanupTimer: ReturnType<typeof setInterval>;

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer);
  }

  create(ip: string): string {
    const token = randomBytes(32).toString('hex');
    this.tokens.set(token, { createdAt: Date.now(), ip });
    return token;
  }

  validate(token: string): boolean {
    const entry = this.tokens.get(token);
    if (!entry) return false;
    if (Date.now() - entry.createdAt > TOKEN_TTL_MS) {
      this.tokens.delete(token);
      return false;
    }
    return true;
  }

  revoke(token: string): void {
    this.tokens.delete(token);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [token, entry] of this.tokens) {
      if (now - entry.createdAt > TOKEN_TTL_MS) {
        this.tokens.delete(token);
      }
    }
  }
}
