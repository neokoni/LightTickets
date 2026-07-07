export interface Attachment {
  id: string;
  ticketId: number;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}
