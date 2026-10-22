import { useCallback, useEffect, useRef, useState } from "react";
import type { Phase } from "../game/types";

type AudioTrack = "lobby" | "gameplay" | "settlement";

const TRACK_SOURCES: Record<AudioTrack, string> = {
  lobby: "/audio/lobby.wav",
  gameplay: "/audio/gameplay.wav",
  settlement: "/audio/settlement.wav",
};

const SFX_SOURCES = {
  deal: "/audio/deal.wav",
  play: "/audio/play-card.wav",
};

const TRACK_FOR_PHASE: Record<Phase, AudioTrack> = {
  coin: "lobby",
  dealing: "lobby",
  revolt: "lobby",
  chooseBottom: "lobby",
  burying: "lobby",
  reveal: "lobby",
  redeal: "lobby",
  playing: "gameplay",
  trickReview: "gameplay",
  finalReveal: "settlement",
  roundEnd: "settlement",
};

const VOLUME_KEY = "upgrade-music-volume";
const MUTED_KEY = "upgrade-music-muted";

function initialVolume(): number {
  const raw = window.localStorage.getItem(VOLUME_KEY);
  if (raw === null) return 0.25;
  const stored = Number(raw);
  return Number.isFinite(stored) && stored >= 0 && stored <= 1 ? stored : 0.25;
}

function initialMuted(): boolean {
  return window.localStorage.getItem(MUTED_KEY) === "true";
}

export function useGameAudio(phase: Phase) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dealSoundRef = useRef<HTMLAudioElement | null>(null);
  const playSoundRef = useRef<HTMLAudioElement | null>(null);
  const trackRef = useRef<AudioTrack | null>(null);
  const [volume, setVolumeState] = useState(initialVolume);
  const [muted, setMutedState] = useState(initialMuted);
  const [activated, setActivated] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const audio = new Audio();
    const dealSound = new Audio(SFX_SOURCES.deal);
    const playSound = new Audio(SFX_SOURCES.play);
    audio.loop = true;
    audio.preload = "auto";
    dealSound.preload = "auto";
    playSound.preload = "auto";
    audio.volume = volume;
    audio.muted = true;
    audioRef.current = audio;
    dealSoundRef.current = dealSound;
    playSoundRef.current = playSound;
    const markPlaying = () => {
      setPlaying(true);
      setBlocked(false);
      setErrorMessage(null);
    };
    const markPaused = () => setPlaying(false);
    const markError = () => {
      setPlaying(false);
      setBlocked(true);
      setErrorMessage(audio.error?.message || "音频播放失败");
    };
    audio.addEventListener("playing", markPlaying);
    audio.addEventListener("pause", markPaused);
    audio.addEventListener("error", markError);
    return () => {
      audio.removeEventListener("playing", markPlaying);
      audio.removeEventListener("pause", markPaused);
      audio.removeEventListener("error", markError);
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioRef.current = null;
      dealSoundRef.current = null;
      playSoundRef.current = null;
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(VOLUME_KEY, String(volume));
    if (audioRef.current) {
      audioRef.current.volume = volume;
      audioRef.current.muted = muted || !activated;
      if (dealSoundRef.current) {
        dealSoundRef.current.volume = muted ? 0 : volume * 0.68;
      }
      if (playSoundRef.current) {
        playSoundRef.current.volume = muted ? 0 : volume * 0.78;
      }
    }
  }, [activated, muted, volume]);

  useEffect(() => {
    window.localStorage.setItem(MUTED_KEY, String(muted));
  }, [muted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const track = TRACK_FOR_PHASE[phase];

    if (trackRef.current !== track) {
      trackRef.current = track;
      audio.pause();
      audio.src = TRACK_SOURCES[track];
      audio.load();
      audio.currentTime = 0;
    }

    audio.volume = volume;
    audio.muted = muted || !activated;
    if (!muted) {
      void audio.play().then(
        () => setBlocked(false),
        () => setBlocked(true),
      );
    } else {
      audio.pause();
    }
  }, [activated, muted, phase, volume]);

  const unlockAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = false;
    audio.volume = volume;
    void audio.play().then(
      () => {
        setActivated(true);
        setBlocked(false);
        setErrorMessage(null);
      },
      (error: unknown) => {
        setBlocked(true);
        setErrorMessage(error instanceof Error ? error.message : "浏览器阻止了音频播放");
      },
    );
  }, [volume]);

  useEffect(() => {
    if (activated || muted) return;
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { capture: true });
    window.addEventListener("keydown", unlock, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, [activated, muted, unlockAudio]);

  const setVolume = (nextVolume: number) => {
    setVolumeState(Math.max(0, Math.min(1, nextVolume)));
    if (nextVolume > 0 && muted) {
      setMutedState(false);
      unlockAudio();
    }
  };

  const toggleMuted = () => {
    const nextMuted = !muted;
    setMutedState(nextMuted);
    if (!nextMuted) {
      unlockAudio();
    }
  };

  const playEffect = useCallback(
    (element: HTMLAudioElement | null, gain: number) => {
      if (!element || muted) {
        if (import.meta.env.DEV) {
          console.debug("[audio] effect skipped", {
            hasElement: Boolean(element),
            muted,
          });
        }
        return;
      }
      element.currentTime = 0;
      element.volume = Math.min(1, volume * gain);
      void element.play().then(
        () => {
          if (import.meta.env.DEV) {
            console.debug("[audio] effect playing", {
              source: element.src,
              volume: element.volume,
            });
          }
        },
        (error: unknown) => {
          if (import.meta.env.DEV) {
            console.warn("[audio] effect blocked", error);
          }
        },
      );
    },
    [muted, volume],
  );

  const playDealSound = useCallback(() => {
    playEffect(dealSoundRef.current, 1.65);
  }, [playEffect]);

  const playCardSound = useCallback(() => {
    playEffect(playSoundRef.current, 1.55);
  }, [playEffect]);

  return {
    volume,
    setVolume,
    muted,
    toggleMuted,
    blocked,
    playing,
    errorMessage,
    unlockAudio,
    playDealSound,
    playCardSound,
  };
}
