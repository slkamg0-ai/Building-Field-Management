// 얼굴 인식/매칭 유틸 (브라우저 전용)
// face-api.js(@vladmandic/face-api) 사용. 모델은 CDN에서 로드.
// 모델 로드/검출 실패 시에도 앱이 멈추지 않도록 항상 안전하게 동작.

const CDN_LIB = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js'
const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model'

// 일치로 볼 거리 임계값(작을수록 엄격). 0.5 이하면 동일인으로 간주.
export const MATCH_DISTANCE_THRESHOLD = 0.5

let faceapiMod: any = null
let loadPromise: Promise<any> | null = null

// face-api 라이브러리를 CDN 스크립트로 주입 (webpack 번들링 회피)
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).faceapi) return resolve()
    const existing = document.querySelector(`script[data-faceapi]`)
    if (existing) { existing.addEventListener('load', () => resolve()); return }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.setAttribute('data-faceapi', '1')
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('face-api 로드 실패'))
    document.head.appendChild(s)
  })
}

async function getFaceApi() {
  if (faceapiMod) return faceapiMod
  if (!loadPromise) {
    loadPromise = (async () => {
      if (typeof window === 'undefined') throw new Error('브라우저 전용')
      await loadScript(CDN_LIB)
      const faceapi = (window as any).faceapi
      if (!faceapi) throw new Error('faceapi 전역 없음')
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ])
      faceapiMod = faceapi
      return faceapi
    })()
  }
  return loadPromise
}

// 미리 모델을 준비(선택). 실패해도 throw하지 않음.
export async function preloadFaceModels(): Promise<boolean> {
  try {
    await getFaceApi()
    return true
  } catch (e) {
    console.warn('face model preload failed', e)
    return false
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// dataURL(또는 이미지 URL)에서 얼굴 특징벡터(128차원) 추출. 실패 시 null.
export async function getDescriptor(src: string): Promise<number[] | null> {
  try {
    const faceapi = await getFaceApi()
    const img = await loadImage(src)
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })
    const det = await faceapi
      .detectSingleFace(img, options)
      .withFaceLandmarks()
      .withFaceDescriptor()
    if (!det) return null
    return Array.from(det.descriptor as Float32Array)
  } catch (e) {
    console.warn('getDescriptor failed', e)
    return null
  }
}

function euclidean(a: number[], b: number[]): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  return Math.sqrt(sum)
}

// 거리(0~~1.2)를 0~1 유사도 점수로 변환 (0.5 거리에서 약 0.5점)
export function distanceToScore(distance: number): number {
  const s = 1 - distance
  return Math.max(0, Math.min(1, s))
}

export interface MatchResult {
  worker: any | null
  distance: number
  score: number
  matched: boolean
}

// descriptor를 후보 근로자들과 비교해 가장 가까운 1명을 반환.
export function bestMatch(
  descriptor: number[] | null,
  workers: any[],
): MatchResult {
  if (!descriptor) {
    return { worker: null, distance: 1, score: 0, matched: false }
  }
  let best: any = null
  let bestDist = Infinity
  for (const w of workers) {
    const d = w?.faceDescriptor
    const vec: number[] | null = Array.isArray(d) ? d : null
    if (!vec || vec.length !== descriptor.length) continue
    const dist = euclidean(descriptor, vec)
    if (dist < bestDist) {
      bestDist = dist
      best = w
    }
  }
  if (!best) return { worker: null, distance: 1, score: 0, matched: false }
  return {
    worker: best,
    distance: bestDist,
    score: distanceToScore(bestDist),
    matched: bestDist <= MATCH_DISTANCE_THRESHOLD,
  }
}
