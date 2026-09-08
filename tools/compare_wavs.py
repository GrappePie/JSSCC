"""Compare two PCM16 WAVs without silently normalizing, resampling or mixing channels.
python tools/compare_wavs.py original.wav web.wav --output comparison.json
Optional --align-onset aligns the first above-threshold sample, NOT a proof of fidelity.
"""
import argparse
import hashlib
import json
import pathlib
import tempfile
import wave
import numpy as np


def read_wav(path):
    path = pathlib.Path(path)
    with wave.open(str(path), 'rb') as f:
        if f.getsampwidth() != 2 or f.getcomptype() != 'NONE':
            raise ValueError('Only uncompressed PCM16 WAV is supported; convert explicitly first')
        rate, channels, frames = f.getframerate(), f.getnchannels(), f.getnframes()
        if not frames or frames > rate * 1800:
            raise ValueError('WAV must contain between one sample and 30 minutes')
        raw = f.readframes(frames)
        pcm = np.frombuffer(raw, dtype='<i2').reshape(-1, channels)
    return {'rate': rate, 'channels': channels, 'frames': frames, 'pcm': pcm,
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}


def compare(original, web, align_onset=False, threshold=0.001):
    a, b = read_wav(original), read_wav(web)
    if a['rate'] != b['rate'] or a['channels'] != b['channels']:
        raise ValueError('Sample rate and channel count must match. No automatic resampling/downmixing is performed')
    identical = a['pcm'].shape == b['pcm'].shape and np.array_equal(a['pcm'], b['pcm'])
    x, y = a['pcm'].astype(np.float64) / 32768, b['pcm'].astype(np.float64) / 32768
    def onset(z):
        indices = np.flatnonzero(np.max(np.abs(z), axis=1) >= threshold)
        return int(indices[0]) if len(indices) else 0
    offset_x = onset(x) if align_onset else 0
    offset_y = onset(y) if align_onset else 0
    x, y = x[offset_x:], y[offset_y:]
    overlap = min(len(x), len(y))
    if not overlap:
        raise ValueError('No overlapping audio samples')
    x, y = x[:overlap], y[:overlap]
    error = x - y
    rms = lambda z: np.sqrt(np.mean(z * z, axis=0)).tolist()
    # Bounded window so long recordings do not require large FFT allocations.
    size = min(overlap, 131072)
    window = np.hanning(size)[:, None]
    ax, by = np.abs(np.fft.rfft(x[:size] * window, axis=0)), np.abs(np.fft.rfft(y[:size] * window, axis=0))
    spectral_rmse = np.sqrt(np.mean((ax - by) ** 2, axis=0)).tolist()
    return {'sampleRate': a['rate'], 'channels': a['channels'],
            'originalSha256': a['sha256'], 'webSha256': b['sha256'],
            'wholePcmIdentical': bool(identical),
            'durationSeconds': {'original': a['frames']/a['rate'], 'web': b['frames']/b['rate']},
            'alignment': {'method': 'first_threshold_crossing' if align_onset else 'none',
                          'threshold': threshold if align_onset else None,
                          'originalOffsetSamples': offset_x, 'webOffsetSamples': offset_y},
            'overlapSamples': overlap,
            'uncomparedTailSamples': {'original': a['frames']-offset_x-overlap, 'web': b['frames']-offset_y-overlap},
            'rmsPerChannel': {'original': rms(x), 'web': rms(y), 'error': rms(error)},
            'maxAbsoluteErrorPerChannel': np.max(np.abs(error), axis=0).tolist(),
            'spectralMagnitudeRmsePerChannel': spectral_rmse, 'spectralWindowSamples': size,
            'normalizationApplied': False,
            'interpretation': 'Metrics describe this pair and overlap only; no perceptual score or general emulator-equivalence claim'}


def self_test():
    with tempfile.TemporaryDirectory() as directory:
        p = pathlib.Path(directory)
        samples = np.sin(np.arange(4410)*2*np.pi*440/44100)*12000
        pcm = np.repeat(samples.astype('<i2')[:, None], 2, axis=1)
        def save(name, data):
            with wave.open(str(p/name), 'wb') as f:
                f.setnchannels(2); f.setsampwidth(2); f.setframerate(44100); f.writeframes(data.astype('<i2').tobytes())
        save('a.wav', pcm); save('b.wav', pcm); save('c.wav', pcm//2)
        same = compare(p/'a.wav', p/'b.wav')
        different = compare(p/'a.wav', p/'c.wav')
        assert same['wholePcmIdentical'] and same['rmsPerChannel']['error'] == [0.0, 0.0]
        assert not different['wholePcmIdentical'] and min(different['rmsPerChannel']['error']) > 0
        assert max(different['rmsPerChannel']['web']) < min(different['rmsPerChannel']['original'])
    return {'selfTestsPassed': 3, 'fixtures': 'synthetic sine only', 'originalGxsccCompared': False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original', nargs='?'); parser.add_argument('web', nargs='?')
    parser.add_argument('--output'); parser.add_argument('--align-onset', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    try:
        if args.self_test: result = self_test()
        elif args.original and args.web: result = compare(args.original, args.web, args.align_onset)
        else: parser.error('Provide original.wav and web.wav, or --self-test')
    except (ValueError, OSError, wave.Error) as error:
        parser.exit(1, str(error)+'\n')
    text = json.dumps(result, indent=2, allow_nan=False)+'\n'
    if args.output: pathlib.Path(args.output).write_text(text, encoding='utf-8')
    print(text, end='')

if __name__ == '__main__': main()
