import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistance } from '../format';
import type { Services } from '../services';
import type { NavigationSession, NavigationState, NavigationTarget } from './session';
import { createNavigationSession } from './session';
import { createSpeaker, speechLanguage } from './speech';

export interface NavigationControls {
  readonly state: NavigationState | null;
  readonly voiceSupported: boolean;
  /** Tem de ser chamado diretamente no clique do utilizador (o iPhone só ativa a voz assim). */
  start(target: NavigationTarget): void;
  /** Liga ou desliga a voz; tem de ser chamado no toque do utilizador (iPhone). */
  setVoiceEnabled(enabled: boolean): void;
  stop(): void;
  setSimulationSpeed(factor: number): void;
}

export function useNavigation(
  services: Pick<Services, 'router' | 'geolocation'>,
  voiceEnabled: boolean,
  onVoiceChange: (enabled: boolean) => void,
): NavigationControls {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<NavigationState | null>(null);
  const [speaker, setSpeaker] = useState(() => createSpeaker(speechLanguage(i18n.language)));
  const live = useRef({ t, language: i18n.language, voiceEnabled, speaker });

  // Valores atuais para as funções chamadas fora do React (GPS, temporizadores).
  useEffect(() => {
    live.current = { t, language: i18n.language, voiceEnabled, speaker };
    if (!voiceEnabled) speaker.cancel();
  }, [t, i18n.language, voiceEnabled, speaker]);

  // A voz muda com a língua da aplicação.
  const [speakerLanguage, setSpeakerLanguage] = useState(i18n.language);
  if (speakerLanguage !== i18n.language) {
    setSpeakerLanguage(i18n.language);
    setSpeaker(createSpeaker(speechLanguage(i18n.language)));
  }

  // A sessão é criada no primeiro "Iniciar" (num clique, nunca durante a renderização).
  const sessionRef = useRef<NavigationSession | null>(null);
  function getSession(): NavigationSession {
    sessionRef.current ??= createNavigationSession({
      router: services.router,
      geolocation: services.geolocation,
      speak: (texts) => {
        if (live.current.voiceEnabled) live.current.speaker.speak(texts);
      },
      formatAlert: (meters, instruction) =>
        live.current.t('nav.alert', {
          distance: formatDistance(meters, live.current.language, true),
          instruction,
        }),
      reroutingMessage: () => live.current.t('nav.rerouting'),
      alertMessage: (kind, meters, detail) =>
        live.current.t(
          detail === undefined ? `alerts.spoken.${kind}` : `alerts.spokenWithLimit.${kind}`,
          {
            distance: formatDistance(meters, live.current.language, true),
            limit: detail,
            defaultValue: '',
          },
        ),
      onChange: setState,
    });
    return sessionRef.current;
  }

  useEffect(
    () => () => {
      sessionRef.current?.stop();
      live.current.speaker.cancel();
    },
    [],
  );

  return {
    state,
    voiceSupported: speaker.supported,
    start(target) {
      // Dentro do toque: com a voz ligada diz "A iniciar…"; desligada, só ativa a voz em silêncio
      // para poder ser ligada mais tarde durante a viagem.
      if (voiceEnabled) speaker.speak([t('nav.starting')]);
      else speaker.unlock();
      getSession().start(target);
    },
    setVoiceEnabled(enabled) {
      if (enabled) speaker.speak([t('nav.voiceEnabled')]);
      else speaker.cancel();
      onVoiceChange(enabled);
    },
    stop() {
      sessionRef.current?.stop();
      speaker.cancel();
    },
    setSimulationSpeed: (factor) => sessionRef.current?.setSimulationSpeed(factor),
  };
}
