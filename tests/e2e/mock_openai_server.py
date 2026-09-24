"""Deterministic OpenAI-compatible SSE server for local end-to-end tests."""
from http.server import BaseHTTPRequestHandler, HTTPServer
import json

class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("content-length", "0"))
        payload = json.loads(self.rfile.read(length) or b"{}")
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        answer = {"question_type": "single_choice", "answer": "B", "explanation": "本地模拟答案"}
        for chunk in [json.dumps(answer, ensure_ascii=False)]:
            data = {"choices": [{"delta": {"content": chunk}}]}
            self.wfile.write(f"data: {json.dumps(data)}\n\n".encode())
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")
        self.wfile.flush()

    def log_message(self, *_args):
        return

if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 19090), Handler).serve_forever()
