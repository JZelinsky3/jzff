"""Render the Pack Empire teaser straight to an MP4, frame by frame.

A screen recording drops frames whenever the machine is busy, and a phone's
recorder compresses it to mush. This never plays the reel in real time: it
swaps the page's clock (performance.now, timers, requestAnimationFrame) for one
it steps by hand, seeks every CSS animation and transition to the same moment,
then captures that frame. Every frame is exact however long it takes to draw,
and the result is a clean loop at full size.

Needs the teaser served (the :3100 production build, or the dev server) and
Google Chrome. Encodes with encode.swift, the Mac's own H.264, no ffmpeg.

    python3 scripts/pack-empire-teaser/render.py              # both, 60fps, to the Desktop
    python3 scripts/pack-empire-teaser/render.py --ar 916     # just the vertical
    python3 scripts/pack-empire-teaser/render.py --fps 30 --url http://localhost:3000/games/pack-empire/design/teaser/

Vertical comes out 1080x1920, 16:9 comes out 1920x1080. One full loop, start to
just before the reel comes back round to the intro.
"""

import argparse
import asyncio
import base64
import json
import shutil
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import websockets

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
HERE = Path(__file__).resolve().parent

# Installed before any of the page's own scripts. Time stands still until
# __tz.advance moves it; sync() pauses every animation the first time it sees
# one and from then on sets it to how long it's been alive on that clock.
CLOCK = r"""
(() => {
  const realSetTimeout = window.setTimeout.bind(window)
  const t0 = Date.now()
  let vt = 0
  let seq = 1
  const timers = new Map()
  const rafs = new Map()
  performance.now = () => vt
  Date.now = () => t0 + vt
  window.setTimeout = (fn, ms, ...args) => { const id = seq++; timers.set(id, { at: vt + Math.max(0, +ms || 0), fn, args, seq: id }); return id }
  window.setInterval = (fn, ms, ...args) => { const id = seq++; const every = Math.max(1, +ms || 0); timers.set(id, { at: vt + every, every, fn, args, seq: id }); return id }
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id) }
  window.requestAnimationFrame = (fn) => { const id = seq++; rafs.set(id, fn); return id }
  window.cancelAnimationFrame = (id) => { rafs.delete(id) }
  const born = new WeakMap()
  window.__tz = {
    advance(ms) {
      const end = vt + ms
      for (let guard = 0; guard < 5000; guard++) {
        let next = null
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next.t.at || (t.at === next.t.at && t.seq < next.t.seq))) next = { id, t }
        if (!next) break
        vt = Math.max(vt, next.t.at)
        if (next.t.every) next.t.at += next.t.every
        else timers.delete(next.id)
        try { typeof next.t.fn === 'function' ? next.t.fn(...next.t.args) : 0 } catch (e) { console.error(e) }
      }
      vt = end
      const due = [...rafs.values()]
      rafs.clear()
      for (const fn of due) { try { fn(vt) } catch (e) { console.error(e) } }
    },
    sync() {
      for (const a of document.getAnimations()) {
        if (!born.has(a)) { born.set(a, vt); a.pause() }
        try { a.currentTime = vt - born.get(a) } catch (e) {}
      }
    },
    // Lets React commit and run its effects: a few real turns of the event loop.
    async settle() {
      for (let i = 0; i < 3; i++) await new Promise((r) => { const c = new MessageChannel(); c.port1.onmessage = () => realSetTimeout(r, 0); c.port2.postMessage(0) })
    },
  }
})()
"""

SHAPES = {
    '916': {'query': '?ar=916', 'scale': 2, 'name': 'pack-empire-teaser-9x16.mp4'},
    '169': {'query': '', 'scale': 1.5, 'name': 'pack-empire-teaser-16x9.mp4'},
}


class Page:
    def __init__(self, ws):
        self.ws = ws
        self.n = 0

    async def cmd(self, method, **params):
        self.n += 1
        me = self.n
        await self.ws.send(json.dumps({'id': me, 'method': method, 'params': params}))
        while True:
            m = json.loads(await self.ws.recv())
            if m.get('id') == me:
                if 'error' in m:
                    raise RuntimeError(f"{method}: {m['error']}")
                return m.get('result', {})

    async def js(self, expr, wait=False):
        r = await self.cmd('Runtime.evaluate', expression=expr, returnByValue=True, awaitPromise=wait)
        if 'exceptionDetails' in r:
            raise RuntimeError(r['exceptionDetails'])
        return r.get('result', {}).get('value')


