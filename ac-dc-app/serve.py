#!/usr/bin/env python3
"""
Simple HTTP server for the AC/DC Framework app.
Serves from the repository root so all data file paths resolve correctly.

Usage:
    python3 ac-dc-app/serve.py

Then open: http://localhost:8080/ac-dc-app/index.html
"""

import http.server
import os
import sys

PORT = 8080

def main():
    # Always serve from repo root (parent of ac-dc-app/)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    repo_root = os.path.dirname(script_dir)
    os.chdir(repo_root)

    handler = http.server.SimpleHTTPRequestHandler
    handler.extensions_map.update({
        '.js': 'application/javascript',
        '.json': 'application/json',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
    })

    with http.server.HTTPServer(('', PORT), handler) as httpd:
        url = f'http://localhost:{PORT}/ac-dc-app/index.html'
        print(f'AC/DC Framework App')
        print(f'Serving from: {repo_root}')
        print(f'Open: {url}')
        print(f'Press Ctrl+C to stop\n')

        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print('\nShutting down.')

if __name__ == '__main__':
    main()
