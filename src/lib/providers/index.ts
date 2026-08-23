/**
 * Provider wiring — single place that decides which concrete providers the
 * app uses. Services import from here, never from concrete provider files.
 */

import { config } from "@/lib/config";
import type { AIProvider } from "@/types/ai";
import { DeepSeekAIProvider } from "./ai/DeepSeekAIProvider";
import { MockAIProvider } from "./ai/MockAIProvider";
import { AniListProvider } from "./catalog/AniListProvider";
import { JikanProvider } from "./catalog/JikanProvider";
import { TMDBProvider } from "./catalog/TMDBProvider";

export function createAIProvider(): AIProvider {
  return config.aiProvider === "deepseek" ? new DeepSeekAIProvider() : new MockAIProvider();
}

export const providers = {
  ai: createAIProvider(),
  catalog: new AniListProvider(),
  malExtras: new JikanProvider(),
  tmdb: new TMDBProvider(),
};
