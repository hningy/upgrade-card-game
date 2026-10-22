from __future__ import annotations

import math
import random
import struct
import wave
from pathlib import Path


SAMPLE_RATE = 22050
RNG = random.Random(20261022)


def clamp(value: float) -> float:
    return max(-1.0, min(1.0, value))


def write_wav(path: Path, samples: list[float]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = b"".join(struct.pack("<h", round(clamp(value) * 32767)) for value in samples)
    with wave.open(str(path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(SAMPLE_RATE)
        target.writeframes(pcm)


def deal_sound() -> list[float]:
    duration = 0.085
    count = int(SAMPLE_RATE * duration)
    samples: list[float] = []
    previous_noise = 0.0

    for index in range(count):
        time = index / SAMPLE_RATE
        noise = RNG.uniform(-1.0, 1.0)
        previous_noise = previous_noise * 0.35 + noise * 0.65
        envelope = math.exp(-time * 52)
        click = math.sin(2 * math.pi * 1350 * time) * math.exp(-time * 95)
        snap = math.sin(2 * math.pi * 720 * time) * math.exp(-time * 38)
        fade = min(1.0, index / 18, (count - index - 1) / 36)
        samples.append((previous_noise * 0.42 + click * 0.34 + snap * 0.2) * envelope * fade)

    peak = max(abs(value) for value in samples) or 1.0
    return [value / peak * 0.58 for value in samples]


def play_sound() -> list[float]:
    duration = 0.15
    count = int(SAMPLE_RATE * duration)
    samples: list[float] = []
    previous_noise = 0.0

    for index in range(count):
        time = index / SAMPLE_RATE
        noise = RNG.uniform(-1.0, 1.0)
        previous_noise = previous_noise * 0.2 + noise * 0.8
        primary = math.exp(-time * 31)
        secondary_time = max(0.0, time - 0.032)
        secondary = math.exp(-secondary_time * 56) if time >= 0.032 else 0.0
        low = math.sin(2 * math.pi * 430 * time) * primary
        high = math.sin(2 * math.pi * 980 * time) * primary
        paper = previous_noise * (primary * 0.34 + secondary * 0.18)
        fade = min(1.0, index / 12, (count - index - 1) / 48)
        samples.append((low * 0.28 + high * 0.2 + paper) * fade)

    peak = max(abs(value) for value in samples) or 1.0
    return [value / peak * 0.72 for value in samples]


def main() -> None:
    output = Path("public/audio")
    write_wav(output / "deal.wav", deal_sound())
    write_wav(output / "play-card.wav", play_sound())
    print(f"Generated {output / 'deal.wav'}")
    print(f"Generated {output / 'play-card.wav'}")


if __name__ == "__main__":
    main()
