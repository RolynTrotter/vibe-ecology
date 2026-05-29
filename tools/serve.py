#!/usr/bin/env python3
"""Tiny static server for local + LAN testing (e.g. opening on your phone).

Usage:
    python3 tools/serve.py [port]

Then browse to the printed http://<your-lan-ip>:<port> on your Android phone
(make sure the phone is on the same Wi-Fi). ES modules require http(s), so you
can't just open index.html with file:// — use this.
"""
import http.server
import os
import socket
import socketserver
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def lan_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    os.chdir(ROOT)

    class Handler(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            # Avoid stale modules during development.
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("0.0.0.0", port), Handler) as httpd:
        print(f"Serving {ROOT}")
        print(f"  local:  http://localhost:{port}")
        print(f"  phone:  http://{lan_ip()}:{port}")
        print("Ctrl-C to stop.")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nbye")


if __name__ == "__main__":
    main()
