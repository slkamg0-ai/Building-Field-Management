import { cookies } from 'next/headers'
import crypto from 'crypto'

const SESSION_COOKIE = 'field_session'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 12

export type SessionUser = {
  id: string
  name: string
  role: string
}

function getSecret() {
  const secret = process.env.SESSION_SECRET || process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SESSION_SECRET or NEXTAUTH_SECRET is required in production')
    }
    return 'dev-only-session-secret'
  }
  return secret
}

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url')
}

function sign(payload: string) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url')
}

export function hashPin(pin: string) {
  const salt = crypto.randomBytes(16).toString('base64url')
  const hash = crypto.pbkdf2Sync(pin, salt, 120000, 32, 'sha256').toString('base64url')
  return `pbkdf2_sha256$120000$${salt}$${hash}`
}

export function verifyPin(pin: string, storedHash?: string | null) {
  if (!storedHash) return false
  const [algorithm, iterationsRaw, salt, expected] = storedHash.split('$')
  if (algorithm !== 'pbkdf2_sha256' || !iterationsRaw || !salt || !expected) return false
  const iterations = Number(iterationsRaw)
  if (!Number.isInteger(iterations) || iterations < 100000) return false
  const actual = crypto.pbkdf2Sync(pin, salt, iterations, 32, 'sha256').toString('base64url')
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

export async function createSession(user: SessionUser) {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000
  const payload = base64url(JSON.stringify({ ...user, exp: expiresAt }))
  const token = `${payload}.${sign(payload)}`
  const store = await cookies()
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

export async function clearSession() {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  const token = store.get(SESSION_COOKIE)?.value
  if (!token) return null

  const [payload, signature] = token.split('.')
  if (!payload || !signature || sign(payload) !== signature) return null

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!parsed?.id || !parsed?.name || !parsed?.role || Date.now() > parsed.exp) return null
    return { id: parsed.id, name: parsed.name, role: parsed.role }
  } catch {
    return null
  }
}

export async function requireUser() {
  const user = await getSessionUser()
  if (!user) throw new Error('로그인이 필요합니다.')
  return user
}

export async function requireAdmin() {
  const user = await requireUser()
  if (user.role !== 'ADMIN') throw new Error('관리자 권한이 필요합니다.')
  return user
}
