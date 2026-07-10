export interface Attachment {
  id: string;
  ticketId: number | null;
  commentId?: string | null;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
