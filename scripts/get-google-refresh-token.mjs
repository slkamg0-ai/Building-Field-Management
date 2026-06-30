import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'

const PORT = Number(process.env.GOOGLE_OAUTH_HELPER_PORT || 51789)
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`
const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
]

async function readDotEnv() {
  try {
    const text = await readFile('.env', 'utf8')
    return Object.fromEntries(
      text
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#') && line.includes('='))
        .map(line => {
          const index = line.indexOf('=')
          return [line.slice(0, index), line.slice(index + 1).replace(/^"|"$/g, '')]
        }),
    )
  } catch {
    return {}
  }
}

function openBrowser(url) {
  if (process.platform === 'win32') {
    spawn(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', 'Start-Process -FilePath $args[0]', url],
      { detached: true, stdio: 'ignore' },
    ).unref()
    return
  }
  if (process.platform === 'darwin') {
    spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
    return
  }
  spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}

async function exchangeCode({ code, clientId, clientSecret }) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  })

  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error_description || json.error || 'Google token exchange failed')
  }
  return json
}

const env = await readDotEnv()
const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || env.GOOGLE_OAUTH_CLIENT_ID
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || env.GOOGLE_OAUTH_CLIENT_SECRET

if (!clientId || !clientSecret) {
  console.error('GOOGLE_OAUTH_CLIENT_ID와 GOOGLE_OAUTH_CLIENT_SECRET을 먼저 .env에 넣어주세요.')
  process.exit(1)
}

const state = Math.random().toString(36).slice(2)
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', clientId)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('response_type', 'code')
authUrl.searchParams.set('scope', SCOPES.join(' '))
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent')
authUrl.searchParams.set('state', state)

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', REDIRECT_URI)
    if (url.pathname !== '/oauth2callback') {
      res.writeHead(404)
      res.end('Not found')
      return
    }

    if (url.searchParams.get('state') !== state) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('state 값이 일치하지 않습니다. 다시 시도하세요.')
      return
    }

    const error = url.searchParams.get('error')
    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end(`Google 승인 실패: ${error}`)
      return
    }

    const code = url.searchParams.get('code')
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' })
      res.end('code가 없습니다. 다시 시도하세요.')
      return
    }

    const token = await exchangeCode({ code, clientId, clientSecret })
    const refreshToken = token.refresh_token

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`
      <main style="font-family: system-ui; padding: 32px; line-height: 1.6;">
        <h1>Google Refresh Token 발급 완료</h1>
        <p>이 브라우저 창은 닫아도 됩니다. 터미널에 나온 값을 .env에 넣으세요.</p>
      </main>
    `)

    console.log('\n발급 완료!')
    if (refreshToken) {
      console.log('\n.env에 아래 값을 넣으세요:\n')
      console.log(`GOOGLE_OAUTH_REFRESH_TOKEN=${refreshToken}`)
    } else {
      console.log('\nrefresh_token이 응답에 없습니다.')
      console.log('이미 승인한 앱이면 Google 계정 보안 > 서드 파티 앱 연결에서 권한을 제거한 뒤 다시 실행하세요.')
      console.log('또는 OAuth 동의 화면에서 테스트 사용자에 현재 Google 계정이 포함되어 있는지 확인하세요.')
    }

    server.close()
  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(error instanceof Error ? error.message : String(error))
    console.error(error)
    server.close()
  }
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Google OAuth 승인 대기 중: ${REDIRECT_URI}`)
  console.log('\n브라우저가 자동으로 열리지 않으면 아래 주소를 복사해서 여세요:\n')
  console.log(authUrl.toString())
  openBrowser(authUrl.toString())
})
