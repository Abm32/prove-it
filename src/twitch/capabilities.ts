export type BroadcasterType = '' | 'affiliate' | 'partner';

export interface ChannelCapabilities {
  channelPoints: boolean;
  bits: boolean;
  clips: boolean;
  polls: boolean;
  mode: 'points' | 'chat';
}

export function capabilitiesFor(broadcasterType: BroadcasterType): ChannelCapabilities {
  const eligible = broadcasterType === 'affiliate' || broadcasterType === 'partner';
  return {
    channelPoints: eligible,
    bits: eligible,
    clips: eligible,
    polls: eligible,
    mode: eligible ? 'points' : 'chat',
  };
}
