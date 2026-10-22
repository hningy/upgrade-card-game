from __future__ import annotations

import argparse
import array
import math
import wave
from pathlib import Path


TRACKS = {
    "room-waiting.wav": "lobby.wav",
    "gameplay.wav": "gameplay.wav",
    "settlement.wav": "settlement.wav",
}


def read_mono_samples(source: wave.Wave_read) -> array.array[int]:
    if source.getsampwidth() != 2:
        raise ValueError("Only 16-bit PCM WAV input is supported")
    channels = source.getnchannels()
    raw = source.readframes(source.getnframes())
    samples = array.array("h")
    samples.frombytes(raw)
    if channels == 1:
        return samples
    if channels != 2:
        raise ValueError("Only mono or stereo input is supported")
    return array.array(
        "h",
        (
            round((samples[index] + samples[index + 1]) / 2)
            for index in range(0, len(samples), 2)
        ),
    )


def trim_and_resample(
    samples: array.array[int],
    source_rate: int,
    target_rate: int,
    trim_seconds: float,
) -> array.array[int]:
    usable_source_samples = max(
        1,
        len(samples) - round(trim_seconds * source_rate),
    )
    output_count = max(1, int(usable_source_samples * target_rate / source_rate))
    ratio = source_rate / target_rate
    output = array.array("h")

    for index in range(output_count):
        position = index * ratio
        left = min(int(position), usable_source_samples - 1)
        right = min(left + 1, usable_source_samples - 1)
        fraction = position - math.floor(position)
        value = round(samples[left] * (1 - fraction) + samples[right] * fraction)
        output.append(max(-32768, min(32767, value)))
    return output


def write_track(source_path: Path, output_path: Path, target_rate: int) -> None:
    with wave.open(str(source_path), "rb") as source:
        source_rate = source.getframerate()
        original_duration = source.getnframes() / source_rate
        samples = read_mono_samples(source)

    if original_duration <= 1:
        raise ValueError(f"{source_path.name} must be longer than one second")

    output_samples = trim_and_resample(
        samples,
        source_rate,
        target_rate,
        trim_seconds=1.0,
    )
    with wave.open(str(output_path), "wb") as target:
        target.setnchannels(1)
        target.setsampwidth(2)
        target.setframerate(target_rate)
        target.writeframes(output_samples.tobytes())

    final_duration = len(output_samples) / target_rate
    print(
        f"{source_path.name} -> {output_path.name}: "
        f"{original_duration:.2f}s -> {final_duration:.2f}s"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Trim the final second and create browser-friendly mono WAV files."
    )
    parser.add_argument("--source", default="assets/audio/source")
    parser.add_argument("--output", default="public/audio")
    parser.add_argument("--sample-rate", type=int, default=22050)
    args = parser.parse_args()

    source_dir = Path(args.source)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    for source_name, output_name in TRACKS.items():
        source_path = source_dir / source_name
        if not source_path.exists():
            raise FileNotFoundError(source_path)
        write_track(source_path, output_dir / output_name, args.sample_rate)


if __name__ == "__main__":
    main()
