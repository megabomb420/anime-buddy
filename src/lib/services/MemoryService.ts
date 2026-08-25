/**
 * MemoryService — Buddy's long-term semantic memory and conversation log.
 *
 * v1: conversations/messages/memories are stored and retrievable.
 * Semantic retrieval (embeddings) is intentionally left out of the local
 * build — when needed, DeepSeek can rank stored memories by relevance via
 * the Worker. Storage shape already supports it.
 */

import { db } from "@/lib/db/database";
import { persistence } from "@/lib/db/persistence";
import type { Conversation, Message, MessageRole, SemanticMemory } from "@/types/entities";

export class MemoryService {
  async startConversation(title?: string): Promise<Conversation> {
    return persistence.createConversation(title);
  }

  async latestConversation(): Promise<Conversation | undefined> {
    return db.conversations.orderBy("updatedAt").reverse().first();
  }

  async appendMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    payload?: Message["payload"],
  ): Promise<Message> {
    return persistence.addMessage({ conversationId, role, content, payload });
  }

  async getHistory(conversationId: string): Promise<Message[]> {
    return persistence.getMessages(conversationId);
  }

  async remember(
    kind: SemanticMemory["kind"],
    text: string,
    importance = 0.5,
  ): Promise<SemanticMemory> {
    return persistence.addMemory({ kind, text, importance });
  }

  /** Simple recency+importance retrieval; semantic ranking comes later. */
  async recall(limit = 20): Promise<SemanticMemory[]> {
    const all = await db.semanticMemories.toArray();
    return all
      .sort((a, b) => b.importance - a.importance || b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

export const memoryService = new MemoryService();
