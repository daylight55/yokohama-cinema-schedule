#!/usr/bin/env python3
"""Generate cached scene WAVs using Gemini 3.8 TTS (Python standard library only)."""
import argparse
import base64
from datetime import datetime, timezone
import hashlib
import io
import json
import math
import os
from pathlib import Path
import sys
import time
import random
import re
from email.utils import parsedate_to_datetime
import urllib.error
import urllib.request
import wave

ROOT = Path(__file__).resolve().parents[2]
ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions'
MODEL = 'gemini-3.8-flash-tts'
STYLE = (
    'Read only the supplied words, with no added sounds or music. '
    'Keep the voice clear, pleasant and natural, without a strained falsetto or a nasal squeak. '
    'A sweet, light, youthful feminine mascot voice, warm and playful but easy to listen to.'
)
LANGUAGES = {'ja': 'ja-JP', 'en': 'en-US'}
LANGUAGE_STYLES = {
    'ja': 'Speak Japanese only. A sweet anime-girl mascot speaking with the first-person boku. '
          'Light, clear, higher feminine register, sparkling excitement and cute gently bouncy endings.',
    'en': 'Speak only fluent American English, using natural English stress and connected speech. '
          'Keep a conversational rhythm and a gentle falling pitch at the end of full sentences. '
          'Be cheerfully welcoming, without chanting, exaggerated pitch jumps, or added translations.',
}
ENGLISH_NAME = (
    'Hama Movie is the product name. Pronounce it HAH-muh MOO-vee, smoothly as one name. '
    'Keep the introduction friendly and conversational, with no pause inside the name.'
)
JAPANESE_TEXT = re.compile(r'[\u3040-\u30ff\u3400-\u9fff\uff66-\uff9f]')
NAME_PRONUNCIATION = (
    '\n日本語の発音指示：「ハマムビ」は、このマスコットだけの固有名詞です。'
    '読みは「は・ま・む・び」の4モーラ。'
    '名前全体を一語として自然につなげ、「はま」と「むび」に分割したり、「びくん」を一語のように読んだりしないでください。'
    '「くん」は名前に続く敬称です。'
    '「ぼく」のあとだけ短く区切り、「ハマムビくん」は途中に間を置かずに自己紹介してください。'
    'かわいい声の雰囲気は保ち、名前の部分を歌ったり、大げさな抑揚にしたりしないでください。'
    '東京式アクセントの平板型を目安に、「は」は少し低く、「ま・む・び・く・ん」はほぼ同じ高さでなめらかに続けます。'
)
MAX_RETRIES = 2
MAX_RETRY_WAIT = 120


def request_body(text, voice, style, language):
    if language not in LANGUAGES:
        raise ValueError(f'Unsupported narration language: {language}')
    if language == 'en' and JAPANESE_TEXT.search(text + style):
        raise ValueError('English narration text/style contains Japanese characters; use separate requests.')
    return {
        'model': MODEL,
        'input': [{'type': 'user_input', 'content': [{
            'type': 'text', 'text': text,
            'annotations': [{'type': 'speech_metadata', 'style': style}],
        }]}],
        'response_format': {'type': 'audio', 'mime_type': 'audio/wav'},
        'generation_config': {'speech_config': [{'voice': voice, 'language': LANGUAGES[language]}]},
    }


def scene_request(scene, language, voice, style):
    if language not in LANGUAGES:
        raise ValueError(f'Unsupported narration language: {language}')
    text = scene['caption'].replace('\n', ' ')
    style = LANGUAGE_STYLES[language] + ' ' + style
    if language == 'ja' and 'はまむび' in text:
        text = text.replace('はまむび', 'ハマムビ')
        style += NAME_PRONUNCIATION
    elif language == 'en' and 'Hama Movie' in text:
        style += ' ' + ENGLISH_NAME
    return request_body(text, voice, style, language)


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


def generate(body, key, *, usage=None):
    request = urllib.request.Request(ENDPOINT, data=json.dumps(body).encode(), headers={
        'Content-Type': 'application/json', 'x-goog-api-key': key,
    })
    for attempt in range(MAX_RETRIES + 1):
        try:
            with urllib.request.urlopen(request, timeout=120) as response:
                payload = json.load(response)
                audio = extract_audio(payload)
                if usage is not None and isinstance(payload.get('usage'), dict):
                    usage.update(payload['usage'])
                return audio
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
    parser.add_argument('--scene', type=int, action='append',
                        help='Generate only this zero-based scene index; repeat to select several')
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
    languages = list(copies) if args.lang == 'all' else [args.lang]
    if args.scene and any(i < 0 or i >= len(copies[lang]['scenes']) for lang in languages for i in args.scene):
        parser.error('--scene index is outside the selected language timeline')
    for lang in languages:
        for index, scene in enumerate(copies[lang]['scenes']):
            if args.scene is not None and index not in args.scene:
                continue
            body = scene_request(scene, lang, args.voice, args.style)
            fingerprint = hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()
            target = args.output_dir / f'{lang}-{index:02d}.wav'
            metadata = target.with_suffix('.json')
            if args.dry_run:
                print(f'{target.name} [{LANGUAGES[lang]}, {args.voice}]: {body["input"][0]["content"][0]["text"]}')
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
            usage = {}
            data = generate(body, key, usage=usage)
            requested = True
            args.output_dir.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix('.wav.tmp')
            temporary.write_bytes(data)
            temporary.replace(target)
            metadata.write_text(fingerprint)
            target.with_suffix('.request.json').write_text(json.dumps(body, ensure_ascii=False, indent=2) + '\n')
            target.with_suffix('.usage.json').write_text(json.dumps({
                'model': MODEL, 'language': LANGUAGES[lang],
                'generatedAt': datetime.now(timezone.utc).isoformat(),
                'audioSeconds': wav_duration(data), 'usage': usage,
            }, indent=2) + '\n')
            print(f'Saved {target.name}: {wav_duration(data):.2f}s')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, wave.Error, OSError) as error:
        print(f'Error: {error}', file=sys.stderr)
        sys.exit(1)
