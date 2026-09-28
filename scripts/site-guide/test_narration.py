import base64
import io
import unittest
import urllib.error
import wave
from unittest.mock import patch

from narration import extract_audio, generate, request_body, wav_duration


class NarrationTests(unittest.TestCase):
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
        part = request_body('こんにちは', 'Kore', 'friendly')['input'][0]['content'][0]
        self.assertEqual(part['text'], 'こんにちは')
        self.assertEqual(part['annotations'][0]['style'], 'friendly')

    @patch('urllib.request.urlopen')
    def test_http_error_is_not_retried_or_leaked(self, urlopen):
        urlopen.side_effect = urllib.error.HTTPError('url', 429, 'secret', {}, None)
        with self.assertRaisesRegex(RuntimeError, 'HTTP 429') as error:
            generate(request_body('hello', 'Kore', 'friendly'), 'private-key')
        self.assertNotIn('secret', str(error.exception))
        self.assertNotIn('private-key', str(error.exception))
        self.assertEqual(urlopen.call_count, 1)


if __name__ == '__main__':
    unittest.main()
