import type { Score } from './music-model';

const KEY = 'scoreEditor:current';

export function saveScore(score: Score): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(score));
  } catch {
    // Storage quota exceeded — silently fail
  }
}

export function loadScore(): Score | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Score;
  } catch {
    return null;
  }
}

export function clearScore(): void {
  localStorage.removeItem(KEY);
}
