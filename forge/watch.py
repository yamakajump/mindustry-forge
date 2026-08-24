"""A window onto a run in progress.

A search that prints a line a minute is a search nobody watches, and a search nobody
watches is one whose quiet drift into optimising the wrong thing gets noticed hours late.
It happened: a population once settled at a mean score of which 89% was material sitting
in belts going nowhere, and the printed line said only that the score was rising.

So this serves the state of the run, and the page draws it: the design currently winning,
the shape of the population behind it, and, beside the score, the material stuck inside the
design. That last number is there because it is the one that says the score has stopped
meaning what it says.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

VIEWER = Path(__file__).resolve().parent.parent / "viewer"


class Run:
    """Everything a viewer needs to know, kept behind a lock.

    The search runs on one thread and the server answers on another, so every field here
    is written by one and read by the other.
    """

    def __init__(self, title: str = "forge") -> None:
        self.title = title
        self._lock = threading.Lock()
        self._state: dict[str, Any] = {
            "title": title, "spec": {}, "objective": "", "history": [],
            "best": None, "running": True, "generation": 0, "seconds": 0.0,
        }

    def describe(self, spec, objective: str, genome: str, population: int) -> None:
        with self._lock:
            self._state["spec"] = {
                "name": spec.name, "target": spec.target,
                "width": spec.width, "height": spec.height,
                "palette": list(spec.palette), "ticks": spec.ticks,
                "notes": spec.notes,
                "inputs": [{"item": p.item, "side": p.side.value} for p in spec.inputs],
                "outputs": [{"item": p.item, "side": p.side.value} for p in spec.outputs],
            }
            self._state["objective"] = objective
            self._state["genome"] = genome
            self._state["population"] = population

    def record(self, report: dict, best, seconds: float) -> None:
        with self._lock:
            self._state["history"].append(report)
            self._state["generation"] = report["generation"]
            self._state["seconds"] = round(seconds, 1)
            if best is not None:
                grid = best.to_layout() if hasattr(best, "to_layout") else best
                self._state["best"] = {
                    "delivered": best.delivered,
                    "blocks": best.used(),
                    "stuck": best.stuck,
                    "text": grid.render(),
                    "cells": [[x, y, block, rotation]
                              for x, y, block, rotation in grid.cells()],
                }

    def finish(self) -> None:
        with self._lock:
            self._state["running"] = False

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._state))


def serve(run: Run, port: int = 8900) -> str:
    """Start the viewer in the background and return its address."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802
            if self.path.startswith("/state"):
                body = json.dumps(run.snapshot()).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return

            name = "index.html" if self.path in ("/", "") else self.path.lstrip("/")
            target = (VIEWER / name).resolve()
            if not target.is_file() or VIEWER.resolve() not in target.parents:
                self.send_error(404)
                return

            body = target.read_bytes()
            kind = {".html": "text/html", ".css": "text/css",
                    ".js": "text/javascript"}.get(target.suffix, "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", kind)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args: object) -> None:
            # Silent: request logs would drown the run's own output.
            pass

    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{port}/"
