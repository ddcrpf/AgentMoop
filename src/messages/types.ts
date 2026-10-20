import type { AttachmentMeta } from '../attachments/store.js';
export type Principal = { userId: string; connectionId: string; scopes: string[] };
export type Message = { id: number; conversationId: string; senderId: string; recipientId: string; senderHandle: string; body: string; context: string | null; replyTo: number | null; createdAt: string; kind: 'text' | 'summary' | 'context'; sourceName: string | null; attachment: AttachmentMeta | null };
export type Page<T> = { items: T[]; nextCursor: number | null };
export type Notice = { messageId: number; conversationId: string; senderHandle: string };
export type DeliveryResult = { status: 'submitted' | 'failed'; error?: string };
