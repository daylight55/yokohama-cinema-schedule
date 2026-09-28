import base64
import io
import json
import unittest
import urllib.error
import wave
from unittest.mock import MagicMock, patch

from narration import extract_audio, generate, request_body, retry_delay, wav_duration, scene_request, STYLE, NAME_PRONUNCIATION


class NarrationTests(unittest.TestCase):
    def test_english_has_explicit_api_language_and_no_japanese_persona(self):
        body = scene_request({'caption': 'Hi! I’m your Hama Movie buddy.'}, 'en', 'Leda', STYLE)
        self.assertEqual(body['generation_config']['speech_config'], [{'voice': 'Leda', 'language': 'en-US'}])
        style = body['input'][0]['content'][0]['annotations'][0]['style']
        self.assertIn('American English', style)
        self.assertIn('HAH-muh MOO-vee', style)
        self.assertNotIn('boku', style)
        self.assertNotIn(NAME_PRONUNCIATION, style)

    def test_japanese_keeps_its_own_language_and_proper_name_guidance(self):
        body = scene_request({'caption': 'ぼく、はまむびくん！'}, 'ja', 'Leda', STYLE)
        self.assertEqual(body['generation_config']['speech_config'][0]['language'], 'ja-JP')
        part = body['input'][0]['content'][0]
        self.assertEqual(part['text'], 'ぼく、ハマムビくん！')
        self.assertIn(NAME_PRONUNCIATION, part['annotations'][0]['style'])
        self.assertNotIn('American English', part['annotations'][0]['style'])

    def test_english_rejects_mixed_language_text_or_style(self):
        for text, style in [('Hello、こんにちは', 'friendly'), ('Hello', 'かわいい声')]:
            with self.assertRaisesRegex(ValueError, 'contains Japanese'):
                request_body(text, 'Leda', style, 'en')
        with self.assertRaisesRegex(ValueError, 'Unsupported narration language'):
            request_body('Hello', 'Leda', 'friendly', 'fr')

    def test_wav_response_is_saved_without_second_header(self):
        output = io.BytesIO()
        with wave.open(output, 'wb') as audio:
            audio.setparams((1, 2, 24000, 0, 'NONE', 'not compressed'))
            audio.writeframes(b'\0\0' * 24000)
        data = output.getvalue()
        response = {'steps': [{'type': 'model_output', 'content': [
            {'type': 'audio', 'data': base64.b64encode(data).decode()}]}]}
        self.assertEqual(extract_audio(response), data)
        self.assertEqual(wav_duration(data), 1)

    def test_missing_audio_fails(self):
        with self.assertRaises(ValueError):
            extract_audio({'steps': []})

    def test_style_is_not_spoken_text(self):
        part = request_body('こんにちは', 'Kore', 'friendly', 'ja')['input'][0]['content'][0]
        self.assertEqual(part['text'], 'こんにちは')
        self.assertEqual(part['annotations'][0]['style'], 'friendly')

    @patch('urllib.request.urlopen')
    def test_http_error_is_not_retried_or_leaked(self, urlopen):
        urlopen.side_effect = urllib.error.HTTPError('url', 403, 'secret', {}, None)
        with self.assertRaisesRegex(RuntimeError, 'HTTP 403') as error:
            generate(request_body('hello', 'Kore', 'friendly', 'en'), 'private-key')
        self.assertNotIn('secret', str(error.exception))
        self.assertNotIn('private-key', str(error.exception))
        self.assertEqual(urlopen.call_count, 1)

    def error(self, header=None, delay=None):
        body = {'error': {'details': [{'@type': 'type.googleapis.com/google.rpc.RetryInfo',
                                      'retryDelay': delay}]}}
        return urllib.error.HTTPError('url', 429, 'private-error',
                                      {'Retry-After': header} if header else {},
                                      io.BytesIO(json.dumps(body).encode()))

    def test_uses_longer_server_wait_hint(self):
        self.assertEqual(retry_delay(self.error('12', '20.5s')), 20.5)

    @patch('narration.time.time', return_value=0)
    def test_retry_after_http_date(self, _):
        self.assertEqual(retry_delay(self.error('Thu, 01 Jan 1970 00:00:30 GMT')), 30)

    def test_malformed_hint_is_ignored(self):
        self.assertIsNone(retry_delay(self.error('NaN', 'nonsense')))

    @patch('narration.time.sleep')
    @patch('urllib.request.urlopen')
    def test_fractional_wait_is_rounded_up_and_retried(self, urlopen, sleep):
        payload = {'steps': [{'type': 'model_output', 'content': [
            {'type': 'audio', 'data': 'AA=='}]}]}
        # Mock just the decoded audio so this test isolates transport retry behavior.
        success = MagicMock()
        success.__enter__.return_value = io.StringIO(json.dumps(payload))
        urlopen.side_effect = [self.error(delay='8.3s'), success]
        with patch('narration.extract_audio', return_value=b'wav'):
            self.assertEqual(generate(request_body('hello', 'Leda', 'cute', 'en'), 'private-key'), b'wav')
        sleep.assert_called_once_with(9)
        self.assertEqual(urlopen.call_count, 2)

    @patch('narration.time.sleep')
    @patch('urllib.request.urlopen')
    def test_repeated_429_stops_after_two_retries(self, urlopen, sleep):
        urlopen.side_effect = [self.error(delay='1s') for _ in range(3)]
        with self.assertRaisesRegex(RuntimeError, 'HTTP 429') as error:
            generate(request_body('hello', 'Leda', 'cute', 'en'), 'private-key')
        self.assertEqual(urlopen.call_count, 3)
        self.assertEqual(sleep.call_count, 2)
        self.assertNotIn('private', str(error.exception))

    @patch('narration.time.sleep')
    @patch('urllib.request.urlopen')
    def test_long_wait_stops_without_retrying_early(self, urlopen, sleep):
        urlopen.side_effect = self.error(delay='300s')
        with self.assertRaisesRegex(RuntimeError, '300.0s wait'):
            generate(request_body('hello', 'Leda', 'cute', 'en'), 'private-key')
        sleep.assert_not_called()
        self.assertEqual(urlopen.call_count, 1)

    @patch('narration.random.uniform', return_value=0.4)
    @patch('narration.time.sleep')
    @patch('urllib.request.urlopen')
    def test_missing_hint_uses_bounded_backoff(self, urlopen, sleep, _):
        urlopen.side_effect = [self.error() for _ in range(3)]
        with self.assertRaisesRegex(RuntimeError, 'HTTP 429'):
            generate(request_body('hello', 'Leda', 'cute', 'en'), 'private-key')
        self.assertEqual([call.args[0] for call in sleep.call_args_list], [11, 21])
        self.assertEqual(urlopen.call_count, 3)


if __name__ == '__main__':
    unittest.main()