async def render(url: str, shape: str, fps: int, out: Path, frames: Path, seconds: float | None = None) -> None:
    cfg = SHAPES[shape]
    port = 9400 + int(shape)
    profile = tempfile.mkdtemp(prefix='tz-chrome-')
    chrome = subprocess.Popen(
        [CHROME, '--headless=new', f'--remote-debugging-port={port}', f'--user-data-dir={profile}', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        for _ in range(100):
            try:
                tabs = json.load(urllib.request.urlopen(f'http://localhost:{port}/json'))
                tab = next(t for t in tabs if t['type'] == 'page')
                break
            except Exception:
                time.sleep(0.2)
        async with websockets.connect(tab['webSocketDebuggerUrl'], max_size=2**28) as ws:
            page = Page(ws)
            await page.cmd('Emulation.setDeviceMetricsOverride', width=1400, height=1100, deviceScaleFactor=cfg['scale'], mobile=False)
            await page.cmd('Page.enable')
            await page.cmd('Page.addScriptToEvaluateOnNewDocument', source=CLOCK)
            await page.cmd('Page.navigate', url=url + cfg['query'])

            # The ready screen loads and decodes every picture before it lets play start.
            # React does its work off the page's timers, so with the clock stood still
            # nothing redraws: nudge it along while waiting.
            for _ in range(240):
                await asyncio.sleep(0.5)
                await page.js('__tz.advance(50)')
                if await page.js("(document.querySelector('.tz-ready p')?.textContent || '').startsWith('Click')"):
                    break
            else:
                raise RuntimeError('the teaser never got past its ready screen')
            await page.js('document.fonts.ready.then(() => true)', wait=True)
            box = await page.js("JSON.stringify(document.querySelector('.tz-frame').getBoundingClientRect())")
            box = json.loads(box)
            clip = {'x': box['x'], 'y': box['y'], 'width': box['width'], 'height': box['height'], 'scale': 1}

            for kind in ('keyDown', 'keyUp'):
                await page.cmd('Input.dispatchKeyEvent', type=kind, key=' ', code='Space', windowsVirtualKeyCode=32)

            step = 1000 / fps
            seen_last = False
            beats = None
            i = 0
            started = time.time()
            while i < fps * (seconds or 90):
                if i:
                    await page.js(f'__tz.advance({step})')
                await page.js('__tz.settle()', wait=True)
                await page.js('__tz.sync()')
                label = await page.js("document.querySelector('.tz-ctl-name')?.textContent || ''")
                # "07 / 13 · Mega Draft": stop when it comes back round to the first beat.
                if '/' in label:
                    at, of = label.split('·')[0].split('/')
                    at, beats = int(at), int(of)
                    if at == beats:
                        seen_last = True
                    elif seen_last and at == 1:
                        break
                shot = await page.cmd('Page.captureScreenshot', format='jpeg', quality=94, clip=clip)
                (frames / f'{i:05d}.jpg').write_bytes(base64.b64decode(shot['data']))
                i += 1
                if i % (fps * 5) == 0:
                    print(f'  {shape}: {i / fps:.0f}s of video, {time.time() - started:.0f}s in')
    finally:
        chrome.terminate()
        shutil.rmtree(profile, ignore_errors=True)

    print(f'  {shape}: {i} frames ({i / fps:.1f}s), encoding')
    subprocess.run(['swift', str(HERE / 'encode.swift'), str(frames), str(fps), str(out)], check=True)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--url', default='http://localhost:3100/games/pack-empire/design/teaser/')
    ap.add_argument('--ar', choices=['916', '169', 'both'], default='both')
    ap.add_argument('--fps', type=int, default=60)
    ap.add_argument('--out', default=str(Path.home() / 'Desktop'))
    ap.add_argument('--seconds', type=float, help='stop after this much video (a quick test)')
    ap.add_argument('--frames', help='keep the frames in this folder instead of a temporary one')
    a = ap.parse_args()
    for shape in (['916', '169'] if a.ar == 'both' else [a.ar]):
        keep = Path(a.frames) / shape if a.frames else None
        frames = keep or Path(tempfile.mkdtemp(prefix=f'tz-frames-{shape}-'))
        frames.mkdir(parents=True, exist_ok=True)
        try:
            asyncio.run(render(a.url, shape, a.fps, Path(a.out) / SHAPES[shape]['name'], frames, a.seconds))
        finally:
            if not keep:
                shutil.rmtree(frames, ignore_errors=True)


if __name__ == '__main__':
    main()
