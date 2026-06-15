export const ROUND_DURATIONS = [
  2200, 2130, 2060, 1990, 1920, 1850,
  1750, 1690, 1630, 1570, 1510, 1450,
  1350, 1300, 1250, 1200, 1150, 1100
];

export function comboFor(streak) {
  if (streak >= 8) return 2;
  if (streak >= 5) return 1.5;
  if (streak >= 3) return 1.2;
  return 1;
}

export function baseFromMetrics(event) {
  const horizontal = Number(event.normalizedHorizontal);
  const vertical = Number(event.verticalDistance);
  if (!Number.isFinite(horizontal) || !Number.isFinite(vertical)) return 0;
  if (horizontal <= 0.22 && vertical <= 16) return 300;
  if (horizontal <= 0.55 && vertical <= 42) return 200;
  if (horizontal <= 1 && vertical <= 66) return 100;
  return 0;
}

export function validateGameEvents(events) {
  let score = 0;
  let streak = 0;
  let perfects = 0;
  let bestCombo = 1;
  let quality = 0;
  let risk = 0;
  let lastElapsed = 0;

  if (!Array.isArray(events) || events.length !== 18) {
    return { accepted: false, risk: 100, score: 0 };
  }

  events.forEach((event, index) => {
    const round = index + 1;
    if (event.round !== round || event.elapsedMs < lastElapsed) risk += 30;
    lastElapsed = event.elapsedMs;
    if (event.roundDuration !== ROUND_DURATIONS[index]) risk += 10;

    const roundElapsed = Number(event.roundElapsedMs);
    if (
      !Number.isFinite(roundElapsed) ||
      roundElapsed < 0 ||
      roundElapsed > ROUND_DURATIONS[index] + 150
    ) {
      risk += 25;
    }

    const base = baseFromMetrics(event);
    if (event.base !== base) risk += 80;
    if (base === 300) perfects += 1;
    quality += base === 300 ? 1 : base === 200 ? 0.72 : base === 100 ? 0.42 : 0;
    streak = base ? streak + 1 : 0;
    const multiplier = comboFor(streak);
    bestCombo = Math.max(bestCombo, multiplier);
    score += Math.round(base * multiplier * (round >= 16 ? 2 : 1));
  });

  return {
    accepted: risk < 80,
    risk,
    score,
    perfects,
    bestCombo,
    accuracy: Math.round((quality / 18) * 100)
  };
}
