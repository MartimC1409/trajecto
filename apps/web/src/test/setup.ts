import { afterEach } from 'vitest';

// Os testes da função do servidor (api/) correm em ambiente Node, sem DOM.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
  const { cleanup } = await import('@testing-library/react');
  const { initI18n } = await import('../i18n');
  await initI18n('pt-PT');

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });
}
