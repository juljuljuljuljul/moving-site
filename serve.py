import http.server, os

os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    # This is a dev server for actively-changing files — browsers (especially
    # mobile Safari) were caching old script.js/style.css across visits, so a
    # fix here could keep showing stale behavior on a phone that already
    # loaded the page once. Disable caching entirely rather than relying on
    # every visitor to remember to hard-refresh.
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


http.server.test(HandlerClass=NoCacheHandler, port=3457, bind='0.0.0.0')
