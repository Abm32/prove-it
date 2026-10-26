import { config } from '../config.js';
import { capabilitiesFor } from './capabilities.js';
import { createCustomReward, HelixError } from './helix.js';
import { getToken, setRewardId } from './tokenStore.js';

const REWARD_TITLE = 'Dare the streamer';
const REWARD_PROMPT = 'What do you dare me to do? Be specific. ~2 min max.';

export async function ensureReward(userId: string): Promise<string | null> {
  const token = getToken(userId);
  if (!token) throw new Error(`No Twitch token stored for user ${userId}`);
  if (!capabilitiesFor(token.broadcasterType).channelPoints) return null;
  if (token.rewardId) return token.rewardId;
  try {
    const reward = await createCustomReward(userId, userId, {
      title: REWARD_TITLE,
      cost: config.DARE_COST_POINTS,
      prompt: REWARD_PROMPT,
    });
    setRewardId(userId, reward.id);
    return reward.id;
  } catch (error) {
    if (error instanceof HelixError && (error.status === 400 || error.status === 403)) {
      console.warn(`Twitch Channel Points reward unavailable for ${userId}; using chat mode.`, error.message);
      return null;
    }
    throw error;
  }
}
