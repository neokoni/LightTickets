export const IMAGE_TYPES: readonly string[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];
export const UPLOAD_TYPES: readonly string[] = [...IMAGE_TYPES, 'application/pdf', 'text/plain'];

export type FileSelectPayload = {
  files: File[];
  textarea: HTMLTextAreaElement;
};
