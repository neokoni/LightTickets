import { describe, expect, it } from 'vitest';
import { SERVER_API_KEY_TYPE, SERVER_API_KEY_TYPES } from '../src/constants/server-api-key.js';

describe('SERVER_API_KEY_TYPE', () => {
  it('defines the supported Minecraft plugin key types', () => {
    expect(SERVER_API_KEY_TYPE).toEqual({
      PAPER_FOLIA: 'paper_folia',
      VELOCITY: 'velocity',
    });
    expect(SERVER_API_KEY_TYPES).toEqual(['paper_folia', 'velocity']);
  });
});
