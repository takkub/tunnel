import { NextResponse } from 'next/server'
import { runScript } from '@/lib/scripts'

export const dynamic = 'force-dynamic'

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const COUNTRY_RE = /^[A-Z]{2}$/
const MAX_COUNTRIES = 20

function badName(name: string) {
  return !name || !NAME_RE.test(name)
}

function badCountries(countries: unknown): string | null {
  if (!Array.isArray(countries)) return 'allowedCountries must be an array of strings'
  if (countries.length > MAX_COUNTRIES) return `allowedCountries: max ${MAX_COUNTRIES} countries`
  for (const c of countries) {
    if (typeof c !== 'string' || !COUNTRY_RE.test(c)) return `allowedCountries: invalid code "${c}"`
  }
  return null
}

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  if (badName(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }
  try {
    const output = await runScript('auth-gate.js', ['status', params.name])
    return NextResponse.json(JSON.parse(output))
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export async function PUT(req: Request, { params }: { params: { name: string } }) {
  if (badName(params.name)) {
    return NextResponse.json({ error: 'Invalid tunnel name' }, { status: 400 })
  }

  let body: { enabled?: boolean; password?: string; allowedCountries?: string[]; cloudflareBlock?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { enabled, password, allowedCountries, cloudflareBlock } = body
  if (typeof enabled !== 'boolean') {
    return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 })
  }
  if (allowedCountries !== undefined) {
    const err = badCountries(allowedCountries)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  try {
    if (!enabled) {
      // Cloudflare rule cleanup must happen while auth-gate.json (and its
      // cfRuleId) still exists — disable() deletes that file outright.
      const before = JSON.parse(await runScript('auth-gate.js', ['status', params.name]))
      let cfError: string | undefined
      if (before.cloudflareBlock) {
        const cfOut = JSON.parse(await runScript('auth-gate.js', ['cf-country-rule', params.name, 'off']))
        cfError = cfOut.cfError
      }
      const output = JSON.parse(await runScript('auth-gate.js', ['disable', params.name]))
      return NextResponse.json(cfError ? { ...output, cfError } : output)
    }

    let result: any
    let restartError: string | undefined
    if (password) {
      result = JSON.parse(await runScript('auth-gate.js', ['enable', params.name, password]))
      restartError = result.restartError
    } else {
      // enabled:true with no password — only valid as a re-save (countries/
      // cloudflareBlock change, or a true no-op) of an already-enabled gate
      const current = JSON.parse(await runScript('auth-gate.js', ['status', params.name]))
      if (!current.enabled) {
        return NextResponse.json({ error: 'password required to enable' }, { status: 400 })
      }
      result = current
    }

    let cfError: string | undefined
    let countriesChanged = false
    if (allowedCountries !== undefined) {
      const csv = allowedCountries.length ? allowedCountries.join(',') : '-'
      result = JSON.parse(await runScript('auth-gate.js', ['set-countries', params.name, csv]))
      countriesChanged = true
    }

    // Resync the Cloudflare rule's country list whenever it changed and the
    // block is (or is being) turned on, in addition to an explicit toggle.
    const wantCfBlock = cloudflareBlock !== undefined ? cloudflareBlock : (result.cloudflareBlock && countriesChanged)
    if (cloudflareBlock !== undefined || wantCfBlock) {
      result = JSON.parse(await runScript('auth-gate.js', ['cf-country-rule', params.name, wantCfBlock ? 'on' : 'off']))
      cfError = result.cfError
    }

    const final = { ...result }
    if (restartError) final.restartError = restartError
    if (cfError) final.cfError = cfError
    return NextResponse.json(final)
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
