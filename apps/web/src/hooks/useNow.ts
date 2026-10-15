import { useEffect, useState } from 'react';

/** Hora atual (ms), atualizada a cada `intervalMs` (por omissão, a cada 30 s). */
export function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}
