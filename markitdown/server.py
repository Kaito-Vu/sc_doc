"""Internal-only: POST raw file bytes to /convert -> Markdown (text/plain)."""
import os, subprocess, tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from markitdown import MarkItDown

MAX = 50 * 1024 * 1024
md = MarkItDown()
OCR_LANG = os.environ.get('OCR_LANG', 'vie+eng')
OCR_TIMEOUT = int(os.environ.get('OCR_TIMEOUT', 900))


class H(BaseHTTPRequestHandler):
    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        self._send(200 if self.path == "/health" else 404, b"ok")

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        if self.path != "/convert" or not 0 < n <= MAX:
            return self._send(400, b"bad request")
        data = self.rfile.read(n)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(data)
        ocr = f.name + ".ocr.pdf"
        try:
            text = md.convert(f.name).text_content
            if not text.strip():  # scanned PDF: OCR it, then convert again
                subprocess.run(
                    ["ocrmypdf", "--skip-text", "-l", OCR_LANG, "--output-type", "pdf",
                     "--optimize", "0", f.name, ocr],
                    check=True, capture_output=True, timeout=OCR_TIMEOUT)
                text = md.convert(ocr).text_content
            self._send(200, text.encode("utf-8"))
        except subprocess.CalledProcessError as e:
            self._send(422, e.stderr[-500:])
        except Exception as e:
            self._send(422, str(e).encode("utf-8", "replace"))
        finally:
            for x in (f.name, ocr):
                if os.path.exists(x):
                    os.unlink(x)


ThreadingHTTPServer(("0.0.0.0", 8000), H).serve_forever()
