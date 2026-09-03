#!/usr/bin/env python3
"""Serve the Site2WebMCP demo shop on http://localhost:8765"""

from __future__ import annotations

import http.server
import os
import socketserver
from pathlib import Path

PORT = 8765
DEMO = Path(__file__).resolve().parent.parent / "demo"


def main() -> None:
    os.chdir(DEMO)
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"Site2WebMCP demo: http://localhost:{PORT}")
        print("Enable chrome://flags/#enable-webmcp-testing then open the URL.")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
