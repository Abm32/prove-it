export type OverlayQuery = { position: 'bl' | 'br' | 'tl' | 'tr'; scale: number; hideIdle: boolean; sfx: boolean; demo: boolean };

export function parseOverlayQuery(search: string): OverlayQuery {
  const params = new URLSearchParams(search);
  const requested = params.get('pos');
  const position = requested === 'br' || requested === 'tl' || requested === 'tr' ? requested : 'bl';
  const rawScale = Number(params.get('scale') ?? '1');
  return {
    position,
    scale: Number.isFinite(rawScale) ? Math.max(0.5, Math.min(1.5, rawScale)) : 1,
    hideIdle: params.get('idle') === 'hide',
    sfx: params.get('sfx') !== '0',
    demo: params.get('demo') === '1',
  };
}
