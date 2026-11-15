import { POST as chatPost } from '@/app/api/chat/route';

export const maxDuration = 60;

// This compatibility route serves the same AI SDK UI-message protocol as /api/chat.
export const POST = chatPost;
