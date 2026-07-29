import { describe, expect, it } from 'vitest';
import { generateMinecraftSecret, hashMinecraftSecret } from '../src/utils/minecraft-credential.js';

describe('minecraft credential utilities', () => {
  it('generates independent URL-safe secrets with sufficient entropy', () => {
    const first = generateMinecraftSecret();
    const second = generateMinecraftSecret();

    expect(first).not.toBe(second);
    expect(first).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(first.length).toBeGreaterThanOrEqual(43);
  });

  it('hashes credentials deterministically without retaining plaintext', () => {
    const credential = 'minecraft-player-credential-test-value';
    const hash = hashMinecraftSecret(credential);

    expect(hash).toBe(hashMinecraftSecret(credential));
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain(credential);
  });
});
