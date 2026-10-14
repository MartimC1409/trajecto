import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpeaker, speechLanguage } from './speech';

class FakeUtterance {
  lang = '';
  voice: unknown = null;
  constructor(public text: string) {}
}

function fakeSynth(voices: Partial<SpeechSynthesisVoice>[]) {
  return {
    cancel: vi.fn(),
    speak: vi.fn(),
    getVoices: () => voices as SpeechSynthesisVoice[],
  } as unknown as SpeechSynthesis & {
    cancel: ReturnType<typeof vi.fn>;
    speak: ReturnType<typeof vi.fn>;
  };
}

describe('speech', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('escolhe a língua da voz', () => {
    expect(speechLanguage('pt-PT')).toBe('pt-PT');
    expect(speechLanguage('en')).toBe('en-GB');
  });

  it('diz as frases com uma voz pt-PT, interrompendo as anteriores', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const synth = fakeSynth([
      { lang: 'pt-BR', localService: true },
      { lang: 'pt_PT', localService: false },
      { lang: 'pt-PT', localService: true, name: 'Joana' },
    ]);
    const speaker = createSpeaker('pt-PT', synth);
    expect(speaker.supported).toBe(true);
    speaker.speak(['  Vire à direita. ', '', 'Continue.']);
    expect(synth.cancel).toHaveBeenCalledTimes(1);
    const spoken = synth.speak.mock.calls.map(([u]) => u as FakeUtterance);
    expect(spoken.map((u) => u.text)).toEqual(['Vire à direita.', 'Continue.']);
    expect(spoken[0]).toMatchObject({ lang: 'pt-PT', voice: { name: 'Joana' } });
    speaker.speak([' ']);
    expect(synth.speak).toHaveBeenCalledTimes(2);
    speaker.cancel();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
  });

  it('usa outra variante da língua ou a voz por omissão', () => {
    vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance);
    const brazil = fakeSynth([{ lang: 'pt-BR', localService: true }]);
    createSpeaker('pt-PT', brazil).speak(['Olá']);
    expect(brazil.speak.mock.calls[0]?.[0]).toMatchObject({ lang: 'pt-BR' });
    const none = fakeSynth([{ lang: 'de-DE', localService: true }]);
    createSpeaker('pt-PT', none).speak(['Olá']);
    expect(none.speak.mock.calls[0]?.[0]).toMatchObject({ lang: 'pt-PT', voice: null });
  });

  it('não faz nada sem suporte de voz', () => {
    const speaker = createSpeaker('pt-PT', undefined);
    expect(speaker.supported).toBe(false);
    speaker.speak(['x']);
    speaker.cancel();
  });
});
