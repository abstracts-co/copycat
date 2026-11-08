#!/usr/bin/env python3
"""Estimate a song's tempo, first beat and a good segment to dance to.

    python3 tools/tempo.py song.mp3 [more.mp3 ...]

Needs ffmpeg and numpy. Prints JSON you can paste into a music.json track. Check by ear: halve or
double bpm when the dance feels twice too fast or slow.
"""
import json, subprocess, sys
import numpy as np

SR, HOP = 22050, 441


def analyse(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    n = 1024
    frames = (len(x) - n) // HOP
    idx = np.arange(n)[None, :] + HOP * np.arange(frames)[:, None]
    spec = np.log1p(10 * np.abs(np.fft.rfft(x[idx] * np.hanning(n), axis=1)))
    flux = np.concatenate([[0], np.maximum(0, np.diff(spec, axis=0)).sum(1)])
    env = np.maximum(flux - np.convolve(flux, np.ones(25) / 25, 'same'), 0)
    fps = SR / HOP
    head = env[: int(fps * 90)]
    ac = np.correlate(head, head, 'full')[len(head) - 1:]
    best = max(((ac[int(round(fps * 60 / b))] + 0.5 * ac[int(round(2 * fps * 60 / b))] + 0.25 * ac[int(round(4 * fps * 60 / b))], b) for b in np.arange(80, 170, 0.1)))
    bpm = best[1]
    bpm = bpm / 2 if bpm > 145 else bpm * 2 if bpm < 85 else bpm
    period = fps * 60 / bpm
    phase = max(((env[np.arange(p, len(env) - 1, period).astype(int)].sum(), p) for p in np.arange(0, period, 0.25)))[1]
    first = phase / fps
    rms = np.sqrt(np.convolve(x ** 2, np.ones(SR) / SR, 'valid')[::SR])
    duration = len(x) / SR
    win = 40
    starts = range(15, max(16, int(duration - win - 5)))
    start = max(starts, key=lambda s: rms[s:s + win].mean()) if len(rms) > 60 else 0
    beat = 60 / bpm
    start = first + np.ceil((start - first) / (beat * 4)) * beat * 4
    return {'bpm': round(float(bpm), 2), 'firstBeat': round(float(first), 3), 'duration': round(duration, 2), 'segment': [round(float(start), 3), round(float(start + beat * 64 if bpm > 120 else start + beat * 48), 3)]}


if __name__ == '__main__':
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    print(json.dumps({p: analyse(p) for p in sys.argv[1:]}, indent=1))
