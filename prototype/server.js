// Tiny static server for the UnieMax seller + admin prototype. No packages.
//
//   node prototype/server.js        → http://localhost:5180
//
// Both apps MUST be served from this one origin: the browser only fires the
// `storage` event (how the two apps sync) between tabs of the same origin.
//
// App pages (seller.html, admin.html) get the real index.css put in at the
// "@index-css" marker, for the Tailwind browser build.
//
// It serves, in this order:
//   /app/index.css  → frontend/src/index.css        (the real design tokens)
//   /app/admin.css  → frontend/src/admin/admin.css  (the real console theme)
//   prototype/      → this folder
//   frontend/public → fonts and logos, at the same paths the real app uses
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')

const PORT = Number(process.env.PORT) || 5180
const HERE = __dirname
const FRONTEND = path.join(HERE, '..', 'frontend')

const ALIASES = {
  '/app/index.css': path.join(FRONTEND, 'src', 'index.css'),
  '/app/admin.css': path.join(FRONTEND, 'src', 'admin', 'admin.css'),
}
const ROOTS = [HERE, path.join(FRONTEND, 'public')]
const CSS_MARKER = '<!-- @index-css : server.js puts the real frontend/src/index.css here -->'

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
}

/** Resolve a URL path inside a root, refusing anything that climbs out of it. */
function inside(root, urlPath) {
  const file = path.normalize(path.join(root, urlPath))
  return file.startsWith(root + path.sep) ? file : null
}

function find(urlPath) {
  if (ALIASES[urlPath]) return ALIASES[urlPath]
  if (urlPath === '/') urlPath = '/index.html'
  for (const root of ROOTS) {
    const file = inside(root, urlPath)
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return file
  }
  return null
}

const URL_HOME = `http://localhost:${PORT}`

/** `--open` (used by start.cmd): open the launcher in the default browser. */
function openBrowser() {
  if (!process.argv.includes('--open')) return
  const { exec } = require('node:child_process')
  const cmd =
    process.platform === 'win32' ? `start "" "${URL_HOME}"` : process.platform === 'darwin' ? `open ${URL_HOME}` : `xdg-open ${URL_HOME}`
  exec(cmd)
}

const server = http
  .createServer((req, res) => {
    let urlPath
    try {
      urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    } catch {
      res.writeHead(400).end('Bad request')
      return
    }
    const file = find(urlPath)
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found')
      return
    }
    const headers = {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      // Always fresh: you edit these files while the prototype is open.
      'Cache-Control': 'no-store',
    }
    // App pages: put the real index.css in, as the Tailwind browser build needs it
    // inline (<style type="text/tailwindcss">). Read on every request, so a theme
    // change in the real app shows on the next reload.
    if (path.extname(file) === '.html') {
      const page = fs.readFileSync(file, 'utf8')
      if (page.includes(CSS_MARKER)) {
        const css = fs.readFileSync(ALIASES['/app/index.css'], 'utf8').replace(/<\/style/gi, '<\\/style')
        res.writeHead(200, headers).end(page.replace(CSS_MARKER, `<style type="text/tailwindcss">\n${css}\n</style>`))
        return
      }
    }
    res.writeHead(200, headers)
    fs.createReadStream(file).pipe(res)
  })
  .listen(PORT, () => {
    console.log(`UnieMax prototype → ${URL_HOME}`)
    console.log(`  Seller: ${URL_HOME}/seller.html`)
    console.log(`  Admin:  ${URL_HOME}/admin.html`)
    console.log('Close this window (or press Ctrl+C) to stop.')
    openBrowser()
  })

// Already running (a second double-click)? Just open the browser on it.
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`The prototype is already running at ${URL_HOME} — opening it.`)
    openBrowser()
    process.exit(0)
  }
  throw err
})
