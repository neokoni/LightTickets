import { apiFetch } from './client';
import type { BrandingSlot, BrandingState } from '@/types/site';

export function apiUploadBranding(slot: BrandingSlot, file: File): Promise<BrandingState> {
  const form = new FormData();
  form.append('file', file);
  return apiFetch<BrandingState>(`/branding/${slot}`, { method: 'PUT', body: form });
}

export function apiDeleteBranding(slot: BrandingSlot): Promise<BrandingState> {
  return apiFetch<BrandingState>(`/branding/${slot}`, { method: 'DELETE' });
}
