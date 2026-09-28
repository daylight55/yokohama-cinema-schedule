#!/usr/bin/env python3
"""Generate cached scene WAVs using Gemini 3.8 TTS (Python standard library only)."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import sys
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
MODEL = 'gemini-3.8-flash-tts'
STYLE = 'Warm, friendly, lively guide. Speak clearly and briskly, without background music.'


def request_body(text, voice, style):
    return {
        'model': MODEL,
        'input': [{'type': 'user_input', 'content': [{
            'type': 'text', 'text': text,
            'annotations': [{'type': 'speech_metadata', 'style': style}],
        }]}],
        'response_format': {'type': 'audio', 'mime_type': 'audio/wav'},
        'generation_config': {'speech_config': [{'voice': voice}]},
    }


def wav_duration(data):
    with wave.open(io.BytesIO(data), 'rb') as audio:
        if audio.getnframes() == 0:
            raise ValueError('Empty WAV response')
        return audio.getnframes() / audio.getframerate()


def extract_audio(response):
    clips = [part['data'] for step in response.get('steps', [])
             if step.get('type') == 'model_output'
             for part in step.get('content', []) if part.get('type') == 'audio' and part.get('data')]
    if len(clips) != 1:
        raise ValueError('Expected one complete audio output; no WAV saved')
    data = base64.b64decode(clips[0], validate=True)
    wav_duration(data)  # 3.8 returns a WAV header already; never wrap it as raw PCM.
    return data


def generate(body, key):
    request = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), headers={
        'Content-Type': 'application/json', 'x-goog-api-key': key,
    })
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            return extract_audio(json.load(response))
    except urllib.error.HTTPError as error:
        # Do not log response bodies, request headers or credentials.
        raise RuntimeError(f'Gemini HTTP {error.code}; check API access, billing and quota. No automatic retry.') from None
    except urllib.error.URLError:
        raise RuntimeError('Gemini connection failed. No automatic retry.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lang', choices=['ja', 'en', 'all'], default='ja')
    parser.add_argument('--voice', default='Kore')
    parser.add_argument('--style', default=STYLE)
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.wrangler/site-guide-narration')
    parser.add_argument('--dry-run', action='store_true', help='Show text and request count without calling API')
    args = parser.parse_args()
    copies = json.loads((ROOT / 'shared/site-guide.json').read_text())
    for lang in (copies if args.lang == 'all' else [args.lang]):
        for index, scene in enumerate(copies[lang]['scenes']):
            body = request_body(scene['caption'].replace('\n', ' '), args.voice, args.style)
            fingerprint = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
            target = args.output_dir / f'{lang}-{index:02d}.wav'
            metadata = target.with_suffix('.json')
            if args.dry_run:
                print(f'{target.name}: {body["input"][0]["content"][0]["text"]}')
                continue
            if target.exists() and metadata.exists() and metadata.read_text() == fingerprint:
                duration = wav_duration(target.read_bytes())
                print(f'Cached {target.name}: {duration:.2f}s')
                continue
            key = os.environ.get('GEMINI_API_KEY', '').strip()
            if not key:
                raise RuntimeError('Set GEMINI_API_KEY in your local environment (do not commit it).')
            data = generate(body, key)
            args.output_dir.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix('.wav.tmp')
            temporary.write_bytes(data)
            temporary.replace(target)
            metadata.write_text(fingerprint)
            print(f'Saved {target.name}: {wav_duration(data):.2f}s')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, wave.Error, OSError) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
