"""The analyser behind an HTTP endpoint, and a page to try it from.

Deliberately the standard library and nothing else. The marketplace will be Laravel, and
this is the service it calls: keeping the analysis in one place means the site and the
command line cannot drift into disagreeing about what a schematic does, which is the whole
failure mode this repository is built to avoid.

    python tools/serve.py

`POST /analyse` takes `{"schematic": "...", "supply": {"coal": 4}}` and answers with the
report as JSON. Everything the page shows comes from that one call, so anything the page
can display, the site can display too.
"""

from __future__ import annotations

import base64
import json
import threading
import webbrowser
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from analyser import report

PAGE = Path(__file__).parent.parent / "site" / "public" / "index.html"

#: A schematic is a few kilobytes. Anything much larger is not one, and reading it would be
#: handing a stranger a way to fill this machine's memory.
MAX_BODY = 4 * 1024 * 1024


def analyse_payload(payload: dict) -> dict:
    """One call, whether it came from the page, the site, or a script."""
    text = str(payload.get("schematic", "")).strip()
    if not text:
        raise ValueError("aucune schematique fournie")

    # A file dropped on the page arrives as raw bytes in base64, which is the same thing
    # the clipboard carries, so both paths meet here rather than in two parsers.
    text = "".join(text.split())

    supply = {}
    for item, rate in (payload.get("supply") or {}).items():
        try:
            value = float(rate)
        except (TypeError, ValueError):
            continue
        if value > 0:
            supply[str(item)] = value

    made = report.analyse(text, supply=supply or None)
    answer = asdict(made)
    answer["per_minute"] = made.per_minute()
    answer["lines"] = made.lines()
    return answer


class Handler(BaseHTTPRequestHandler):
    """Small on purpose: one page and one endpoint."""

    def log_message(self, *_args) -> None:  # noqa: D102
        pass

    def _send(self, code: int, body: bytes, kind: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, code: int, payload: dict) -> None:
        self._send(code, json.dumps(payload).encode("utf-8"),
                   "application/json; charset=utf-8")

    def do_GET(self) -> None:  # noqa: N802
        path, _, _ = self.path.partition("?")
        if path in ("/", "/index.html"):
            if not PAGE.exists():
                self._send(500, b"page introuvable", "text/plain; charset=utf-8")
                return
            self._send(200, PAGE.read_bytes(), "text/html; charset=utf-8")
            return
        self._send(404, b"nope", "text/plain; charset=utf-8")

    def do_POST(self) -> None:  # noqa: N802
        path, _, _ = self.path.partition("?")
        if path != "/analyse":
            self._json(404, {"error": "endpoint inconnu"})
            return

        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            self._json(413, {"error": "c'est trop gros pour etre une schematique"})
            return

        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "corps de requete illisible"})
            return

        try:
            self._json(200, analyse_payload(payload))
        except ValueError as error:
            # The reader's own words, because they say which field of the format broke and
            # a player who pasted the wrong thing deserves to be told which wrong thing.
            self._json(400, {"error": str(error)})
        except Exception as error:  # noqa: BLE001
            self._json(500, {"error": f"{type(error).__name__}: {error}"})


def serve(port: int = 8770, open_browser: bool = True) -> None:
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    url = f"http://127.0.0.1:{port}/"
    print(f"analyseur sur {url}")
    if open_browser:
        threading.Timer(0.4, webbrowser.open, args=(url,)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


def encode_file(path: Path) -> str:
    """A `.msch` on disk as the string everything else here speaks."""
    return base64.b64encode(Path(path).read_bytes()).decode("ascii")
