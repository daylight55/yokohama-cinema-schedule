#!/usr/bin/env python3
"""Generate cached scene WAVs using Gemini 3.8 TTS (Python standard library only)."""
import argparse
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys
import time
import random
from email.utils import parsedate_to_datetime
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
MODEL = 'gemini-3.8-flash-tts'
STYLE = (
    'Speak fluently in the language of the supplied text. '
    'Read only the supplied words, with no added sounds or music. '
    'Keep the voice clear, pleasant and natural, without a strained falsetto or a nasal squeak. '
    'A sweet, adorable anime-girl mascot voice speaking with the first-person boku. '
    'Light, clear, higher feminine register, sparkling excitement and cute gently bouncy endings. '
    'Affectionate and innocent, enthusiastic but easy to listen to.'
)
MAX_RETRIES = 2
MAX_RETRY_WAIT = 120


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


def retry_delay(error):
    """Read only structured wait hints; never expose API error text or credentials."""
    delays = []
    header = (error.headers or {}).get('Retry-After', '')
    if header:
        try:
            delays.append(float(header))
        except ValueError:
            try:
                delays.append(parsedate_to_datetime(header).timestamp() - time.time())
            except (ValueError, TypeError, OverflowError):
                pass
    try:
        payload = json.loads(error.read(65536))
        if isinstance(payload, dict) and isinstance(payload.get('error'), dict):
            details = payload['error'].get('details', [])
            for detail in details if isinstance(details, list) else []:
                if not isinstance(detail, dict):
                    continue
                if detail.get('@type') == 'type.googleapis.com/google.rpc.RetryInfo':
                    value = detail.get('retryDelay', '')
                    if isinstance(value, str) and value.endswith('s'):
                        try:
                            delays.append(float(value[:-1]))
                        except ValueError:
                            pass
    except (ValueError, OSError):
        pass
    delays = [value for value in delays if math.isfinite(value) and value >= 0]
    # Honor both signals if the service supplies conflicting hints.
    return max(delays) if delays else None


def generate(body, key):
    request = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), headers={
        'Content-Type': 'application/json', 'x-goog-api-key': key,
    })
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                return extract_audio(json.load(response))
        except urllib.error.HTTPError as error:
            if error.code == 429 and attempt < MAX_RETRIES:
                delay = retry_delay(error)
                error.close()
                if delay is None:
                    delay = 10 * (2 ** attempt) + random.uniform(0, 1)
                if delay > MAX_RETRY_WAIT:
                    raise RuntimeError(
                        f'Gemini HTTP 429 requests a {delay:.1f}s wait; '
                        'stopped without retrying early. Resume later with the same command.'
                    ) from None
                # Round UP so a fractional RetryInfo delay is never shortened.
                delay = math.ceil(delay)
                print(f'Gemini HTTP 429: waiting {delay}s before retry '
                      f'{attempt + 1}/{MAX_RETRIES}.', flush=True)
                time.sleep(delay)
                continue
            error.close()
            raise RuntimeError(f'Gemini HTTP {error.code}; stopped. Check API access, billing and quota.') from None
        except urllib.error.URLError:
            raise RuntimeError('Gemini connection failed; stopped without retrying.') from None


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--lang', choices=['ja', 'en', 'all'], default='ja')
    parser.add_argument('--voice', default='Leda')
    parser.add_argument('--request-interval', type=float, default=7,
                        help='Seconds between API requests (default: 7)')
    parser.add_argument('--style', default=STYLE)
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.wrangler/site-guide-narration')
    parser.add_argument('--dry-run', action='store_true', help='Show text and request count without calling API')
    args = parser.parse_args()
    if not 0 <= args.request_interval <= 60:
        parser.error('--request-interval must be between 0 and 60 seconds')
    requested = False
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
            if requested:
                time.sleep(args.request_interval)
            data = generate(body, key)
            requested = True
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
