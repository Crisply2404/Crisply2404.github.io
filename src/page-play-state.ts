export interface LetterState { x: number; y: number; angle: number }
export interface PagePlayState {
  selected: number;
  ball: { x: number; y: number };
  letters: LetterState[];
}

const storageKey = 'crisply2404-page-play';
const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
if (navigation?.type === 'reload') sessionStorage.removeItem(storageKey);

export function readPagePlayState(): PagePlayState | undefined {
  const states = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') as Record<string, PagePlayState>;
  return states[location.pathname];
}

export function savePagePlayState(state: PagePlayState): void {
  const states = JSON.parse(sessionStorage.getItem(storageKey) ?? '{}') as Record<string, PagePlayState>;
  states[location.pathname] = state;
  sessionStorage.setItem(storageKey, JSON.stringify(states));
}
