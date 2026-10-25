import { config } from '../config.js';
import { createCustomReward } from './helix.js';
import { getToken, setRewardId } from './tokenStore.js';

const REWARD_TITLE = 'Dare the streamer';
const REWARD_PROMPT = 'What do you dare me to do? Be specific. ~2 min max.';

export async function ensureReward(userId: string): Promise<string> {
  const token = getToken(userId);
  if (!token) throw new Error(`No Twitch token stored for user ${userId}`);
  if (token.rewardId) return token.rewardId;
  const reward = await createCustomReward(userId, userId, {
    title: REWARD_TITLE,
    cost: config.DARE_COST_POINTS,
    prompt: REWARD_PROMPT,
  });
  setRewardId(userId, reward.id);
  return reward.id;
}
