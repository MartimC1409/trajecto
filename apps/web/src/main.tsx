// O CSS do MapLibre vem primeiro para que as nossas regras (styles.css) o possam ajustar.
import 'maplibre-gl/dist/maplibre-gl.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { config } from './config';
import { initI18n } from './i18n';
import { ServicesProvider, createServices, getBrowserStorage } from './services';
import { registerServiceWorker } from './sw/register';

async function start() {
  const services = createServices(config, getBrowserStorage());
  await initI18n(services.preferences.getSnapshot().language);

  const container = document.getElementById('root');
  if (!container) throw new Error('Elemento #root em falta no index.html.');
  createRoot(container).render(
    <StrictMode>
      <ServicesProvider services={services}>
        <App config={config} />
      </ServicesProvider>
    </StrictMode>,
  );
}

void start();
registerServiceWorker();
