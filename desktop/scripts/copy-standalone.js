// Stages everything electron-builder's `extraResources` needs to copy, since
// electron-builder can't reach outside the desktop/ package directory.
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const DESKTOP = path.resolve(__dirname, '..')
const RES = path.join(DESKTOP, 'resources')

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true })
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(s, d)
    else fs.copyFileSync(s, d)
  }
}

rmrf(RES)
fs.mkdirSync(RES, { recursive: true })

// 1. root automation scripts (untouched, run as child processes)
copyDir(path.join(ROOT, 'scripts'), path.join(RES, 'scripts'))

// 2. the auth-gate login page nginx-gen.js templates into per-tunnel configs
fs.mkdirSync(path.join(RES, 'nginx', 'auth-gate'), { recursive: true })
fs.copyFileSync(
  path.join(ROOT, 'nginx', 'auth-gate', 'login.html'),
  path.join(RES, 'nginx', 'auth-gate', 'login.html')
)

// 3. the Next.js standalone server + static assets it can't self-locate
const standaloneSrc = path.join(ROOT, 'web', '.next', 'standalone')
if (!fs.existsSync(standaloneSrc)) {
  console.error('web/.next/standalone missing — run `npm --prefix web run build` first')
  process.exit(1)
}
copyDir(standaloneSrc, path.join(RES, 'web-standalone'))
// standalone output expects .next/static and public/ alongside server.js,
// but next build does not copy them there itself. web/ has no monorepo root
// linking it to the repo's top-level package.json, so Next's file tracer
// treats web/ itself as the project root — server.js lands directly at
// .next/standalone/server.js, not nested under a web/ subdirectory.
copyDir(path.join(ROOT, 'web', '.next', 'static'), path.join(RES, 'web-standalone', '.next', 'static'))
if (fs.existsSync(path.join(ROOT, 'web', 'public'))) {
  copyDir(path.join(ROOT, 'web', 'public'), path.join(RES, 'web-standalone', 'public'))
}

console.log('Staged desktop/resources for packaging.')
