import { useEffect, useState } from 'react';

/**
 * Mantém o ecrã ligado enquanto `active` for verdadeiro (Screen Wake Lock API).
 * O browser liberta o bloqueio quando a página fica escondida; voltamos a pedi-lo ao regressar.
 * Devolve `false` se o browser não suportar a API.
 */
export function useWakeLock(active: boolean): boolean {
  const [supported] = useState(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator);

  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        sentinel = lock;
      } catch {
        // Recusado (por exemplo, bateria fraca ou página escondida): a navegação continua.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && (!sentinel || sentinel.released)) {
        void acquire();
      }
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
    };
  }, [active, supported]);

  return supported;
}
