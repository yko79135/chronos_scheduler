import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
test('production bundle serves workflow shell for browser automation', () => {
    const py = String.raw `
import http.server,socketserver,threading,urllib.request,time
httpd=socketserver.TCPServer(('127.0.0.1',0),http.server.SimpleHTTPRequestHandler)
port=httpd.server_address[1]
th=threading.Thread(target=httpd.serve_forever,daemon=True); th.start(); time.sleep(.2)
try:
 html=urllib.request.urlopen(f'http://127.0.0.1:{port}/index.html').read().decode('utf-8')
 js=urllib.request.urlopen(f'http://127.0.0.1:{port}/dist/main.js').read().decode('utf-8')
 print(('Chronos Scheduler' in html or 'app' in html) and 'Worker' in js and 'shared' in js and 'audit' in js and 'progress' in js)
finally:
 httpd.shutdown(); httpd.server_close()
`;
    const out = execFileSync('python3', ['-c', py], { encoding: 'utf8' }).trim();
    assert.equal(out.endsWith('True'), true);
});
