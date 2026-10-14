import { setWorkerUrl } from 'maplibre-gl';
// O Vite empacota o "worker" do MapLibre (com as suas dependências) num ficheiro próprio
// e devolve o URL. Sem isto, o MapLibre procuraria o worker num caminho que o Vite não gera.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

setWorkerUrl(workerUrl);
