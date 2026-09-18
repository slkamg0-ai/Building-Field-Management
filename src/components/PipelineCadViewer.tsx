'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import cadData from '@/data/actual_pipeline_cad.json'
import { savePipelineMasterDb, restorePipelineMasterDbFromBackup } from '@/lib/actions/pipeline-cad'

export interface PipeSegment {
  id: string
  name: string
  fromNode: string
  toNode: string
  status: 'completed' | 'in_progress' | 'planned'
  pipeType: string
  diameter: number
  length: number
  depth: number
  invertFrom?: number | null
  invertTo?: number | null
  slope?: number | null
  pathD: string
  crew?: string
  inspectionStatus?: string
  note?: string
}

export interface NodePoint {
  id: string
  name: string
  x: number
  y: number
  rawX: number
  rawY: number
  depth?: string
  invertLevel?: number | null
  dropInvertLevel?: number | null
  isDropManhole?: boolean
  zone?: string
  branch?: string
  status: 'completed' | 'in_progress' | 'planned'
}

interface Props {
  className?: string
}

export default function PipelineCadViewer({ className = '' }: Props) {
  // ── [1. 주 화면 표시 모드: 'table'(관로/맨홀 DB 직접 편집 표) | 'cad'(CAD 도면 뷰) | 'split'(도면 + DB 분할 뷰)] ──
  // 사용자의 요청대로 '도면 대신 DB를 직접 보고 편리하게 수정'할 수 있도록 기본값을 'table'로 설정합니다.
  const [displayMode, setDisplayMode] = useState<'table' | 'cad' | 'split'>('table')

  // DB 서브 탭: 'segments'(관로 구간 DB 188개) vs 'nodes'(맨홀 측량 DB 244개)
  const [dbTab, setDbTab] = useState<'segments' | 'nodes'>('segments')

  // 모드 관리: 'daily'(시공 실적 관리) vs 'master'(원본 DB 기종점/규격 수정)
  const [viewerMode, setViewerMode] = useState<'daily' | 'master'>('daily')

  // 필터 및 선택 상태
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'in_progress' | 'planned' | 'error'>('all')
  const [selectedSegment, setSelectedSegment] = useState<PipeSegment | null>(null)
  const [selectedNode, setSelectedNode] = useState<NodePoint | null>(null)
  const [hoveredSegment, setHoveredSegment] = useState<PipeSegment | null>(null)
  const [hoveredNode, setHoveredNode] = useState<NodePoint | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  // 검색 및 페이징 상태
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const [tablePage, setTablePage] = useState(1)
  const [pageSize, setPageSize] = useState(15)

  // 인라인 직접 수정 상태 (Row Inline Edit)
  const [inlineEditingSegId, setInlineEditingSegId] = useState<string | null>(null)
  const [inlineSegData, setInlineSegData] = useState<Partial<PipeSegment>>({})
  const [inlineEditingNodeId, setInlineEditingNodeId] = useState<string | null>(null)
  const [inlineNodeData, setInlineNodeData] = useState<Partial<NodePoint>>({})

  // 다중 선택 (일괄 상태 변경용)
  const [selectedSegIds, setSelectedSegIds] = useState<Set<string>>(new Set())

  // 서버 파일 영구 저장 상태
  const [isSavingServer, setIsSavingServer] = useState(false)
  const [serverSaveMsg, setServerSaveMsg] = useState<{ success: boolean; text: string } | null>(null)
  const [saveToast, setSaveToast] = useState<string | null>(null)

  // 줌 & 팬 상태 (SVG 기준 center: 460, 260)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [targetReticle, setTargetReticle] = useState<{ x: number; y: number; label: string } | null>(null)

  // 트림 패스 시뮬레이션 상태
  const [isPlaying, setIsPlaying] = useState(false)
  const [simProgress, setSimProgress] = useState<number>(100)
  const animRef = useRef<number | null>(null)

  const STORAGE_KEY_SEGMENTS = 'field_pipeline_segments_v6'
  const STORAGE_KEY_NODES = 'field_pipeline_nodes_v6'

  // ── [2. 데이터 로드: 오수 2공구 실측 DB 연동] ──
  const [segments, setSegments] = useState<PipeSegment[]>(() => {
    const base = cadData.segments as PipeSegment[]
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_SEGMENTS)
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as PipeSegment[]
          const editMap = new Map(parsed.map(p => [p.id, p]))
          return base.map(b => {
            const ed = editMap.get(b.id)
            if (!ed) return b
            const isUserCompleted = ed.status === 'completed'
            const isUserInProgress = ed.status === 'in_progress'
            return {
              ...b,
              status: isUserCompleted ? 'completed' : isUserInProgress ? 'in_progress' : 'planned',
              crew: isUserCompleted ? (ed.crew || '토목 1팀') : isUserInProgress ? (ed.crew || '토목 1팀') : '미착공',
              note: ed.note || '',
              inspectionStatus: isUserCompleted ? (ed.inspectionStatus || '합격') : isUserInProgress ? (ed.inspectionStatus || '검측중') : '미착공',
              fromNode: ed.fromNode || b.fromNode,
              toNode: ed.toNode || b.toNode,
              name: ed.name || b.name,
              pipeType: ed.pipeType || b.pipeType,
              diameter: ed.diameter || b.diameter,
              length: ed.length || b.length,
              depth: ed.depth || b.depth,
              invertFrom: b.invertFrom,
              invertTo: b.invertTo,
              slope: b.slope,
            }
          })
        } catch (e) {}
      }
    }
    return base
  })

  const [nodes, setNodes] = useState<NodePoint[]>(() => {
    const base = cadData.nodes as NodePoint[]
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY_NODES)
      if (saved) {
        try {
          const parsed = JSON.parse(saved) as NodePoint[]
          const editMap = new Map(parsed.map(n => [n.id, n]))
          return base.map(b => {
            const ed = editMap.get(b.id)
            if (!ed) return b
            const isUserCompleted = ed.status === 'completed'
            const isUserInProgress = ed.status === 'in_progress'
            return {
              ...b,
              status: isUserCompleted ? 'completed' : isUserInProgress ? 'in_progress' : 'planned',
              name: ed.name || b.name,
              depth: ed.depth || b.depth,
              invertLevel: b.invertLevel,
              dropInvertLevel: b.dropInvertLevel,
              isDropManhole: b.isDropManhole,
              zone: b.zone,
              branch: b.branch,
            }
          })
        } catch (e) {}
      }
    }
    return base
  })

  const roadPaths = useMemo(() => cadData.roadPaths as string[], [])

  // 대시보드 및 타 컴포넌트 실시간 동기화 브로드캐스트
  const notifyStorageUpdate = (segs?: PipeSegment[], nds?: NodePoint[]) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pipeline_data_updated', {
        detail: { segments: segs || segments, nodes: nds || nodes }
      }))
    }
  }

  // ── [3. 통계 및 오류 진단 계산] ──
  const anomalyStats = useMemo(() => {
    const sameNode = segments.filter(s => s.fromNode === s.toNode)
    const dummyNode = segments.filter(s => s.fromNode.startsWith('N') || s.toNode.startsWith('N'))
    const allErrors = segments.filter(s => s.fromNode === s.toNode || s.fromNode.startsWith('N') || s.toNode.startsWith('N'))
    return {
      sameNodeCount: sameNode.length,
      dummyNodeCount: dummyNode.length,
      totalErrors: allErrors.length,
      allErrors,
    }
  }, [segments])

  const stats = useMemo(() => {
    const totalLength = segments.reduce((sum, s) => sum + s.length, 0)
    const completedLength = segments.filter(s => s.status === 'completed').reduce((sum, s) => sum + s.length, 0)
    const inProgressLength = segments.filter(s => s.status === 'in_progress').reduce((sum, s) => sum + s.length, 0)
    const plannedLength = segments.filter(s => s.status === 'planned').reduce((sum, s) => sum + s.length, 0)

    const completedSegmentsCount = segments.filter(s => s.status === 'completed').length
    const inProgressSegmentsCount = segments.filter(s => s.status === 'in_progress').length
    const plannedSegmentsCount = segments.filter(s => s.status === 'planned').length

    const completedRate = totalLength > 0 ? Math.round((completedLength / totalLength) * 1000) / 10 : 0
    const progressRate = totalLength > 0 ? Math.round(((completedLength + inProgressLength) / totalLength) * 1000) / 10 : 0

    return {
      totalLength: Math.round(totalLength),
      completedLength: Math.round(completedLength),
      inProgressLength: Math.round(inProgressLength),
      plannedLength: Math.round(plannedLength),
      completedSegmentsCount,
      inProgressSegmentsCount,
      plannedSegmentsCount,
      completedRate,
      progressRate,
    }
  }, [segments])

  // ── [4. 필터링된 테이블 데이터 목록] ──
  const filteredSegmentsList = useMemo(() => {
    let list = segments

    if (statusFilter === 'completed') list = list.filter(s => s.status === 'completed')
    else if (statusFilter === 'in_progress') list = list.filter(s => s.status === 'in_progress')
    else if (statusFilter === 'planned') list = list.filter(s => s.status === 'planned')
    else if (statusFilter === 'error') list = anomalyStats.allErrors

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(s =>
        s.id.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.fromNode.toLowerCase().includes(q) ||
        s.toNode.toLowerCase().includes(q) ||
        s.pipeType.toLowerCase().includes(q) ||
        (s.crew && s.crew.toLowerCase().includes(q)) ||
        (s.note && s.note.toLowerCase().includes(q))
      )
    }
    return list
  }, [segments, statusFilter, searchQuery, anomalyStats])

  const filteredNodesList = useMemo(() => {
    let list = nodes
    if (statusFilter === 'completed') list = list.filter(n => n.status === 'completed')
    else if (statusFilter === 'in_progress') list = list.filter(n => n.status === 'in_progress')
    else if (statusFilter === 'planned') list = list.filter(n => n.status === 'planned')

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      list = list.filter(n =>
        n.id.toLowerCase().includes(q) ||
        n.name.toLowerCase().includes(q) ||
        (n.depth && n.depth.toLowerCase().includes(q)) ||
        (n.branch && n.branch.toLowerCase().includes(q)) ||
        (n.invertLevel !== null && n.invertLevel !== undefined && String(n.invertLevel).includes(q))
      )
    }
    return list
  }, [nodes, statusFilter, searchQuery])

  // 페이징 계산
  const currentTotalItems = dbTab === 'segments' ? filteredSegmentsList.length : filteredNodesList.length
  const totalPages = Math.max(1, Math.ceil(currentTotalItems / pageSize))
  const paginatedSegments = useMemo(() => {
    const start = (tablePage - 1) * pageSize
    return filteredSegmentsList.slice(start, start + pageSize)
  }, [filteredSegmentsList, tablePage, pageSize])

  const paginatedNodes = useMemo(() => {
    const start = (tablePage - 1) * pageSize
    return filteredNodesList.slice(start, start + pageSize)
  }, [filteredNodesList, tablePage, pageSize])

  // ── [5. 핵심 기능: 표에서 1클릭 즉시 상태 전환 및 로컬스토리지 저장] ──
  const handleUpdateSegmentStatus = (segId: string, newStatus: 'completed' | 'in_progress' | 'planned') => {
    const updatedSegments = segments.map(s => {
      if (s.id === segId) {
        return {
          ...s,
          status: newStatus,
          crew: newStatus === 'completed' ? (s.crew && s.crew !== '미착공' ? s.crew : '토목 1팀') : (newStatus === 'planned' ? '미착공' : (s.crew || '토목 1팀')),
          inspectionStatus: newStatus === 'completed' ? (s.inspectionStatus && s.inspectionStatus !== '미착공' ? s.inspectionStatus : '합격') : (newStatus === 'planned' ? '미착공' : '검측중'),
        }
      }
      return s
    })

    const seg = segments.find(s => s.id === segId)
    let updatedNodes = nodes
    if (seg) {
      updatedNodes = nodes.map(n => {
        if (n.id === seg.fromNode || n.id === seg.toNode) {
          if (newStatus === 'completed') {
            return { ...n, status: 'completed' as const }
          } else if (newStatus === 'in_progress') {
            const hasCompleted = updatedSegments.some(s => (s.fromNode === n.id || s.toNode === n.id) && s.status === 'completed')
            return { ...n, status: hasCompleted ? ('completed' as const) : ('in_progress' as const) }
          } else {
            const hasCompleted = updatedSegments.some(s => (s.fromNode === n.id || s.toNode === n.id) && s.status === 'completed')
            const hasInProgress = updatedSegments.some(s => (s.fromNode === n.id || s.toNode === n.id) && s.status === 'in_progress')
            return { ...n, status: hasCompleted ? ('completed' as const) : hasInProgress ? ('in_progress' as const) : ('planned' as const) }
          }
        }
        return n
      })
    }

    setSegments(updatedSegments)
    setNodes(updatedNodes)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(updatedSegments))
      localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(updatedNodes))
      notifyStorageUpdate(updatedSegments, updatedNodes)
    }

    const statusLabel = newStatus === 'completed' ? '시공완료' : newStatus === 'in_progress' ? '금일진행' : '시공계획(미착공)'
    showToast(`[${segId}] 구간이 '${statusLabel}'(으)로 즉시 변경되었습니다.`)
  }

  // 맨홀 상태 1클릭 변경
  const handleUpdateNodeStatus = (nodeId: string, newStatus: 'completed' | 'in_progress' | 'planned') => {
    const updatedNodes = nodes.map(n => {
      if (n.id === nodeId) return { ...n, status: newStatus }
      return n
    })
    setNodes(updatedNodes)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(updatedNodes))
      notifyStorageUpdate(segments, updatedNodes)
    }
    const statusLabel = newStatus === 'completed' ? '시공완료' : newStatus === 'in_progress' ? '금일진행' : '시공계획'
    showToast(`맨홀 [${nodeId}]이(가) '${statusLabel}'(으)로 변경되었습니다.`)
  }

  // ── [6. 다중 선택 일괄 상태 변경] ──
  const handleToggleSelectAll = () => {
    if (selectedSegIds.size === paginatedSegments.length) {
      setSelectedSegIds(new Set())
    } else {
      setSelectedSegIds(new Set(paginatedSegments.map(s => s.id)))
    }
  }

  const handleToggleSelectSegment = (id: string) => {
    const next = new Set(selectedSegIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedSegIds(next)
  }

  const handleBatchStatusChange = (newStatus: 'completed' | 'in_progress' | 'planned') => {
    if (selectedSegIds.size === 0) return
    const count = selectedSegIds.size
    const updatedSegments = segments.map(s => {
      if (selectedSegIds.has(s.id)) {
        return {
          ...s,
          status: newStatus,
          crew: newStatus === 'completed' ? (s.crew && s.crew !== '미착공' ? s.crew : '토목 1팀') : (newStatus === 'planned' ? '미착공' : (s.crew || '토목 1팀')),
          inspectionStatus: newStatus === 'completed' ? (s.inspectionStatus && s.inspectionStatus !== '미착공' ? s.inspectionStatus : '합격') : (newStatus === 'planned' ? '미착공' : '검측중'),
        }
      }
      return s
    })

    const updatedNodes = nodes.map(n => {
      const hasCompleted = updatedSegments.some(s => (s.fromNode === n.id || s.toNode === n.id) && s.status === 'completed')
      const hasInProgress = updatedSegments.some(s => (s.fromNode === n.id || s.toNode === n.id) && s.status === 'in_progress')
      return { ...n, status: hasCompleted ? ('completed' as const) : hasInProgress ? ('in_progress' as const) : ('planned' as const) }
    })

    setSegments(updatedSegments)
    setNodes(updatedNodes)
    setSelectedSegIds(new Set())
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(updatedSegments))
      localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(updatedNodes))
      notifyStorageUpdate(updatedSegments, updatedNodes)
    }
    const statusLabel = newStatus === 'completed' ? '시공완료' : newStatus === 'in_progress' ? '금일진행' : '시공계획(미착공)'
    showToast(`선택된 ${count}개 구간이 '${statusLabel}'(으)로 일괄 변경되었습니다.`)
  }

  // ── [7. 인라인 직접 수정 (Row Inline Editing)] ──
  const handleStartInlineEdit = (seg: PipeSegment) => {
    setInlineEditingSegId(seg.id)
    setInlineSegData({ ...seg })
  }

  const handleSaveInlineEdit = () => {
    if (!inlineEditingSegId) return
    const updatedSegments = segments.map(s => {
      if (s.id === inlineEditingSegId) {
        const from = inlineSegData.fromNode || s.fromNode
        const to = inlineSegData.toNode || s.toNode
        return {
          ...s,
          ...inlineSegData,
          name: inlineSegData.name || `${from} ~ ${to}`,
          diameter: Number(inlineSegData.diameter) || s.diameter,
          length: Number(inlineSegData.length) || s.length,
          depth: Number(inlineSegData.depth) || s.depth,
        } as PipeSegment
      }
      return s
    })

    setSegments(updatedSegments)
    setInlineEditingSegId(null)
    setInlineSegData({})
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(updatedSegments))
      notifyStorageUpdate(updatedSegments, nodes)
    }
    showToast(`[${inlineEditingSegId}] 구간의 수정사항이 저장되었습니다.`)
  }

  const handleCancelInlineEdit = () => {
    setInlineEditingSegId(null)
    setInlineSegData({})
  }

  // 맨홀 인라인 수정
  const handleStartInlineNodeEdit = (node: NodePoint) => {
    setInlineEditingNodeId(node.id)
    setInlineNodeData({ ...node })
  }

  const handleSaveInlineNodeEdit = () => {
    if (!inlineEditingNodeId) return
    const oldId = inlineEditingNodeId
    const newId = inlineNodeData.id?.trim() || oldId

    const updatedNodes = nodes.map(n => {
      if (n.id === oldId) {
        return {
          ...n,
          ...inlineNodeData,
          id: newId,
          name: inlineNodeData.name || `${newId} 맨홀`,
          invertLevel: inlineNodeData.invertLevel !== undefined ? Number(inlineNodeData.invertLevel) : n.invertLevel,
        } as NodePoint
      }
      return n
    })

    // 맨홀 ID가 변경된 경우 연결된 관로도 자동 동기화
    let updatedSegments = segments
    if (oldId !== newId) {
      updatedSegments = segments.map(s => {
        let changed = false
        let from = s.fromNode
        let to = s.toNode
        if (from === oldId) { from = newId; changed = true }
        if (to === oldId) { to = newId; changed = true }
        if (changed) {
          return {
            ...s,
            fromNode: from,
            toNode: to,
            name: `${from} ~ ${to}`,
          }
        }
        return s
      })
      setSegments(updatedSegments)
    }

    setNodes(updatedNodes)
    setInlineEditingNodeId(null)
    setInlineNodeData({})
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(updatedNodes))
      localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(updatedSegments))
      notifyStorageUpdate(updatedSegments, updatedNodes)
    }
    showToast(`맨홀 [${newId}]의 수정사항이 저장되었습니다.`)
  }

  const handleCancelInlineNodeEdit = () => {
    setInlineEditingNodeId(null)
    setInlineNodeData({})
  }

  // 세그먼트 삭제
  const handleDeleteSegment = (segId: string) => {
    if (!confirm(`구간 [${segId}]을(를) 관로 DB에서 완전히 삭제하시겠습니까?`)) return
    const updated = segments.filter(s => s.id !== segId)
    setSegments(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(updated))
      notifyStorageUpdate(updated, nodes)
    }
    showToast(`구간 [${segId}]이(가) DB에서 삭제되었습니다.`)
  }

  // 맨홀 삭제
  const handleDeleteNode = (nodeId: string) => {
    if (!confirm(`맨홀 [${nodeId}]을(를) 삭제하시겠습니까? 연결된 관로가 있는 경우 유의하세요.`)) return
    const updated = nodes.filter(n => n.id !== nodeId)
    setNodes(updated)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(updated))
      notifyStorageUpdate(segments, updated)
    }
    showToast(`맨홀 [${nodeId}]이(가) 삭제되었습니다.`)
  }

  // ── [8. 도면 위치 연동 줌/포커스] ──
  const getSegmentCenter = (seg: PipeSegment) => {
    const from = nodes.find(n => n.id === seg.fromNode)
    const to = nodes.find(n => n.id === seg.toNode)
    if (from && to) return { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }
    if (from) return { x: from.x, y: from.y }
    if (to) return { x: to.x, y: to.y }
    const matches = seg.pathD.match(/[\d.]+/g)
    if (matches && matches.length >= 4) {
      const x1 = parseFloat(matches[0])
      const y1 = parseFloat(matches[1])
      const x2 = parseFloat(matches[matches.length - 2])
      const y2 = parseFloat(matches[matches.length - 1])
      return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
    }
    return { x: 460, y: 260 }
  }

  const focusOnSegment = (seg: PipeSegment, targetZoom = 2.6) => {
    const center = getSegmentCenter(seg)
    setZoom(targetZoom)
    setPan({
      x: (460 - center.x) * targetZoom,
      y: (260 - center.y) * targetZoom,
    })
    setTargetReticle({ x: center.x, y: center.y, label: `${seg.id} (${seg.name})` })
    setSelectedSegment(seg)
    setSelectedNode(null)
  }

  const focusOnNode = (node: NodePoint, targetZoom = 2.8) => {
    setZoom(targetZoom)
    setPan({
      x: (460 - node.x) * targetZoom,
      y: (260 - node.y) * targetZoom,
    })
    setTargetReticle({ x: node.x, y: node.y, label: node.name })
    setSelectedNode(node)
    setSelectedSegment(null)
  }

  const handleViewSegmentOnCad = (seg: PipeSegment) => {
    setDisplayMode('split')
    focusOnSegment(seg)
    showToast(`도면에서 [${seg.id}] 위치로 이동했습니다.`)
  }

  const handleViewNodeOnCad = (node: NodePoint) => {
    setDisplayMode('split')
    focusOnNode(node)
    showToast(`도면에서 맨홀 [${node.id}] 위치로 이동했습니다.`)
  }

  // ── [9. 서버 파일 영구 저장 액션: actual_pipeline_cad.json 쓰기] ──
  const handleSaveMasterDbToServer = async () => {
    if (!confirm(`수정된 관로(${segments.length}개) 및 맨홀(${nodes.length}개) 데이터를 서버 원본 파일(actual_pipeline_cad.json)에 영구 저장하시겠습니까?\n기존 원본은 자동 백업됩니다.`)) {
      return
    }

    setIsSavingServer(true)
    setServerSaveMsg(null)

    try {
      const res = await savePipelineMasterDb({
        viewBox: cadData.viewBox,
        bounds: cadData.bounds,
        roadPaths,
        nodes,
        segments,
      })

      if (res.success) {
        setServerSaveMsg({ success: true, text: res.message || '원본 DB가 파일에 성공적으로 저장되었습니다.' })
        if (typeof window !== 'undefined') {
          localStorage.setItem(STORAGE_KEY_SEGMENTS, JSON.stringify(segments))
          localStorage.setItem(STORAGE_KEY_NODES, JSON.stringify(nodes))
          notifyStorageUpdate(segments, nodes)
        }
      } else {
        setServerSaveMsg({ success: false, text: res.error || '저장 실패' })
      }
    } catch (e: any) {
      setServerSaveMsg({ success: false, text: e?.message || '저장 중 통신 오류' })
    } finally {
      setIsSavingServer(false)
      setTimeout(() => setServerSaveMsg(null), 5000)
    }
  }

  // 최신 2공구 서버 원본 DB로 전체 초기화 및 새로고침
  const handleResetToMaster = () => {
    if (!confirm('브라우저에 저장된 임시 실적을 초기화하고 최신 2공구 원본 DB(맨홀 188개)로 깨끗하게 동기화하시겠습니까?')) return
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_SEGMENTS)
      localStorage.removeItem(STORAGE_KEY_NODES)
      localStorage.removeItem('field_pipeline_segments_v5')
      localStorage.removeItem('field_pipeline_nodes_v5')
      localStorage.removeItem('field_pipeline_segments_v4')
      localStorage.removeItem('field_pipeline_nodes_v4')
      localStorage.removeItem('field_pipeline_segments_v3')
      localStorage.removeItem('field_pipeline_nodes_v3')
    }
    window.location.reload()
  }

  // 백업 복원
  const handleRestoreBackup = async () => {
    if (!confirm('백업 시점의 원본 DB 파일로 복원하시겠습니까? 현재 변경사항은 덮어씌워집니다.')) return
    setIsSavingServer(true)
    try {
      const res = await restorePipelineMasterDbFromBackup()
      if (res.success) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem(STORAGE_KEY_SEGMENTS)
          localStorage.removeItem(STORAGE_KEY_NODES)
          localStorage.removeItem('field_pipeline_segments_v4')
          localStorage.removeItem('field_pipeline_nodes_v4')
          localStorage.removeItem('field_pipeline_segments_v3')
          localStorage.removeItem('field_pipeline_nodes_v3')
        }
        alert('백업본으로 복원되었습니다. 페이지를 새로고침합니다.')
        window.location.reload()
      } else {
        alert(res.error || '복원 실패')
      }
    } finally {
      setIsSavingServer(false)
    }
  }

  // JSON 내보내기
  const handleExportJson = () => {
    const exportData = {
      viewBox: cadData.viewBox,
      bounds: cadData.bounds,
      nodes,
      segments,
      roadPaths,
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `actual_pipeline_cad_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // 토스트 알림 헬퍼
  const showToast = (msg: string) => {
    setSaveToast(msg)
    setTimeout(() => setSaveToast(null), 3000)
  }

  // 줌 & 팬 핸들러
  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(Math.max(0.6, prev + delta), 4.5))
  }

  const handleReset = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setSelectedSegment(null)
    setSelectedNode(null)
    setTargetReticle(null)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.88
    setZoom(prev => Math.min(Math.max(0.6, prev * zoomFactor), 4.5))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handlePlayToggle = () => {
    if (isPlaying) {
      setIsPlaying(false)
    } else {
      setSimProgress(0)
      setIsPlaying(true)
    }
  }

  // 트림 패스 시뮬레이션 루프
  useEffect(() => {
    if (!isPlaying) {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      return
    }
    let start: number | null = null
    const duration = 12000
    const step = (timestamp: number) => {
      if (!start) start = timestamp
      const elapsed = timestamp - start
      const progress = Math.min((elapsed / duration) * 100, 100)
      setSimProgress(progress)
      if (progress < 100) {
        animRef.current = requestAnimationFrame(step)
      } else {
        setIsPlaying(false)
      }
    }
    animRef.current = requestAnimationFrame(step)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [isPlaying])

  return (
    <div className={`p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md border border-[rgba(29,31,32,0.08)] ${className}`}>
      {/* ── 1. 최상단: 헤더 및 주 화면 모드 전환 바 ───────────────────────── */}
      <div className="flex flex-col gap-3 pb-3 border-b border-[rgba(29,31,32,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="w-2 h-6 bg-[#2b6cb0] rounded-full"></span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
                  현장 관로 시공 관리 (DB 및 도면)
                </h2>
                <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1 font-mono">
                  <span className="material-symbols-outlined text-[13px]">verified</span>
                  오수 2공구 실측 DB 연동 (맨홀 {nodes.length}개 / 관로 {segments.length}개)
                </span>
              </div>
              <p className="text-[12px] text-on-surface-variant mt-0.5">
                표에서 클릭 한 번으로 시공 상태(완료/진행/계획)를 즉시 변경하고, 기종점 및 관로 속성을 바로 편집할 수 있습니다.
              </p>
            </div>
          </div>

          {/* 우측 액션 버튼군: 서버 영구 반영, JSON 내보내기, 최신 DB 동기화, 백업 복원 */}
          <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
            <button
              type="button"
              disabled={isSavingServer}
              onClick={handleSaveMasterDbToServer}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-bold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
              title="현재 수정한 관로 및 맨홀 데이터를 서버 actual_pipeline_cad.json 원본 파일에 영구 반영"
            >
              <span className="material-symbols-outlined text-[16px]">save</span>
              <span>{isSavingServer ? '서버 저장 중...' : '서버 파일에 영구 저장'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetToMaster}
              className="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-sky-700 border border-sky-200"
              title="최신 2공구 원본 DB로 전체 초기화 및 새로고침"
            >
              <span className="material-symbols-outlined text-[18px]">refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExportJson}
              className="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface-variant border border-gray-200"
              title="JSON 파일 다운로드"
            >
              <span className="material-symbols-outlined text-[18px]">download</span>
            </button>

            <button
              type="button"
              onClick={handleRestoreBackup}
              className="p-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-amber-700 border border-amber-200"
              title="초기 백업본으로 복원"
            >
              <span className="material-symbols-outlined text-[18px]">history</span>
            </button>
          </div>
        </div>

        {/* ── 주 화면 표시 모드 선택 탭 (3단 큼직한 버튼) ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
          <div className="inline-flex rounded-xl bg-surface-container p-1 border border-[rgba(29,31,32,0.12)]">
            <button
              type="button"
              onClick={() => setDisplayMode('table')}
              className={`px-4 py-2 rounded-lg text-[13px] font-bold flex items-center gap-2 transition-all ${
                displayMode === 'table'
                  ? 'bg-[#2b6cb0] text-white shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">table_rows</span>
              <span>📋 관로·맨홀 DB 직접 편집 표</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 font-mono">
                {segments.length}건
              </span>
            </button>

            <button
              type="button"
              onClick={() => setDisplayMode('cad')}
              className={`px-4 py-2 rounded-lg text-[13px] font-bold flex items-center gap-2 transition-all ${
                displayMode === 'cad'
                  ? 'bg-slate-800 text-white shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">map</span>
              <span>🗺️ CAD 도면 뷰</span>
            </button>

            <button
              type="button"
              onClick={() => setDisplayMode('split')}
              className={`px-4 py-2 rounded-lg text-[13px] font-bold flex items-center gap-2 transition-all ${
                displayMode === 'split'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">vertical_split</span>
              <span>🌓 도면 + DB 분할 뷰</span>
            </button>
          </div>

          {/* 간이 진척도 배지 */}
          <div className="flex items-center gap-2 text-[12px] font-mono font-bold bg-surface-container-low px-3 py-1.5 rounded-lg border border-[rgba(29,31,32,0.06)] self-start sm:self-auto">
            <span className="text-gray-500 font-sans">실적 공정률:</span>
            <span className="text-emerald-600">{stats.completedRate}%</span>
            <span className="text-gray-400">|</span>
            <span className="text-emerald-600">완료 {stats.completedSegmentsCount}</span>
            <span className="text-sky-600">진행 {stats.inProgressSegmentsCount}</span>
            <span className="text-gray-600">계획 {stats.plannedSegmentsCount}</span>
          </div>
        </div>
      </div>

      {/* 알림 토스트 */}
      {saveToast && (
        <div className="p-2.5 rounded-lg bg-emerald-600 text-white text-[12px] font-bold flex items-center gap-2 shadow-md animate-fadeIn">
          <span className="material-symbols-outlined text-[18px]">check_circle</span>
          <span>{saveToast}</span>
        </div>
      )}

      {/* 서버 저장 결과 알림 */}
      {serverSaveMsg && (
        <div
          className={`p-2.5 rounded-lg text-[12px] font-bold flex items-center gap-2 animate-fadeIn ${
            serverSaveMsg.success
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
              : 'bg-red-50 text-red-800 border border-red-300'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {serverSaveMsg.success ? 'cloud_done' : 'error'}
          </span>
          <span>{serverSaveMsg.text}</span>
        </div>
      )}

      {/* ── 2. CAD 도면 캔버스 (cad 모드 또는 split 모드일 때만 렌더링) ─────── */}
      {(displayMode === 'cad' || displayMode === 'split') && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-[12px]">
            <span className="font-bold text-on-surface flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#2b6cb0]">draw</span>
              <span>현장 관로 시공 CAD 도면</span>
              {selectedSegment && (
                <span className="text-sky-600 font-mono">
                  [선택: {selectedSegment.id} {selectedSegment.name}]
                </span>
              )}
            </span>

            {/* 줌 및 시뮬레이션 컨트롤 */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center bg-surface-container-low rounded border border-[rgba(29,31,32,0.1)] p-0.5">
                <button
                  type="button"
                  onClick={() => handleZoom(0.3)}
                  className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
                  title="확대"
                >
                  <span className="material-symbols-outlined text-[16px]">zoom_in</span>
                </button>
                <span className="text-[11px] font-mono px-1 font-semibold text-on-surface">
                  {Math.round(zoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => handleZoom(-0.3)}
                  className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant"
                  title="축소"
                >
                  <span className="material-symbols-outlined text-[16px]">zoom_out</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handlePlayToggle}
                className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 shadow-xs ${
                  isPlaying ? 'bg-amber-500 text-white' : 'bg-[#2b6cb0] text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[15px]">
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
                <span>{isPlaying ? '일시정지' : '시공 흐름'}</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="p-1 rounded hover:bg-surface-container-high text-on-surface-variant border border-gray-200"
                title="뷰 리셋"
              >
                <span className="material-symbols-outlined text-[16px]">fit_screen</span>
              </button>
            </div>
          </div>

          <div
            className={`relative w-full rounded-xl overflow-hidden bg-[#111827] border border-gray-700 shadow-inner select-none cursor-grab active:cursor-grabbing ${
              displayMode === 'cad' ? 'h-[500px]' : 'h-[330px]'
            }`}
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={(e) => {
              handleMouseMove(e)
              const rect = e.currentTarget.getBoundingClientRect()
              setMousePos({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
              })
            }}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {/* 그리드 배경 */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage: `
                  linear-gradient(to right, #6b7280 1px, transparent 1px),
                  linear-gradient(to bottom, #6b7280 1px, transparent 1px)
                `,
                backgroundSize: '30px 30px',
              }}
            />

            {/* 좌상단 안내 */}
            <div className="absolute top-2 left-3 flex items-center gap-2 pointer-events-none z-10 text-[10px] text-gray-400 font-mono">
              <span className="px-1.5 py-0.5 rounded bg-black/60 border border-gray-700 text-white font-bold">
                DWG: Osu_plan_2 (오수 2공구 실측 좌표)
              </span>
              <span className="text-sky-300 font-semibold">[마우스 휠 확대 / 배관·맨홀 클릭 선택]</span>
            </div>

            {/* 범례 */}
            <div className="absolute top-2 right-3 flex items-center gap-3 bg-black/75 backdrop-blur-xs px-2.5 py-1 rounded-md border border-gray-700 text-[10px] text-gray-300 pointer-events-none z-10">
              <div className="flex items-center gap-1">
                <span className="w-3 h-1 bg-emerald-400 rounded-full inline-block"></span>
                <span>완료 ({stats.completedSegmentsCount})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-1 bg-sky-400 rounded-full inline-block animate-pulse"></span>
                <span>진행 ({stats.inProgressSegmentsCount})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-3 h-1 border-b border-dashed border-gray-400 inline-block"></span>
                <span>계획 ({stats.plannedSegmentsCount})</span>
              </div>
            </div>

            {/* SVG 캔버스 */}
            <svg viewBox="0 0 920 520" className="w-full h-full">
              <defs>
                <filter id="pipeGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2.5" result="glow" />
                  <feComposite in="SourceGraphic" in2="glow" operator="over" />
                </filter>
                <filter id="targetGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="glow" />
                  <feComposite in="SourceGraphic" in2="glow" operator="over" />
                </filter>
              </defs>

              <g
                transform={`translate(460, 260) translate(${pan.x}, ${pan.y}) scale(${zoom}) translate(-460, -260)`}
                style={{ transition: isDragging ? 'none' : 'transform 0.2s ease-out' }}
              >
                {/* 도로망 */}
                <g opacity="0.25" stroke="#6b7280" strokeWidth="1" fill="none">
                  {roadPaths.map((rd, idx) => (
                    <path key={`road-${idx}`} d={rd} />
                  ))}
                </g>

                {/* 관로 세그먼트 */}
                <g>
                  {segments.map((seg, idx) => {
                    const isSelected = selectedSegment?.id === seg.id
                    const isHovered = hoveredSegment?.id === seg.id

                    let strokeColor = '#475569'
                    let strokeWidth = seg.diameter >= 400 ? 3.5 : 2.5
                    let dashArray = 'none'
                    let strokeOpacity = 0.85

                    if (seg.status === 'completed') {
                      strokeColor = '#10b981'
                    } else if (seg.status === 'in_progress') {
                      strokeColor = '#38bdf8'
                      strokeOpacity = 1
                    } else {
                      strokeColor = '#64748b'
                      dashArray = '4 3'
                      strokeOpacity = 0.45
                    }

                    return (
                      <g key={`seg-${seg.id}-${idx}`}>
                        <path
                          d={seg.pathD}
                          fill="none"
                          stroke="transparent"
                          strokeWidth="14"
                          className="cursor-pointer"
                          onMouseEnter={() => setHoveredSegment(seg)}
                          onMouseLeave={() => setHoveredSegment(null)}
                          onClick={(e) => {
                            e.stopPropagation()
                            focusOnSegment(seg)
                          }}
                        />

                        <path
                          d={seg.pathD}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={isSelected ? strokeWidth + 2.5 : isHovered ? strokeWidth + 1.5 : strokeWidth}
                          strokeDasharray={dashArray}
                          strokeLinecap="round"
                          strokeOpacity={strokeOpacity}
                          className="transition-all duration-200 pointer-events-none"
                          filter={isSelected || isHovered ? 'url(#pipeGlow)' : undefined}
                        />

                        {isSelected && (
                          <path
                            d={seg.pathD}
                            fill="none"
                            stroke="#f59e0b"
                            strokeWidth="1.5"
                            strokeDasharray="4 4"
                            className="animate-pulse pointer-events-none"
                          />
                        )}
                      </g>
                    )
                  })}
                </g>

                {/* 맨홀 노드 */}
                <g>
                  {nodes.map((node, idx) => {
                    let nodeColor = '#64748b'
                    let ringColor = '#334155'
                    let radius = 2.8

                    if (node.status === 'completed') {
                      nodeColor = '#10b981'
                      ringColor = '#065f46'
                    } else if (node.status === 'in_progress') {
                      nodeColor = '#38bdf8'
                      ringColor = '#0284c7'
                      radius = 3.5
                    }

                    if (node.isDropManhole) {
                      ringColor = '#f59e0b'
                    }

                    const showLabel = zoom >= 1.5 || node.status === 'in_progress'

                    return (
                      <g
                        key={`node-${node.id}-${idx}`}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredNode(node)}
                        onMouseLeave={() => setHoveredNode(null)}
                        onClick={(e) => {
                          e.stopPropagation()
                          focusOnNode(node)
                        }}
                      >
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius + (node.isDropManhole ? 2.2 : 1.5)}
                          fill="#111827"
                          stroke={ringColor}
                          strokeWidth={node.isDropManhole ? "2" : "1.2"}
                        />
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={radius}
                          fill={nodeColor}
                        />
                        {showLabel && (
                          <text
                            x={node.x}
                            y={node.y - 6}
                            textAnchor="middle"
                            fill={node.isDropManhole ? "#fde68a" : "#e2e8f0"}
                            fontSize="7"
                            fontWeight="bold"
                            fontFamily="monospace"
                            className="pointer-events-none select-none drop-shadow"
                          >
                            {node.id}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </g>

                {/* 타겟 포커스 레티클 */}
                {targetReticle && (
                  <g className="pointer-events-none" filter="url(#targetGlow)">
                    <circle
                      cx={targetReticle.x}
                      cy={targetReticle.y}
                      r="16"
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="1.5"
                      strokeDasharray="4 3"
                      className="animate-spin"
                      style={{ transformOrigin: `${targetReticle.x}px ${targetReticle.y}px`, animationDuration: '6s' }}
                    />
                    <circle
                      cx={targetReticle.x}
                      cy={targetReticle.y}
                      r="5"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                    />
                  </g>
                )}
              </g>
            </svg>

            {/* 호버 툴팁 */}
            {hoveredSegment && (
              <div
                className="absolute z-20 pointer-events-none bg-black/90 text-white p-2 rounded shadow-lg border border-gray-600 text-[11px] flex flex-col gap-0.5"
                style={{
                  left: Math.min(mousePos.x + 12, 680),
                  top: Math.max(mousePos.y - 60, 10),
                }}
              >
                <div className="font-bold flex items-center gap-1.5 text-sky-400">
                  <span>{hoveredSegment.id}</span>
                  <span className="text-gray-300 font-normal">({hoveredSegment.name})</span>
                </div>
                <div className="text-gray-300">
                  {hoveredSegment.pipeType} · 연장 {hoveredSegment.length}m · 심도 {hoveredSegment.depth}m
                </div>
                <div className="text-[10px] text-gray-400">
                  기점: {hoveredSegment.fromNode} ➔ 종점: {hoveredSegment.toNode}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 3. 관로 / 맨홀 DB 직접 편집 테이블 (displayMode === 'table' 또는 'split') ── */}
      {(displayMode === 'table' || displayMode === 'split') && (
        <div className="flex flex-col gap-3">
          {/* 테이블 컨트롤 상단 바: 서브탭, 검색창, 필터 칩, 일괄 액션 */}
          <div className="p-3 rounded-xl bg-surface-container-low border border-[rgba(29,31,32,0.08)] flex flex-col gap-2.5">
            {/* 1행: DB 탭 전환 & 검색창 */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5">
              {/* 서브 탭: 관로 구간 DB vs 맨홀 측량 DB */}
              <div className="flex items-center gap-1 bg-surface-container p-1 rounded-lg text-[12px] font-bold">
                <button
                  type="button"
                  onClick={() => { setDbTab('segments'); setTablePage(1) }}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                    dbTab === 'segments'
                      ? 'bg-white text-[#2b6cb0] shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">linear_scale</span>
                  <span>관로 구간 DB</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-100 text-sky-800 font-mono">
                    {segments.length}개
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => { setDbTab('nodes'); setTablePage(1) }}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all ${
                    dbTab === 'nodes'
                      ? 'bg-white text-amber-700 shadow-xs'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">location_on</span>
                  <span>맨홀·관저고 DB</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-100 text-amber-800 font-mono">
                    {nodes.length}개
                  </span>
                </button>
              </div>

              {/* 검색창 */}
              <div className="relative flex-1 max-w-md">
                <span className="material-symbols-outlined absolute left-2.5 top-2 text-gray-400 text-[18px] pointer-events-none">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setTablePage(1)
                  }}
                  placeholder={
                    dbTab === 'segments'
                      ? "구간ID(SEC-001), 맨홀(M2-212), 관종, 작업팀, 메모 검색..."
                      : "맨홀명(M2-212), 관저고, 심도, 분기 검색..."
                  }
                  className="w-full pl-9 pr-8 py-1.5 rounded-lg bg-surface-container-lowest border border-[rgba(29,31,32,0.15)] text-[12px] text-on-surface focus:outline-none focus:border-[#2b6cb0] focus:ring-1 focus:ring-[#2b6cb0]"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600"
                  >
                    <span className="material-symbols-outlined text-[16px]">close</span>
                  </button>
                )}
              </div>

              {/* 페이지당 표시 개수 */}
              <div className="flex items-center gap-1 text-[11px] text-on-surface-variant shrink-0">
                <span>표시:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setTablePage(1)
                  }}
                  className="px-2 py-1 rounded bg-white border border-gray-300 text-[11px] font-mono focus:outline-none"
                >
                  <option value={10}>10개씩</option>
                  <option value={15}>15개씩</option>
                  <option value={30}>30개씩</option>
                  <option value={50}>50개씩</option>
                  <option value={500}>전체보기</option>
                </select>
              </div>
            </div>

            {/* 2행: 상태 필터 칩 & 다중 선택 일괄 액션 */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-[rgba(29,31,32,0.06)]">
              {/* 필터 칩 */}
              <div className="flex items-center gap-1 flex-wrap text-[11px]">
                <button
                  type="button"
                  onClick={() => { setStatusFilter('all'); setTablePage(1) }}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all ${
                    statusFilter === 'all'
                      ? 'bg-[#2b6cb0] text-white'
                      : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  전체 ({dbTab === 'segments' ? segments.length : nodes.length})
                </button>

                <button
                  type="button"
                  onClick={() => { setStatusFilter('completed'); setTablePage(1) }}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${
                    statusFilter === 'completed'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  완료 ({dbTab === 'segments' ? stats.completedSegmentsCount : nodes.filter(n => n.status === 'completed').length})
                </button>

                <button
                  type="button"
                  onClick={() => { setStatusFilter('in_progress'); setTablePage(1) }}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${
                    statusFilter === 'in_progress'
                      ? 'bg-sky-600 text-white'
                      : 'bg-white text-sky-700 border border-sky-200 hover:bg-sky-50'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-500"></span>
                  진행 ({dbTab === 'segments' ? stats.inProgressSegmentsCount : nodes.filter(n => n.status === 'in_progress').length})
                </button>

                <button
                  type="button"
                  onClick={() => { setStatusFilter('planned'); setTablePage(1) }}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${
                    statusFilter === 'planned'
                      ? 'bg-gray-700 text-white'
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <span className="w-2 h-2 rounded-sm border border-gray-400"></span>
                  미착공/계획 ({dbTab === 'segments' ? stats.plannedSegmentsCount : nodes.filter(n => n.status === 'planned').length})
                </button>

                {dbTab === 'segments' && anomalyStats.totalErrors > 0 && (
                  <button
                    type="button"
                    onClick={() => { setStatusFilter('error'); setTablePage(1) }}
                    className={`px-2.5 py-1 rounded-md font-bold transition-all flex items-center gap-1 ${
                      statusFilter === 'error'
                        ? 'bg-red-600 text-white'
                        : 'bg-white text-red-700 border border-red-300 hover:bg-red-50'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[13px]">warning</span>
                    <span>오류의심 ({anomalyStats.totalErrors})</span>
                  </button>
                )}
              </div>

              {/* 선택된 항목 일괄 변경 버튼 (관로 탭일 때) */}
              {dbTab === 'segments' && selectedSegIds.size > 0 && (
                <div className="flex items-center gap-1.5 bg-sky-50 p-1 rounded-lg border border-sky-200 text-[11px]">
                  <span className="font-bold text-sky-900 font-mono px-1">
                    {selectedSegIds.size}개 선택됨:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleBatchStatusChange('completed')}
                    className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
                  >
                    일괄 시공완료
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchStatusChange('in_progress')}
                    className="px-2 py-0.5 rounded bg-sky-600 hover:bg-sky-700 text-white font-bold"
                  >
                    일괄 금일진행
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchStatusChange('planned')}
                    className="px-2 py-0.5 rounded bg-gray-600 hover:bg-gray-700 text-white font-bold"
                  >
                    일괄 계획(미착공)
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── 테이블: [관로 구간 DB] ── */}
          {dbTab === 'segments' && (
            <div className="w-full overflow-x-auto rounded-xl border border-[rgba(29,31,32,0.12)] bg-surface-container-lowest shadow-xs">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-surface-container-low text-on-surface-variant font-bold border-b border-[rgba(29,31,32,0.1)]">
                  <tr>
                    <th className="py-2.5 px-3 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={paginatedSegments.length > 0 && selectedSegIds.size === paginatedSegments.length}
                        onChange={handleToggleSelectAll}
                        className="rounded cursor-pointer"
                        title="현재 페이지 전체 선택"
                      />
                    </th>
                    <th className="py-2.5 px-3">구간 ID</th>
                    <th className="py-2.5 px-3">시공 구간 (기점 ➔ 종점)</th>
                    <th className="py-2.5 px-3">관종 및 규격</th>
                    <th className="py-2.5 px-3">설계연장 / 심도</th>
                    <th className="py-2.5 px-3">관저고 (EL.)</th>
                    <th className="py-2.5 px-3 text-center w-52">
                      시공 상태 (1클릭 직접 변경)
                    </th>
                    <th className="py-2.5 px-3">작업팀 / 메모</th>
                    <th className="py-2.5 px-3 text-center w-28">도면 / 액션</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[rgba(29,31,32,0.06)]">
                  {paginatedSegments.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-gray-400">
                        조건에 일치하는 관로 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    paginatedSegments.map((seg) => {
                      const isInlineEditing = inlineEditingSegId === seg.id
                      const isChecked = selectedSegIds.has(seg.id)
                      const isAnomaly = seg.fromNode === seg.toNode || seg.fromNode.startsWith('N') || seg.toNode.startsWith('N')

                      if (isInlineEditing) {
                        return (
                          <tr key={`inline-edit-${seg.id}`} className="bg-sky-50/70">
                            <td className="py-2 px-3 text-center">
                              <span className="material-symbols-outlined text-sky-600 text-[18px]">edit</span>
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-sky-900">
                              {seg.id}
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={inlineSegData.fromNode || ''}
                                  onChange={(e) => setInlineSegData({ ...inlineSegData, fromNode: e.target.value })}
                                  placeholder="기점 맨홀"
                                  className="w-24 px-2 py-1 rounded bg-white border border-gray-300 font-mono font-bold text-[11px]"
                                />
                                <span className="text-gray-400">➔</span>
                                <input
                                  type="text"
                                  value={inlineSegData.toNode || ''}
                                  onChange={(e) => setInlineSegData({ ...inlineSegData, toNode: e.target.value })}
                                  placeholder="종점 맨홀"
                                  className="w-24 px-2 py-1 rounded bg-white border border-gray-300 font-mono font-bold text-[11px]"
                                />
                              </div>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={inlineSegData.pipeType || ''}
                                onChange={(e) => setInlineSegData({ ...inlineSegData, pipeType: e.target.value })}
                                placeholder="관종 규격"
                                className="w-full px-2 py-1 rounded bg-white border border-gray-300 text-[11px]"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={inlineSegData.length || ''}
                                  onChange={(e) => setInlineSegData({ ...inlineSegData, length: Number(e.target.value) })}
                                  placeholder="연장(m)"
                                  className="w-16 px-1.5 py-1 rounded bg-white border border-gray-300 font-mono text-[11px]"
                                />
                                <span>m /</span>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={inlineSegData.depth || ''}
                                  onChange={(e) => setInlineSegData({ ...inlineSegData, depth: Number(e.target.value) })}
                                  placeholder="심도(m)"
                                  className="w-16 px-1.5 py-1 rounded bg-white border border-gray-300 font-mono text-[11px]"
                                />
                                <span>m</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-[11px] text-gray-500 font-mono">
                              {seg.invertFrom !== undefined && seg.invertFrom !== null ? `EL. ${seg.invertFrom}m ➔ ${seg.invertTo}m` : '-'}
                            </td>
                            <td className="py-2 px-3 text-center">
                              <select
                                value={inlineSegData.status || seg.status}
                                onChange={(e) => setInlineSegData({ ...inlineSegData, status: e.target.value as any })}
                                className="px-2 py-1 rounded bg-white border border-gray-300 text-[11px] font-bold"
                              >
                                <option value="completed">시공완료</option>
                                <option value="in_progress">금일진행</option>
                                <option value="planned">시공계획</option>
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  value={inlineSegData.crew || ''}
                                  onChange={(e) => setInlineSegData({ ...inlineSegData, crew: e.target.value })}
                                  placeholder="작업팀"
                                  className="w-full px-2 py-0.5 rounded bg-white border border-gray-300 text-[11px]"
                                />
                                <input
                                  type="text"
                                  value={inlineSegData.note || ''}
                                  onChange={(e) => setInlineSegData({ ...inlineSegData, note: e.target.value })}
                                  placeholder="작업 메모"
                                  className="w-full px-2 py-0.5 rounded bg-white border border-gray-300 text-[11px]"
                                />
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={handleSaveInlineEdit}
                                  className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center gap-0.5"
                                  title="저장"
                                >
                                  <span className="material-symbols-outlined text-[13px]">check</span>
                                  <span>저장</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelInlineEdit}
                                  className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300 text-gray-700 text-[11px]"
                                  title="취소"
                                >
                                  취소
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr
                          key={`seg-row-${seg.id}`}
                          className={`hover:bg-sky-50/40 transition-colors ${
                            selectedSegment?.id === seg.id ? 'bg-sky-100/60' : isAnomaly ? 'bg-red-50/30' : ''
                          }`}
                        >
                          {/* 체크박스 */}
                          <td className="py-2 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelectSegment(seg.id)}
                              className="rounded cursor-pointer"
                            />
                          </td>

                          {/* 구간 ID */}
                          <td className="py-2 px-3 font-mono font-bold text-gray-900">
                            {seg.id}
                          </td>

                          {/* 기점 ➔ 종점 */}
                          <td className="py-2 px-3 font-semibold text-on-surface">
                            <span className="font-mono text-gray-800 bg-gray-100 px-1 py-0.5 rounded">
                              {seg.fromNode}
                            </span>
                            <span className="mx-1 text-gray-400 font-normal">➔</span>
                            <span className="font-mono text-gray-800 bg-gray-100 px-1 py-0.5 rounded">
                              {seg.toNode}
                            </span>
                            {isAnomaly && (
                              <span className="ml-1.5 px-1 py-0.2 rounded text-[10px] bg-red-600 text-white font-bold">
                                {seg.fromNode === seg.toNode ? '기종점동일' : '미식별노드'}
                              </span>
                            )}
                          </td>

                          {/* 관종 및 규격 */}
                          <td className="py-2 px-3 text-gray-800">
                            {seg.pipeType}
                          </td>

                          {/* 연장 / 심도 */}
                          <td className="py-2 px-3 font-mono text-gray-700">
                            <span className="font-bold text-gray-900">{seg.length}m</span>
                            <span className="text-gray-400"> / </span>
                            <span>{seg.depth}m</span>
                          </td>

                          {/* 관저고 */}
                          <td className="py-2 px-3 font-mono text-[11px] text-gray-600">
                            {seg.invertFrom !== undefined && seg.invertFrom !== null ? (
                              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded">
                                EL.{seg.invertFrom} ➔ {seg.invertTo}m
                              </span>
                            ) : (
                              <span className="text-gray-400">-</span>
                            )}
                          </td>

                          {/* ── 원클릭 상태 전환 버튼 그룹 ── */}
                          <td className="py-2 px-3 text-center">
                            <div className="inline-flex rounded-lg border border-[rgba(29,31,32,0.15)] p-0.5 bg-surface-container-low shadow-2xs">
                              {/* 시공완료 버튼 */}
                              <button
                                type="button"
                                onClick={() => handleUpdateSegmentStatus(seg.id, 'completed')}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                                  seg.status === 'completed'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-gray-600 hover:text-emerald-700 hover:bg-emerald-50'
                                }`}
                                title="클릭 시 즉시 '시공완료' 상태로 저장"
                              >
                                <span className="material-symbols-outlined text-[13px]">check_circle</span>
                                <span>완료</span>
                              </button>

                              {/* 금일진행 버튼 */}
                              <button
                                type="button"
                                onClick={() => handleUpdateSegmentStatus(seg.id, 'in_progress')}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                                  seg.status === 'in_progress'
                                    ? 'bg-sky-600 text-white shadow-xs'
                                    : 'text-gray-600 hover:text-sky-700 hover:bg-sky-50'
                                }`}
                                title="클릭 시 즉시 '금일진행' 상태로 저장"
                              >
                                <span className="material-symbols-outlined text-[13px]">construction</span>
                                <span>진행</span>
                              </button>

                              {/* 시공계획 버튼 */}
                              <button
                                type="button"
                                onClick={() => handleUpdateSegmentStatus(seg.id, 'planned')}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 transition-all ${
                                  seg.status === 'planned'
                                    ? 'bg-gray-700 text-white shadow-xs'
                                    : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100'
                                }`}
                                title="클릭 시 '시공계획(미착공)' 상태로 저장"
                              >
                                <span>계획</span>
                              </button>
                            </div>
                          </td>

                          {/* 작업팀 / 메모 */}
                          <td className="py-2 px-3 text-gray-700 max-w-xs truncate">
                            {seg.crew && (
                              <span className="font-semibold text-sky-800 mr-1 bg-sky-50 px-1 rounded border border-sky-200">
                                {seg.crew}
                              </span>
                            )}
                            <span className="text-gray-600">{seg.note || '-'}</span>
                          </td>

                          {/* 액션 버튼군 */}
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* 인라인 수정 */}
                              <button
                                type="button"
                                onClick={() => handleStartInlineEdit(seg)}
                                className="px-1.5 py-1 rounded bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-[11px] font-bold flex items-center gap-0.5"
                                title="이 행의 속성(기종점, 규격, 연장, 메모 등) 직접 수정"
                              >
                                <span className="material-symbols-outlined text-[13px]">edit</span>
                                <span>수정</span>
                              </button>

                              {/* 도면 보기 */}
                              <button
                                type="button"
                                onClick={() => handleViewSegmentOnCad(seg)}
                                className="px-1.5 py-1 rounded bg-[#2b6cb0] hover:bg-[#20528a] text-white text-[11px] font-bold flex items-center gap-0.5 shadow-2xs"
                                title="CAD 도면에서 이 구간 위치 확인"
                              >
                                <span className="material-symbols-outlined text-[13px]">my_location</span>
                                <span>도면</span>
                              </button>

                              {/* 삭제 */}
                              <button
                                type="button"
                                onClick={() => handleDeleteSegment(seg.id)}
                                className="p-1 rounded text-red-600 hover:bg-red-50"
                                title="구간 삭제"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 테이블: [맨홀·관저고 DB] ── */}
          {dbTab === 'nodes' && (
            <div className="w-full overflow-x-auto rounded-xl border border-[rgba(29,31,32,0.12)] bg-surface-container-lowest shadow-xs">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-surface-container-low text-on-surface-variant font-bold border-b border-[rgba(29,31,32,0.1)]">
                  <tr>
                    <th className="py-2.5 px-3">맨홀 ID / 명칭</th>
                    <th className="py-2.5 px-3 text-center w-48">상태 (1클릭 변경)</th>
                    <th className="py-2.5 px-3">관저고 (Invert Level)</th>
                    <th className="py-2.5 px-3">심도 / 텍스트</th>
                    <th className="py-2.5 px-3">정밀 측량 좌표 (X, Y)</th>
                    <th className="py-2.5 px-3">연결 관로 수</th>
                    <th className="py-2.5 px-3 text-center w-28">도면 / 액션</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-[rgba(29,31,32,0.06)]">
                  {paginatedNodes.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-gray-400">
                        조건에 일치하는 맨홀 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    paginatedNodes.map((node) => {
                      const isInlineEditing = inlineEditingNodeId === node.id
                      const connectedSegs = segments.filter(s => s.fromNode === node.id || s.toNode === node.id)

                      if (isInlineEditing) {
                        return (
                          <tr key={`inline-node-edit-${node.id}`} className="bg-amber-50/70">
                            <td className="py-2 px-3">
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  value={inlineNodeData.id || ''}
                                  onChange={(e) => setInlineNodeData({ ...inlineNodeData, id: e.target.value })}
                                  placeholder="맨홀 ID"
                                  className="w-24 px-2 py-1 rounded bg-white border border-gray-300 font-mono font-bold text-[11px]"
                                />
                                <input
                                  type="text"
                                  value={inlineNodeData.name || ''}
                                  onChange={(e) => setInlineNodeData({ ...inlineNodeData, name: e.target.value })}
                                  placeholder="표시 명칭"
                                  className="w-28 px-2 py-1 rounded bg-white border border-gray-300 text-[11px]"
                                />
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <select
                                value={inlineNodeData.status || node.status}
                                onChange={(e) => setInlineNodeData({ ...inlineNodeData, status: e.target.value as any })}
                                className="px-2 py-1 rounded bg-white border border-gray-300 text-[11px] font-bold"
                              >
                                <option value="completed">시공완료</option>
                                <option value="in_progress">금일진행</option>
                                <option value="planned">시공계획</option>
                              </select>
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="number"
                                step="0.01"
                                value={inlineNodeData.invertLevel ?? node.invertLevel ?? ''}
                                onChange={(e) => setInlineNodeData({ ...inlineNodeData, invertLevel: Number(e.target.value) })}
                                placeholder="관저고 (EL. m)"
                                className="w-24 px-2 py-1 rounded bg-white border border-gray-300 font-mono text-[11px]"
                              />
                            </td>
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={inlineNodeData.depth || ''}
                                onChange={(e) => setInlineNodeData({ ...inlineNodeData, depth: e.target.value })}
                                placeholder="심도 설명"
                                className="w-full px-2 py-1 rounded bg-white border border-gray-300 text-[11px]"
                              />
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px] text-gray-500">
                              ({node.rawX.toFixed(2)}, {node.rawY.toFixed(2)})
                            </td>
                            <td className="py-2 px-3 font-mono text-gray-600">
                              {connectedSegs.length}개
                            </td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={handleSaveInlineNodeEdit}
                                  className="px-2 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px]"
                                >
                                  저장
                                </button>
                                <button
                                  type="button"
                                  onClick={handleCancelInlineNodeEdit}
                                  className="px-2 py-1 rounded bg-gray-200 text-gray-700 text-[11px]"
                                >
                                  취소
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      }

                      return (
                        <tr
                          key={`node-row-${node.id}`}
                          className={`hover:bg-amber-50/30 transition-colors ${
                            selectedNode?.id === node.id ? 'bg-amber-100/60' : ''
                          }`}
                        >
                          {/* 맨홀 ID / 명칭 */}
                          <td className="py-2 px-3 font-semibold text-gray-900">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-gray-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                {node.id}
                              </span>
                              <span className="text-gray-700">{node.name}</span>
                              {node.isDropManhole && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500 text-white font-bold">
                                  낙차맨홀
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 상태 1클릭 변경 */}
                          <td className="py-2 px-3 text-center">
                            <div className="inline-flex rounded-lg border border-[rgba(29,31,32,0.15)] p-0.5 bg-surface-container-low shadow-2xs">
                              <button
                                type="button"
                                onClick={() => handleUpdateNodeStatus(node.id, 'completed')}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                                  node.status === 'completed'
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'text-gray-600 hover:bg-emerald-50'
                                }`}
                              >
                                완료
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateNodeStatus(node.id, 'in_progress')}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                                  node.status === 'in_progress'
                                    ? 'bg-sky-600 text-white shadow-xs'
                                    : 'text-gray-600 hover:bg-sky-50'
                                }`}
                              >
                                진행
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateNodeStatus(node.id, 'planned')}
                                className={`px-2 py-1 rounded-md text-[11px] font-bold transition-all ${
                                  node.status === 'planned'
                                    ? 'bg-gray-700 text-white shadow-xs'
                                    : 'text-gray-500 hover:bg-gray-100'
                                }`}
                              >
                                계획
                              </button>
                            </div>
                          </td>

                          {/* 관저고 */}
                          <td className="py-2 px-3 font-mono font-bold text-gray-800">
                            {node.invertLevel !== null && node.invertLevel !== undefined ? (
                              <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                EL. {node.invertLevel}m
                              </span>
                            ) : (
                              <span className="text-gray-400 font-normal">정보없음</span>
                            )}
                            {node.isDropManhole && node.dropInvertLevel !== null && (
                              <span className="ml-1 text-[10px] text-amber-700 font-normal">
                                (유입 EL. {node.dropInvertLevel}m)
                              </span>
                            )}
                          </td>

                          {/* 심도 */}
                          <td className="py-2 px-3 text-gray-700">
                            {node.depth || '-'}
                          </td>

                          {/* 측량 좌표 */}
                          <td className="py-2 px-3 font-mono text-[11px] text-gray-600">
                            X: {node.rawX.toFixed(2)}, Y: {node.rawY.toFixed(2)}
                          </td>

                          {/* 연결 관로 */}
                          <td className="py-2 px-3 font-mono text-gray-700">
                            <span className="font-bold">{connectedSegs.length}개</span> 구간 연결
                          </td>

                          {/* 액션 */}
                          <td className="py-2 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleStartInlineNodeEdit(node)}
                                className="px-1.5 py-1 rounded bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-[11px] font-bold flex items-center gap-0.5"
                                title="맨홀 정보 수정"
                              >
                                <span className="material-symbols-outlined text-[13px]">edit</span>
                                <span>수정</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleViewNodeOnCad(node)}
                                className="px-1.5 py-1 rounded bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold flex items-center gap-0.5 shadow-2xs"
                                title="도면에서 맨홀 위치 확인"
                              >
                                <span className="material-symbols-outlined text-[13px]">my_location</span>
                                <span>도면</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteNode(node.id)}
                                className="p-1 rounded text-red-600 hover:bg-red-50"
                                title="맨홀 삭제"
                              >
                                <span className="material-symbols-outlined text-[14px]">delete</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── 하단 페이징 네비게이션 ── */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 text-[12px] text-gray-600 font-mono">
            <span>
              총 {currentTotalItems}개 항목 중 {(tablePage - 1) * pageSize + 1} - {Math.min(tablePage * pageSize, currentTotalItems)}개 표시
            </span>

            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={tablePage === 1}
                  onClick={() => setTablePage(1)}
                  className="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-30 hover:bg-gray-50"
                >
                  « 처음
                </button>
                <button
                  type="button"
                  disabled={tablePage === 1}
                  onClick={() => setTablePage(p => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-30 hover:bg-gray-50"
                >
                  ‹ 이전
                </button>
                <span className="px-3 py-1 font-bold text-gray-900 bg-surface-container rounded">
                  {tablePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={tablePage === totalPages}
                  onClick={() => setTablePage(p => Math.min(totalPages, p + 1))}
                  className="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-30 hover:bg-gray-50"
                >
                  다음 ›
                </button>
                <button
                  type="button"
                  disabled={tablePage === totalPages}
                  onClick={() => setTablePage(totalPages)}
                  className="px-2 py-1 rounded border border-gray-300 bg-white disabled:opacity-30 hover:bg-gray-50"
                >
                  끝 »
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── 4. 최하단 실적 요약 지표 & 프로그레스 바 ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-space-sm pt-space-xs border-t border-[rgba(29,31,32,0.06)]">
        <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>총 관로 시공 실적 ({segments.length}개 구간)</span>
            <span className="font-bold text-emerald-600 font-mono">{stats.completedRate}%</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-headline-sm font-bold text-on-surface font-mono">
              {stats.completedLength.toLocaleString()}
            </span>
            <span className="text-[11px] text-on-surface-variant font-mono">
              / {stats.totalLength.toLocaleString()} m
            </span>
          </div>
          <div className="w-full bg-gray-200 h-1.5 rounded-full overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${stats.completedRate}%` }}
              title={`완료: ${stats.completedLength}m`}
            ></div>
            <div
              className="bg-sky-400 h-full transition-all duration-500"
              style={{ width: `${(stats.inProgressLength / stats.totalLength) * 100}%` }}
              title={`진행: ${stats.inProgressLength}m`}
            ></div>
          </div>
        </div>

        <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>금일 배관/되메우기 진행</span>
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-ping"></span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-headline-sm font-bold text-sky-600 font-mono">
              {stats.inProgressLength.toLocaleString()}
            </span>
            <span className="text-[11px] text-on-surface-variant font-mono">
              m ({stats.inProgressSegmentsCount}개 구간)
            </span>
          </div>
          <span className="text-[10px] text-on-surface-variant/80">중앙 간선 및 지선 배관 시공</span>
        </div>

        <div className="p-2.5 rounded-lg bg-surface-container-low flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
            <span>잔여 시공 예정 연장 (미착공)</span>
            <span className="text-[10px] text-gray-500 font-mono">{stats.plannedSegmentsCount}개 구간</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-headline-sm font-bold text-on-surface font-mono">
              {stats.plannedLength.toLocaleString()}
            </span>
            <span className="text-[11px] text-on-surface-variant font-mono">m</span>
          </div>
          <span className="text-[10px] text-on-surface-variant/80">공정 계획에 따른 순차 배관</span>
        </div>
      </div>
    </div>
  )
}
