"""Local macOS OCR. No image upload and no generative vision model."""
import io
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def extract_text(image):
    helper = ROOT / '.data' / 'luke-ocr'
    if not helper.exists():
        raise RuntimeError('Local OCR helper is missing. Run npm run setup:ocr.')
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    result = subprocess.run([str(helper)], input=buffer.getvalue(), capture_output=True, timeout=45, check=True)
    return json.loads(result.stdout)['text'].strip()
