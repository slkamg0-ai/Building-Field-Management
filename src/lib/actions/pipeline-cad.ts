'use server'

import fs from 'fs'
import path from 'path'
import { revalidatePath } from 'next/cache'

const DATA_PATH = path.join(process.cwd(), 'src', 'data', 'actual_pipeline_cad.json')
const BACKUP_PATH = path.join(process.cwd(), 'src', 'data', 'actual_pipeline_cad.backup.json')

export interface SaveMasterDbPayload {
  viewBox?: string
  bounds?: any
  roadPaths?: string[]
  nodes: any[]
  segments: any[]
}

/**
 * 원본 actual_pipeline_cad.json 파일에 수정된 관로 및 맨홀 DB 영구 저장
 */
export async function savePipelineMasterDb(payload: SaveMasterDbPayload) {
  try {
    // 1. 기존 파일이 있으면 백업 파일 보존 (최초 1회 또는 갱신 전)
    if (fs.existsSync(DATA_PATH)) {
      if (!fs.existsSync(BACKUP_PATH)) {
        fs.copyFileSync(DATA_PATH, BACKUP_PATH)
      }
    }

    // 2. 기존 원본 데이터 구조 보존하면서 nodes와 segments 갱신
    let existingData: any = {}
    if (fs.existsSync(DATA_PATH)) {
      try {
        const raw = fs.readFileSync(DATA_PATH, 'utf-8')
        existingData = JSON.parse(raw)
      } catch (e) {}
    }

    const mergedData = {
      viewBox: payload.viewBox || existingData.viewBox || '0 0 920 520',
      bounds: payload.bounds || existingData.bounds || {},
      roadPaths: payload.roadPaths || existingData.roadPaths || [],
      nodes: payload.nodes,
      segments: payload.segments,
    }

    // 3. 파일 쓰기
    await fs.promises.writeFile(DATA_PATH, JSON.stringify(mergedData, null, 2), 'utf-8')

    // 4. Next.js 페이지 캐시 갱신
    revalidatePath('/')

    return {
      success: true,
      message: `원본 관로 DB(구간 ${payload.segments.length}개, 맨홀 ${payload.nodes.length}개)가 성공적으로 저장되었습니다.`,
      updatedAt: new Date().toISOString(),
    }
  } catch (error: any) {
    console.error('savePipelineMasterDb error:', error)
    return {
      success: false,
      error: error?.message || '원본 DB 저장 중 오류가 발생했습니다.',
    }
  }
}

/**
 * 백업본으로 원본 DB 복구
 */
export async function restorePipelineMasterDbFromBackup() {
  try {
    if (!fs.existsSync(BACKUP_PATH)) {
      return { success: false, error: '백업 파일이 존재하지 않습니다.' }
    }

    fs.copyFileSync(BACKUP_PATH, DATA_PATH)
    revalidatePath('/')

    return {
      success: true,
      message: '원본 DB가 백업 시점으로 성공적으로 복원되었습니다.',
    }
  } catch (error: any) {
    return {
      success: false,
      error: error?.message || '복원 실패',
    }
  }
}
