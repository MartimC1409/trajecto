/** Voz sintetizada do próprio dispositivo (Web Speech API). Não envia texto para servidores. */
export interface Speaker {
  readonly supported: boolean;
  /** Diz as frases por ordem, interrompendo o que estiver a ser dito. */
  speak(texts: readonly string[]): void;
  /**
   * Ativa a voz sem dizer nada (frase vazia, volume 0). O Safari do iPhone só deixa falar
   * depois de uma primeira frase pedida num toque do utilizador.
   */
  unlock(): void;
  cancel(): void;
}

/** Língua da voz para cada língua da aplicação. */
export function speechLanguage(appLanguage: string): string {
  return appLanguage === 'en' ? 'en-GB' : 'pt-PT';
}

function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: string) {
  const normalized = (v: SpeechSynthesisVoice) => v.lang.replace('_', '-').toLowerCase();
  const wanted = lang.toLowerCase();
  const prefix = wanted.split('-')[0] ?? wanted;
  return (
    voices.find((v) => normalized(v) === wanted && v.localService) ??
    voices.find((v) => normalized(v) === wanted) ??
    voices.find((v) => normalized(v).startsWith(`${prefix}-`) || normalized(v) === prefix)
  );
}

export function createSpeaker(
  lang: string,
  synth: SpeechSynthesis | undefined = globalThis.speechSynthesis,
): Speaker {
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
    return {
      supported: false,
      speak: () => undefined,
      unlock: () => undefined,
      cancel: () => undefined,
    };
  }
  return {
    supported: true,
    speak(texts) {
      const phrases = texts.map((text) => text.trim()).filter(Boolean);
      if (phrases.length === 0) return;
      // Uma instrução nova torna as anteriores desatualizadas.
      synth.cancel();
      const voice = pickVoice(synth.getVoices(), lang);
      for (const text of phrases) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = voice?.lang ?? lang;
        if (voice) utterance.voice = voice;
        synth.speak(utterance);
      }
    },
    unlock() {
      const utterance = new SpeechSynthesisUtterance(' ');
      utterance.volume = 0;
      synth.speak(utterance);
    },
    cancel() {
      synth.cancel();
    },
  };
}
