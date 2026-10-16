import { useSession } from '@/hooks/use-session';

export type Lang = 'es' | 'en';
export type Copy<T> = Record<Lang, T>;

// Each screen keeps its copy next to its code; English must have exactly the Spanish keys.
export function defineCopy<T>(es: T, en: NoInfer<T>): Copy<T> {
  return { es, en };
}

export function useCopy<T>(copy: Copy<T>): T {
  return copy[useSession().lang];
}

export function useLang(): Lang {
  return useSession().lang;
}
