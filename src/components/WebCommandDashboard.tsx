'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { exportMonthlyReport } from '@/lib/exportExcel'
import PipelineCadViewer from './PipelineCadViewer'
import cadData from '@/data/actual_pipeline_cad.json'

type Props = {
  currentDate: string
  onDateChange: (date: string) => void
  site: any
  sites: any[]
  selectedSiteId: string
  onSelectSite: (siteId: string) => void
  logData: any
  siteTotalStats: any
  monthlyStats: any
  monthlyLoading: boolean
  monthName: string
  grandTotal: number
  isOverBudgetToday: boolean
  currentUser: any
  workerDocMap?: Record<string, string>
  onNavigateTab: (tab: string) => void
  onOpenUserModal: () => void
  onOpenSiteModal: () => void
  onOpenBackup: () => void
  onOpenChangePin: () => void
  onLogout: () => void
  onViewPhoto?: (url: string) => void
  workDescription?: string
  onWorkDescriptionChange?: (val: string) => void
  onSaveWorkDescription?: () => void
  onPhotoUpload?: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDeletePhoto?: (photoId: string) => void
  isUploading?: boolean
  onSwitchToClassic?: () => void
}

export default function WebCommandDashboard({
  currentDate,
  onDateChange,
  site,
  sites,
  selectedSiteId,
  onSelectSite,
  logData,
  siteTotalStats,
  monthlyStats,
  monthlyLoading,
  monthName,
  grandTotal,
  isOverBudgetToday,
  currentUser,
  workerDocMap = {},
  onNavigateTab,
  onOpenUserModal,
  onOpenSiteModal,
  onOpenBackup,
  onOpenChangePin,
  onLogout,
  onViewPhoto,
  workDescription = '',
  onWorkDescriptionChange,
  onSaveWorkDescription,
  onPhotoUpload,
  onDeletePhoto,
  isUploading = false,
  onSwitchToClassic,
}: Props) {
  // 실시간 KST 시계
  const [liveTimestamp, setLiveTimestamp] = useState<string>('')
  const [activeViewMode, setActiveViewMode] = useState<'telemetry' | 'simulation' | 'bim'>('telemetry')
  const [chartTimeframe, setChartTimeframe] = useState<'weekly' | 'monthly' | 'quarterly'>('weekly')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    function updateClock() {
      const now = new Date()
      const days = ['일', '월', '화', '수', '목', '금', '토']
      const y = now.getFullYear()
      const m = String(now.getMonth() + 1).padStart(2, '0')
      const d = String(now.getDate()).padStart(2, '0')
      const day = days[now.getDay()]
      const hh = String(now.getHours()).padStart(2, '0')
      const mm = String(now.getMinutes()).padStart(2, '0')
      const ss = String(now.getSeconds()).padStart(2, '0')
      setLiveTimestamp(`${y}-${m}-${d} (${day}) ${hh}:${mm}:${ss} KST`)
    }
    updateClock()
    const timer = setInterval(updateClock, 1000)
    return () => clearInterval(timer)
  }, [])

  // 무재해 일수 계산 (착공일 기준)
  const safetyDays = useMemo(() => {
    if (!site?.startDate) return 348
    const start = new Date(site.startDate).getTime()
    const now = Date.now()
    const days = Math.floor((now - start) / (1000 * 60 * 60 * 24))
    return Math.max(1, days)
  }, [site?.startDate])

  const targetDays = 500
  const safetyPercent = Math.min(100, Math.round((safetyDays / targetDays) * 1000) / 10)

  // 순수 관로부설 및 부대공 계약금액: 46.61억원 (토공 제외: 터파기·되메우기 제외)
  const contractAmount = 4661000000
  const spentAmount = siteTotalStats?.spentAmount ?? siteTotalStats?.totalSpent ?? 0
  const budgetExecutionRate = contractAmount > 0 && spentAmount > 0
    ? Math.min(100, Math.round((spentAmount / contractAmount) * 1000) / 10)
    : 1.5

  // 노무 투입 직종별 집계
  const laborStats = useMemo(() => {
    const labors = logData?.labors || []
    const count = labors.length
    const byJob: Record<string, number> = {}
    labors.forEach((l: any) => {
      const job = l.jobType || '일반'
      byJob[job] = (byJob[job] || 0) + 1
    })
    return { count, byJob }
  }, [logData?.labors])

  // 장비 투입 대수
  const equipmentCount = logData?.equipments?.length || 0

  // 서류 미비/확인필요 알림 카운트
  const incompleteDocCount = useMemo(() => {
    const labors = logData?.labors || []
    return labors.filter((l: any) => {
      const status = workerDocMap[l.name] || 'UNKNOWN'
      return status === 'UNKNOWN' || status === 'INCOMPLETE'
    }).length
  }, [logData?.labors, workerDocMap])

  // 캘린더 날짜 목록 계산
  const calendarDays = useMemo(() => {
    const curr = new Date(currentDate)
    const year = curr.getFullYear()
    const month = curr.getMonth()
    const firstDayIndex = new Date(year, month, 1).getDay()
    const totalDays = new Date(year, month + 1, 0).getDate()
    const todayDate = curr.getDate()

    const daysArr: { day: number; isCurrentMonth: boolean; isToday: boolean; dateStr: string }[] = []

    // 이전 달 빈 칸
    for (let i = 0; i < firstDayIndex; i++) {
      daysArr.push({ day: 0, isCurrentMonth: false, isToday: false, dateStr: '' })
    }
    // 이번 달 날짜
    for (let d = 1; d <= totalDays; d++) {
      const mStr = String(month + 1).padStart(2, '0')
      const dStr = String(d).padStart(2, '0')
      daysArr.push({
        day: d,
        isCurrentMonth: true,
        isToday: d === todayDate,
        dateStr: `${year}-${mStr}-${dStr}`,
      })
    }
    return { year, month: month + 1, daysArr }
  }, [currentDate])

  // 현장 사진
  const photos = logData?.photos || []

  // 도급내역서 및 실제 관로/맨홀 DB 연동 공종별 상세 진척도 (토공 제외, 관로부설 및 관련 부대공 순수 계약분: 46.61억)
  // '현장관로시공관리'에서 사용자가 수정한 시공완료 실적(로컬스토리지 및 원본)을 실시간 반영
  const [pipelineSegments, setPipelineSegments] = useState<any[]>(() => (cadData as any)?.segments || [])
  const [pipelineNodes, setPipelineNodes] = useState<any[]>(() => (cadData as any)?.nodes || [])

  const syncPipelineData = useCallback(() => {
    if (typeof window === 'undefined') return
    const STORAGE_KEY_SEGMENTS = 'field_pipeline_segments_v6'
    const STORAGE_KEY_NODES = 'field_pipeline_nodes_v6'
    const savedSegs = localStorage.getItem(STORAGE_KEY_SEGMENTS)
    const savedNodes = localStorage.getItem(STORAGE_KEY_NODES)
    if (savedSegs) {
      try {
        const parsed = JSON.parse(savedSegs)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPipelineSegments(parsed)
        }
      } catch (e) {}
    }
    if (savedNodes) {
      try {
        const parsed = JSON.parse(savedNodes)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPipelineNodes(parsed)
        }
      } catch (e) {}
    }
  }, [])

  useEffect(() => {
    syncPipelineData()
    const handleUpdate = (e: any) => {
      if (e?.detail?.segments) {
        setPipelineSegments(e.detail.segments)
        if (e.detail.nodes) setPipelineNodes(e.detail.nodes)
      } else {
        syncPipelineData()
      }
    }
    window.addEventListener('pipeline_data_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      window.removeEventListener('pipeline_data_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [syncPipelineData])

  const pipelineMetrics = useMemo(() => {
    const segments: any[] = pipelineSegments || []
    const totalSegments = segments.length || 188
    const compSegments = segments.filter(s => s.status === 'completed').length
    const totalLength = Math.round(segments.reduce((acc, s) => acc + (s.length || 0), 0)) || 10374
    const compLength = Math.round(segments.filter(s => s.status === 'completed').reduce((acc, s) => acc + (s.length || 0), 0)) || 0
    const pipeProgressRate = totalLength > 0 ? Math.round((compLength / totalLength) * 1000) / 10 : 7.6

    // 완료 맨홀 집계 (완료된 관로와 연결된 실측 맨홀 개소 또는 직접 완료된 맨홀)
    const compManholeSet = new Set<string>()
    segments.filter(s => s.status === 'completed').forEach(s => {
      if (s.fromNode) compManholeSet.add(s.fromNode)
      if (s.toNode) compManholeSet.add(s.toNode)
    })
    pipelineNodes.filter(n => n.status === 'completed').forEach(n => {
      compManholeSet.add(n.id)
    })
    const compManholes = compManholeSet.size
    const totalManholes = pipelineNodes.length || 188
    const manholeRate = Math.round((compManholes / totalManholes) * 1000) / 10

    // 관기초 모래부설/무근콘크리트 진척도 (관로 부설 선행 공종)
    const foundationRate = Math.min(100, Math.round((pipeProgressRate * 1.15) * 10) / 10)

    // CCTV/수밀시험 진척률: 완료 구간 중 검측 완료율
    const testRate = Math.max(0, Math.round((pipeProgressRate * 0.7) * 10) / 10)

    return {
      pipe: {
        totalLen: totalLength,
        compLen: compLength,
        totalSegs: totalSegments,
        compSegs: compSegments,
        rate: pipeProgressRate,
      },
      manhole: {
        total: totalManholes,
        comp: compManholes,
        rate: manholeRate,
      },
      foundation: {
        rate: foundationRate,
        compQty: `${Math.round(2749 * (foundationRate / 100)).toLocaleString()}m³`,
        totalQty: '2,749m³',
      },
      testing: {
        rate: testRate,
        testedLen: `${Math.round(compLength * 0.7).toLocaleString()}m`,
      },
      stormwater: {
        rate: 5.2,
      },
    }
  }, [pipelineSegments, pipelineNodes])

  return (
    <div className="stitch-dashboard w-full min-h-screen bg-surface font-body-md text-on-surface flex">
      {/* ── 좌측 고정 사이드바 (LNB) ────────────────────────────── */}
      <aside className="hidden xl:flex w-72 bg-primary-container shrink-0 flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.08)] min-h-screen z-20">
        <div className="flex flex-col">
          {/* Logo */}
          <div className="h-16 px-margin flex items-center justify-between bg-primary-container/90 border-b border-[rgba(255,255,255,0.08)]">
            <div className="flex items-center gap-space-sm">
              <div className="w-9 h-9 rounded-lg bg-[#5980a6] text-white flex items-center justify-center font-bold text-sm shadow-md">
                FM
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-headline-sm text-on-primary tracking-tight font-bold">
                  Building Field
                </span>
                <span className="font-label-sm text-label-sm text-on-primary-container uppercase tracking-wider">
                  현장통합관제 v2.0
                </span>
              </div>
            </div>
          </div>

          {/* Active Job Site Selector Card */}
          <div className="p-space-md mx-margin mt-space-sm rounded-lg bg-inverse-surface/60 flex flex-col gap-space-xs border border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-primary-container uppercase font-medium">
                Active Job Site
              </span>
              <button
                type="button"
                onClick={onOpenSiteModal}
                className="text-on-primary-container hover:text-white transition-colors p-0.5"
                title="현장 추가 및 설정 관리"
              >
                <span className="material-symbols-outlined text-[16px]">settings</span>
              </button>
            </div>
            {sites && sites.length > 0 ? (
              <select
                value={selectedSiteId}
                onChange={(e) => onSelectSite(e.target.value)}
                className="w-full bg-[#181a1d] text-white font-body-md text-sm font-semibold rounded px-2 py-1.5 border border-[rgba(255,255,255,0.15)] outline-none cursor-pointer hover:border-[#5980a6] transition-colors"
              >
                {sites.map((s) => (
                  <option key={s.id} value={s.id} className="bg-[#181a1d] text-white">
                    {s.name}
                  </option>
                ))}
              </select>
            ) : (
              <button
                type="button"
                onClick={onOpenSiteModal}
                className="text-left font-body-md text-sm font-semibold text-tertiary-fixed hover:underline"
              >
                + 새 현장 등록하기
              </button>
            )}
            <span className="font-label-sm text-label-sm text-tertiary-fixed-dim mt-0.5">
              도급 {contractAmount > 0 ? (contractAmount / 100000000).toFixed(1) + '억원' : '미입력'} • 공정률 {pipelineMetrics.pipe.rate}%
            </span>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-space-xs px-margin mt-space-lg">
            <button
              onClick={() => onNavigateTab('dashboard')}
              className="flex items-center gap-space-md px-space-md py-space-sm transition-colors bg-inverse-surface text-on-primary font-semibold rounded-lg text-left"
            >
              <span className="material-symbols-outlined text-[20px] text-[#5980a6]">grid_view</span>
              <span>종합 관제</span>
            </button>

            <button
              onClick={() => onNavigateTab('billing')}
              className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg font-body-md text-body-md text-on-primary-container hover:bg-inverse-surface/30 hover:text-on-primary transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[20px]">timeline</span>
              <span>기성 및 공정 관리</span>
            </button>

            <button
              onClick={() => onNavigateTab('labor')}
              className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg font-body-md text-body-md text-on-primary-container hover:bg-inverse-surface/30 hover:text-on-primary transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[20px]">engineering</span>
              <span>일일 작업일보 (노무/장비)</span>
            </button>

            <button
              onClick={() => onNavigateTab('material')}
              className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg font-body-md text-body-md text-on-primary-container hover:bg-inverse-surface/30 hover:text-on-primary transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[20px]">inventory_2</span>
              <span>자재 및 경비 원가</span>
            </button>

            <a
              href="/workers"
              className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg font-body-md text-body-md text-on-primary-container hover:bg-inverse-surface/30 hover:text-on-primary transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[20px]">badge</span>
              <span>근로자 마스터 &amp; 출퇴근</span>
            </a>

            <button
              onClick={() => onNavigateTab('feedback')}
              className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg font-body-md text-body-md text-on-primary-container hover:bg-inverse-surface/30 hover:text-on-primary transition-colors text-left"
            >
              <span className="material-symbols-outlined text-[20px]">chat</span>
              <span>현장 건의사항</span>
            </button>

            {currentUser?.role === 'ADMIN' && (
              <button
                onClick={onOpenUserModal}
                className="flex items-center gap-space-md px-space-md py-space-sm rounded-lg font-body-md text-body-md text-on-primary-container hover:bg-inverse-surface/30 hover:text-on-primary transition-colors text-left"
              >
                <span className="material-symbols-outlined text-[20px]">manage_accounts</span>
                <span>사용자 및 시스템 관리</span>
              </button>
            )}
          </nav>
        </div>

        {/* Safety Record Gauge in Sidebar */}
        <div className="p-margin flex flex-col gap-space-sm">
          <div className="p-space-md rounded-lg bg-inverse-surface/60 flex flex-col gap-space-xs border border-[rgba(255,255,255,0.06)]">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm text-on-primary-container font-semibold uppercase">
                Safety Record
              </span>
              <span className="font-label-sm text-label-sm text-secondary-fixed-dim font-bold">
                TARGET {targetDays}D
              </span>
            </div>
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-secondary-container text-[20px]">security</span>
              <span className="font-body-md text-body-md font-bold text-on-primary">
                무재해 {safetyDays}일 달성 중
              </span>
            </div>
            <div className="w-full bg-primary-container h-1.5 rounded-full overflow-hidden mt-space-xs">
              <div
                className="bg-secondary-container h-full rounded-full transition-all duration-500"
                style={{ width: `${safetyPercent}%` }}
              ></div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 메인 콘텐츠 영역 ────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-surface">
        {/* 상단 글로벌 헤더 */}
        <header className="h-16 bg-surface-container-lowest/95 backdrop-blur-md shadow-[0_1px_8px_rgba(0,0,0,0.04)] z-10 flex items-center justify-between px-margin border-b border-[rgba(29,31,32,0.08)] sticky top-0">
          {/* Search Box */}
          <div className="flex items-center gap-space-lg flex-1 max-w-xl">
            <div className="w-full flex items-center gap-space-sm px-space-md py-space-xs rounded-lg bg-surface-container-low text-on-surface border border-[rgba(29,31,32,0.06)]">
              <span className="material-symbols-outlined text-on-surface-variant text-[20px]">search</span>
              <input
                className="w-full bg-transparent border-none outline-none font-body-md text-body-md text-on-surface placeholder:text-on-surface-variant"
                placeholder="도면, 작업지시서, 투입인력, 자재명 검색..."
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Right Controls: Weather, Notification, User Profile */}
          <div className="flex items-center gap-space-lg">
            {/* Weather Sensor Display */}
            <div className="hidden xl:flex items-center gap-space-md px-space-md py-space-xs rounded-lg bg-surface-container-low border border-[rgba(29,31,32,0.06)]">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">wb_sunny</span>
                <span className="font-body-sm text-body-sm text-on-surface font-medium">
                  {logData?.weather ? `${logData.weather} 22°C` : '맑음 22°C'}
                </span>
              </div>
              <span className="text-outline-variant">|</span>
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-tertiary text-[18px]">air</span>
                <span className="font-body-sm text-body-sm text-on-surface font-medium">
                  미세먼지 <span className="text-secondary-container font-bold">좋음</span> (24㎍/㎥)
                </span>
              </div>
              <span className="text-outline-variant">|</span>
              <div className="flex items-center gap-space-xs">
                <span className="font-label-sm text-label-sm text-on-surface-variant font-medium">풍속 1.8m/s</span>
              </div>
            </div>

            {/* Notification Badge */}
            <div className="flex items-center gap-space-sm">
              <button 
                onClick={() => onNavigateTab('labor')}
                className="flex items-center gap-space-xs px-space-sm py-space-xs rounded-lg bg-error-container text-on-error-container font-label-sm text-label-sm hover:opacity-90 transition-opacity"
                title="서류 미비 근로자 확인"
              >
                <span className="material-symbols-outlined text-[16px]">warning</span>
                <span>{incompleteDocCount > 0 ? `${incompleteDocCount}건 서류 미비` : '정상 등록됨'}</span>
              </button>
            </div>

            {/* View Mode Toggle: Classic Dashboard */}
            {onSwitchToClassic && (
              <button
                type="button"
                onClick={onSwitchToClassic}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-xs transition-colors border border-[rgba(29,31,32,0.1)] shadow-xs"
                title="기존 요약/간편 대시보드로 화면 전환"
              >
                <span className="material-symbols-outlined text-[16px] text-[#5980a6]">view_quilt</span>
                <span className="font-semibold hidden sm:inline">간편/요약 뷰</span>
              </button>
            )}

            {/* DB Backup Button */}
            <button
              type="button"
              onClick={onOpenBackup}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-label-sm text-xs transition-colors border border-[rgba(29,31,32,0.1)] shadow-xs"
              title="데이터베이스 안전 백업 다운로드"
            >
              <span className="material-symbols-outlined text-[16px] text-emerald-600">lock</span>
              <span className="font-semibold">DB백업</span>
            </button>

            {/* User Profile & Actions */}
            <div className="flex items-center gap-space-md pl-space-sm border-l border-[rgba(29,31,32,0.12)]">
              <div className="flex flex-col items-end cursor-pointer" onClick={onOpenChangePin}>
                <span className="font-body-md text-body-md font-semibold text-on-surface hover:text-[#5980a6] transition-colors flex items-center gap-1">
                  {currentUser?.name || '관리자'}
                  <span className="material-symbols-outlined text-xs text-on-surface-variant">lock_reset</span>
                </span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {currentUser?.role === 'ADMIN' ? '현장 총괄 책임자' : '현장 작업자'}
                </span>
              </div>
              <button
                onClick={onLogout}
                className="w-8 h-8 rounded-full bg-[#5980a6] text-white flex items-center justify-center hover:bg-[#416180] transition-colors shadow-sm"
                title="로그아웃"
              >
                <span className="material-symbols-outlined text-[18px]">logout</span>
              </button>
            </div>
          </div>
        </header>

        {/* 대시보드 메인 본문 */}
        <main className="w-full px-margin py-margin flex flex-col gap-space-lg">
          {/* ── Top Level Viewport Action Bar ──────────────────────── */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md pb-space-xs border-b border-[rgba(29,31,32,0.08)]">
            <div className="flex items-center gap-space-md flex-wrap">
              <div className="flex items-center gap-space-xs px-space-sm py-space-xs bg-surface-container rounded-lg border border-[rgba(29,31,32,0.06)]">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary-container animate-pulse"></span>
                <span className="font-label-md text-label-md font-semibold text-on-surface uppercase">
                  LIVE TELEMETRY
                </span>
              </div>
              <div className="h-4 w-[1px] bg-outline-variant"></div>
              <div className="flex items-center gap-space-xs text-on-surface-variant font-label-md text-label-md">
                <span className="material-symbols-outlined text-[16px]">schedule</span>
                <span className="font-mono font-semibold text-on-surface">{liveTimestamp || '로딩 중...'}</span>
              </div>
              <span className="px-space-xs py-0.5 bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-label-sm rounded font-semibold">
                일보 기준일: {currentDate}
              </span>
            </div>

            <div className="flex items-center gap-space-sm">
              <div className="flex items-center bg-surface-container-low p-0.5 rounded-lg border border-[rgba(29,31,32,0.06)]">
                <button
                  onClick={() => setActiveViewMode('telemetry')}
                  className={`px-space-md py-1 rounded font-label-md text-label-md font-semibold transition-all ${activeViewMode === 'telemetry' ? 'bg-surface-container-lowest text-on-surface shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  실시간 관제
                </button>
                <button
                  onClick={() => setActiveViewMode('simulation')}
                  className={`px-space-md py-1 rounded font-label-md text-label-md transition-all ${activeViewMode === 'simulation' ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  공정 시뮬레이션
                </button>
                <button
                  onClick={() => setActiveViewMode('bim')}
                  className={`px-space-md py-1 rounded font-label-md text-label-md transition-all ${activeViewMode === 'bim' ? 'bg-surface-container-lowest text-on-surface shadow-xs font-semibold' : 'text-on-surface-variant hover:text-on-surface'}`}
                >
                  BIM 4D 뷰어
                </button>
              </div>

              <button
                onClick={() => {
                  const d = new Date(currentDate)
                  const mLabel = `${d.getFullYear()}년 ${d.getMonth() + 1}월`
                  exportMonthlyReport(site?.name || '현장', mLabel, logData, monthlyStats, siteTotalStats)
                }}
                className="flex items-center gap-space-xs px-space-md py-1.5 bg-[#5980a6] text-white rounded-lg font-body-sm text-body-sm font-semibold shadow-sm hover:bg-[#416180] transition-all active:scale-95"
                title="엑셀 및 월간 종합 보고서 다운로드"
              >
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                <span>일일종합보고서 (Excel)</span>
              </button>
            </div>
          </div>

          {/* ── 1. Top KPI Summary Cards (4 Columns) ────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter">
            {/* KPI 1: 전체 누적 공정률 (오수 관로부설 실측 연동) */}
            <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-[rgba(29,31,32,0.08)]">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-space-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant font-semibold tracking-wider uppercase">
                    Pipeline Construction Progress
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    전체 누적 공정률 (관로시공)
                  </h3>
                </div>
                <div className="p-2 rounded-lg bg-surface-container-low text-on-surface">
                  <span className="material-symbols-outlined text-[20px] text-[#5980a6]">donut_large</span>
                </div>
              </div>
              <div className="my-space-md flex items-baseline gap-space-sm">
                <span className="text-display font-bold text-on-surface tracking-tight font-mono">
                  {pipelineMetrics.pipe.rate}<span className="text-headline-md font-sans">%</span>
                </span>
                <span className="inline-flex items-center px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <span className="material-symbols-outlined text-[14px]">check_circle</span>
                  실측 연동: {pipelineMetrics.pipe.compSegs}구간 ({pipelineMetrics.pipe.compLen.toLocaleString()}m) 완료
                </span>
              </div>
              <div className="flex flex-col gap-space-xs">
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant">
                  <span>시공 수량: <strong className="text-on-surface font-mono">{pipelineMetrics.pipe.compLen.toLocaleString()}m</strong> / {pipelineMetrics.pipe.totalLen.toLocaleString()}m</span>
                  <span className="font-semibold text-[#5980a6] font-mono">
                    계획 8.0% 대비
                  </span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-[#5980a6] h-full rounded-full transition-all duration-1000"
                    style={{ width: `${pipelineMetrics.pipe.rate}%` }}
                  ></div>
                </div>
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant/80 mt-1">
                  <span>기준일: {currentDate}</span>
                  <span title="터파기/되메우기 등 토공 제외">순수 관로 계약 46.61억원</span>
                </div>
              </div>
            </div>

            {/* KPI 2: 안전관리등급 & 무재해 */}
            <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-[rgba(29,31,32,0.08)]">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-space-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant font-semibold tracking-wider uppercase">
                    Zero Incident Safety
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    안전관리등급 &amp; 무재해
                  </h3>
                </div>
                <div className="p-2 rounded-lg bg-surface-container-low text-on-surface">
                  <span className="material-symbols-outlined text-[20px] text-secondary-container">verified_user</span>
                </div>
              </div>
              <div className="my-space-md flex items-baseline gap-space-sm">
                <span className="text-display font-bold text-on-surface tracking-tight font-mono">
                  {safetyDays}<span className="text-headline-md font-sans font-normal">일</span>
                </span>
                <span className="px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold bg-tertiary-fixed text-on-tertiary-fixed">
                  안전 A+ 등급
                </span>
              </div>
              <div className="flex flex-col gap-space-xs">
                <div className="flex justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface-variant">위험작업 승인 허가</span>
                  <span className="font-semibold text-secondary-container">3건 진행 중 (고위험 1)</span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-secondary-container h-full rounded-full transition-all duration-700"
                    style={{ width: `${safetyPercent}%` }}
                  ></div>
                </div>
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant/80 mt-1">
                  <span>인명사고 0건</span>
                  <span>목표 500일 ({safetyPercent}%)</span>
                </div>
              </div>
            </div>

            {/* KPI 3: 당일 투입 인력 및 중장비 */}
            <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-[rgba(29,31,32,0.08)]">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-space-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant font-semibold tracking-wider uppercase">
                    Workforce &amp; Equipment
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    일일 출역 및 중장비
                  </h3>
                </div>
                <div className="p-2 rounded-lg bg-surface-container-low text-on-surface">
                  <span className="material-symbols-outlined text-[20px] text-[#5980a6]">engineering</span>
                </div>
              </div>
              <div className="my-space-md flex items-baseline gap-space-sm">
                <span className="text-display font-bold text-on-surface tracking-tight font-mono">
                  {laborStats.count || 28}<span className="text-headline-md font-sans font-normal">명</span>
                </span>
                <span className="px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold bg-surface-container text-on-surface">
                  장비 {equipmentCount}대 가동
                </span>
              </div>
              <div className="flex flex-col gap-space-xs">
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant truncate">
                  <span>
                    {Object.entries(laborStats.byJob).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' • ') || '배관공 2 • 조적공 1 • 보통인부 1'}
                  </span>
                  <span className="font-semibold text-on-surface font-mono">금일 출역</span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex gap-0.5">
                  <div className="bg-[#5980a6] h-full" style={{ width: '40%' }}></div>
                  <div className="bg-secondary-container h-full" style={{ width: '30%' }}></div>
                  <div className="bg-on-surface-variant h-full" style={{ width: '20%' }}></div>
                  <div className="bg-primary-fixed-dim h-full flex-1"></div>
                </div>
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant/80 mt-1">
                  <span>금일 노무비: ₩{(logData?.labors?.reduce((acc: number, cur: any) => acc + (cur.totalPrice || 0), 0) || grandTotal).toLocaleString()}</span>
                  <span>{equipmentCount > 0 ? `장비 ${equipmentCount}대` : '장비 미배정'}</span>
                </div>
              </div>
            </div>

            {/* KPI 4: 실행 예산 및 원가 투입률 */}
            <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between relative overflow-hidden group hover:shadow-md transition-shadow border border-[rgba(29,31,32,0.08)]">
              <div className="flex items-start justify-between">
                <div className="flex flex-col gap-space-xs">
                  <span className="font-label-md text-label-md text-on-surface-variant font-semibold tracking-wider uppercase">
                    Budget &amp; Cost Variance
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    실행예산 대비 집행률
                  </h3>
                </div>
                <div className="p-2 rounded-lg bg-surface-container-low text-on-surface">
                  <span className="material-symbols-outlined text-[20px] text-[#5980a6]">account_balance_wallet</span>
                </div>
              </div>
              <div className="my-space-md flex items-baseline gap-space-sm">
                <span className="text-display font-bold text-on-surface tracking-tight font-mono">
                  {budgetExecutionRate}<span className="text-headline-md font-sans">%</span>
                </span>
                <span className="inline-flex items-center px-space-xs py-0.5 rounded font-label-sm text-label-sm font-semibold bg-surface-container text-on-surface">
                  <span className="material-symbols-outlined text-[14px] text-secondary-container">south_east</span>
                  원가 안정
                </span>
              </div>
              <div className="flex flex-col gap-space-xs">
                <div className="flex justify-between font-label-sm text-label-sm">
                  <span className="text-on-surface-variant">
                    집행액: ₩{spentAmount > 0 ? (spentAmount / 100000000).toFixed(1) + '억' : '0.7억'}
                  </span>
                  <span className="font-semibold text-on-surface font-mono">
                    총 46.61억원 (토공 제외)
                  </span>
                </div>
                <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex">
                  <div
                    className="bg-[#5980a6] h-full rounded-full transition-all duration-1000"
                    style={{ width: `${budgetExecutionRate}%` }}
                  ></div>
                </div>
                <div className="flex justify-between font-label-sm text-label-sm text-on-surface-variant/80 mt-1">
                  <span>CPI 원가지수: 1.04</span>
                  <span>SPI 공정지수: 0.95</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 2. Middle Main Analytics Row (50:50 분할: 6 cols + 6 cols) ───────── */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter">
            {/* Left 6 Cols: 공정별 상세 진척도 및 S-Curve 차트 (50% 배분) */}
            <div className="xl:col-span-6 flex flex-col gap-space-lg">
              <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-lg border border-[rgba(29,31,32,0.08)]">
                {/* Header with Sub-tabs */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm pb-space-xs border-b border-[rgba(29,31,32,0.06)]">
                  <div className="flex items-center gap-space-sm">
                    <div className="w-1.5 h-4 bg-[#5980a6] rounded-full"></div>
                    <h2 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
                      공정별 상세 진척도 및 마일스톤 추이
                    </h2>
                    <span className="font-label-sm text-label-sm px-space-xs py-0.5 bg-surface-container-low text-on-surface font-medium rounded border border-[rgba(29,31,32,0.06)]" title="터파기/되메우기 등 토공 제외, 관로부설 및 관련공 순수 계약분: 46.61억원">
                      관로공 계약분 46.61억
                    </span>
                  </div>
                  <div className="flex items-center gap-space-sm">
                    <div className="flex items-center bg-surface-container-low p-0.5 rounded border border-[rgba(29,31,32,0.06)]">
                      <button 
                        onClick={() => setChartTimeframe('weekly')}
                        className={`px-space-sm py-1 font-label-sm text-label-sm rounded transition-all ${chartTimeframe === 'weekly' ? 'bg-surface-container-lowest font-semibold text-on-surface shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
                      >
                        주간
                      </button>
                      <button 
                        onClick={() => setChartTimeframe('monthly')}
                        className={`px-space-sm py-1 font-label-sm text-label-sm rounded transition-all ${chartTimeframe === 'monthly' ? 'bg-surface-container-lowest font-semibold text-on-surface shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
                      >
                        월간
                      </button>
                      <button 
                        onClick={() => setChartTimeframe('quarterly')}
                        className={`px-space-sm py-1 font-label-sm text-label-sm rounded transition-all ${chartTimeframe === 'quarterly' ? 'bg-surface-container-lowest font-semibold text-on-surface shadow-xs' : 'text-on-surface-variant hover:text-on-surface'}`}
                      >
                        분기 누적
                      </button>
                    </div>
                  </div>
                </div>

                {/* Major Construction Work Breakdown Cards (도급/견적 관로공 순수 계약분: 46.61억원, 토공 제외) */}
                <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-5 gap-space-sm p-space-sm bg-surface-container-low rounded-lg border border-[rgba(29,31,32,0.06)]">
                  {/* 01 오수 관로부설공 */}
                  <div className="p-space-sm bg-surface-container-lowest rounded flex flex-col gap-space-xs shadow-xs border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface" title="오수 관로부설 및 접합공사 (D300~D600 PP이중벽관 188구간)">
                        01 오수 관로부설
                      </span>
                      <span className="font-label-sm text-label-sm text-[#5980a6] font-bold font-mono">
                        {pipelineMetrics.pipe.rate}%
                      </span>
                    </div>
                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#5980a6] h-full transition-all duration-700"
                        style={{ width: `${pipelineMetrics.pipe.rate}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-on-surface-variant font-mono">
                      <span>계약 1.16억</span>
                      <span className="text-[#5980a6] font-semibold">{pipelineMetrics.pipe.compLen.toLocaleString()}m / {pipelineMetrics.pipe.totalLen.toLocaleString()}m</span>
                    </div>
                  </div>

                  {/* 02 오수 맨홀구조물공 */}
                  <div className="p-space-sm bg-surface-container-lowest rounded flex flex-col gap-space-xs shadow-xs border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant" title="오수 맨홀구조물공 (조립식 PC원형 1/2호 맨홀, 인버트, PE사다리, 주철뚜껑 188개소)">
                        02 오수 맨홀공
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface font-bold font-mono">
                        {pipelineMetrics.manhole.rate}%
                      </span>
                    </div>
                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#5980a6] h-full transition-all duration-700"
                        style={{ width: `${pipelineMetrics.manhole.rate}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-on-surface-variant font-mono">
                      <span>계약 3.94억</span>
                      <span className="text-secondary-container font-semibold">{pipelineMetrics.manhole.comp}개소 연계완료</span>
                    </div>
                  </div>

                  {/* 03 관기초 모래부설·부대공 */}
                  <div className="p-space-sm bg-surface-container-lowest rounded flex flex-col gap-space-xs shadow-xs border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant" title="관기초 모래부설 및 무근콘크리트 보호공 (관로 부설 전후 공종, 토공 터파기/되메우기 제외)">
                        03 관기초·모래부설
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface font-bold font-mono">
                        {pipelineMetrics.foundation.rate}%
                      </span>
                    </div>
                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-[#5980a6] h-full transition-all duration-700"
                        style={{ width: `${pipelineMetrics.foundation.rate}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-on-surface-variant font-mono">
                      <span>계약 2.11억</span>
                      <span>{pipelineMetrics.foundation.compQty} / {pipelineMetrics.foundation.totalQty}</span>
                    </div>
                  </div>

                  {/* 04 관로 검사·시험공 */}
                  <div className="p-space-sm bg-surface-container-lowest rounded flex flex-col gap-space-xs shadow-xs border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant" title="하수관내 CCTV 촬영조사(9,958m) 및 수압/수밀시험(193회)">
                        04 관로 시험·검사
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface font-bold font-mono">
                        {pipelineMetrics.testing.rate}%
                      </span>
                    </div>
                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-secondary-container h-full transition-all duration-700"
                        style={{ width: `${pipelineMetrics.testing.rate}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-on-surface-variant font-mono">
                      <span>계약 1.10억</span>
                      <span>검측 {pipelineMetrics.testing.testedLen} 완료</span>
                    </div>
                  </div>

                  {/* 05 우수·차집 관로부설공 */}
                  <div className="p-space-sm bg-surface-container-lowest rounded flex flex-col gap-space-xs shadow-xs border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm font-semibold text-on-surface-variant" title="우수 관로 및 배수공사 (36.08억), 차집관로 주철관/맨홀공사 (2.05억) 연계 공정">
                        05 우수·차집관로
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-bold font-mono">
                        {pipelineMetrics.stormwater.rate}%
                      </span>
                    </div>
                    <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-primary-fixed-dim h-full"
                        style={{ width: `${pipelineMetrics.stormwater.rate}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-on-surface-variant font-mono">
                      <span>계약 38.13억</span>
                      <span className="text-on-surface-variant">자재수급/시공준비</span>
                    </div>
                  </div>
                </div>

                {/* S-Curve & Multi-bar Comparison SVG Visualization */}
                <div className="flex flex-col gap-space-xs">
                  <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                    <div className="flex items-center gap-space-md flex-wrap">
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-[#5980a6] rounded-xs"></span>주간 실적 공정량 (%)</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-surface-container-high rounded-xs"></span>주간 계획 공정량 (%)</span>
                      <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-secondary-container"></span>누적 실적 S-Curve</span>
                    </div>
                    <span className="font-mono">송산 1-2공구 관로 마일스톤</span>
                  </div>

                  <div className="w-full h-56 bg-surface-container-lowest relative pt-space-sm">
                    <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox="0 0 700 180">
                      <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1" x1="40" x2="690" y1="20" y2="20"></line>
                      <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1" x1="40" x2="690" y1="60" y2="60"></line>
                      <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1" x1="40" x2="690" y1="100" y2="100"></line>
                      <line className="text-surface-container-high" stroke="currentColor" strokeDasharray="3 3" strokeWidth="1" x1="40" x2="690" y1="140" y2="140"></line>

                      <text className="fill-on-surface-variant text-[10px] font-mono" x="10" y="24">100%</text>
                      <text className="fill-on-surface-variant text-[10px] font-mono" x="10" y="64">75%</text>
                      <text className="fill-on-surface-variant text-[10px] font-mono" x="10" y="104">50%</text>
                      <text className="fill-on-surface-variant text-[10px] font-mono" x="10" y="144">25%</text>

                      {/* Bars W14~W20 (7월 착수 ~ 8월 배관집중 ~ 9월 현재) */}
                      <rect className="text-surface-container-high" fill="currentColor" height="25" width="22" x="70" y="125"></rect>
                      <rect className="text-[#5980a6]" fill="currentColor" height="28" width="22" x="94" y="122"></rect>

                      <rect className="text-surface-container-high" fill="currentColor" height="38" width="22" x="160" y="112"></rect>
                      <rect className="text-[#5980a6]" fill="currentColor" height="42" width="22" x="184" y="108"></rect>

                      <rect className="text-surface-container-high" fill="currentColor" height="50" width="22" x="250" y="100"></rect>
                      <rect className="text-[#5980a6]" fill="currentColor" height="54" width="22" x="274" y="96"></rect>

                      <rect className="text-surface-container-high" fill="currentColor" height="60" width="22" x="340" y="90"></rect>
                      <rect className="text-[#5980a6]" fill="currentColor" height="65" width="22" x="364" y="85"></rect>

                      <rect className="text-surface-container-high" fill="currentColor" height="68" width="22" x="430" y="82"></rect>
                      <rect className="text-[#5980a6]" fill="currentColor" height="74" width="22" x="454" y="76"></rect>

                      <rect className="text-surface-container-high" fill="currentColor" height="76" width="22" x="520" y="74"></rect>
                      <rect className="text-[#5980a6]" fill="currentColor" height="82" width="22" x="544" y="68"></rect>

                      <rect className="text-surface-container-high" fill="currentColor" height="82" width="22" x="610" y="68"></rect>
                      <rect className="text-secondary-container" fill="currentColor" height="90" width="22" x="634" y="60"></rect>

                      {/* S-Curve Path */}
                      <path className="text-secondary-container" d="M 85,130 Q 260,110 360,90 T 645,62" fill="none" stroke="currentColor" strokeWidth="3"></path>
                      <circle className="fill-surface-container-lowest stroke-secondary-container" cx="85" cy="130" r="3.5" strokeWidth="2"></circle>
                      <circle className="fill-surface-container-lowest stroke-secondary-container" cx="175" cy="118" r="3.5" strokeWidth="2"></circle>
                      <circle className="fill-surface-container-lowest stroke-secondary-container" cx="265" cy="105" r="3.5" strokeWidth="2"></circle>
                      <circle className="fill-surface-container-lowest stroke-secondary-container" cx="355" cy="92" r="3.5" strokeWidth="2"></circle>
                      <circle className="fill-surface-container-lowest stroke-secondary-container" cx="445" cy="80" r="3.5" strokeWidth="2"></circle>
                      <circle className="fill-surface-container-lowest stroke-secondary-container" cx="535" cy="70" r="3.5" strokeWidth="2"></circle>
                      <circle className="fill-secondary-container" cx="645" cy="62" r="4.5"></circle>

                      <text className="fill-on-surface-variant text-[11px] font-mono" textAnchor="middle" x="85" y="165">7월 1주</text>
                      <text className="fill-on-surface-variant text-[11px] font-mono" textAnchor="middle" x="175" y="165">7월 3주</text>
                      <text className="fill-on-surface-variant text-[11px] font-mono" textAnchor="middle" x="265" y="165">8월 1주</text>
                      <text className="fill-on-surface-variant text-[11px] font-mono" textAnchor="middle" x="355" y="165">8월 3주</text>
                      <text className="fill-on-surface-variant text-[11px] font-mono" textAnchor="middle" x="445" y="165">9월 1주</text>
                      <text className="fill-on-surface-variant text-[11px] font-mono" textAnchor="middle" x="535" y="165">9월 2주</text>
                      <text className="fill-on-surface text-[11px] font-mono font-bold" textAnchor="middle" x="645" y="165">금주(현재)</text>
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Right 6 Cols: 관로 시공 CAD 시각화 + 일일 현장 사진 기록 (50% 배분) */}
            <div className="xl:col-span-6 flex flex-col gap-space-lg">
              {/* 관로 시공 구간 CAD 시각화 (완료, 진행, 계획 및 Trim-Paths 애니메이션) */}
              <PipelineCadViewer />

              {/* 일일 현장 작업 사진 기록 (소규모 현장 맞춤형) */}
              <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col gap-space-md border border-[rgba(29,31,32,0.08)]">
                <div className="flex items-center justify-between pb-space-xs border-b border-[rgba(29,31,32,0.06)]">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[20px] text-[#5980a6]">photo_camera</span>
                    <h3 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
                      일일 현장 사진 기록
                    </h3>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-surface-container-low text-on-surface-variant font-mono">
                      {photos.length > 0 ? `${photos.length}장 보관 중` : '등록 사진 없음'}
                    </span>
                  </div>

                  {onPhotoUpload && (
                    <label className={`cursor-pointer px-3 py-1.5 rounded-lg bg-[#5980a6] hover:bg-[#416180] text-white text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-xs ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                      <input type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} />
                      <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
                      <span>{isUploading ? '업로드 중...' : '현장 사진 추가'}</span>
                    </label>
                  )}
                </div>

                {/* 사진 목록 뷰 */}
                {photos.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm">
                    {photos.map((p: any, idx: number) => (
                      <div
                        key={p.id || idx}
                        onClick={() => onViewPhoto && onViewPhoto(p.url)}
                        className="relative rounded-lg overflow-hidden bg-primary-container h-28 group cursor-pointer border border-[rgba(29,31,32,0.1)] shadow-xs"
                        title="클릭하여 원본 사진 확대"
                      >
                        <img
                          src={p.url}
                          alt="현장 사진"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/30 pointer-events-none"></div>
                        <div className="absolute top-1.5 left-1.5 flex items-center gap-1 bg-black/60 px-1.5 py-0.5 rounded text-white font-label-sm text-[9px]">
                          <span>#{idx + 1}</span>
                        </div>
                        {onDeletePhoto && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('이 사진을 삭제하시겠습니까?')) {
                                onDeletePhoto(p.id);
                              }
                            }}
                            className="absolute top-1.5 right-1.5 bg-black/70 hover:bg-black text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                            title="삭제"
                          >
                            <span className="material-symbols-outlined text-[12px]">close</span>
                          </button>
                        )}
                        <div className="absolute bottom-1.5 left-1.5 right-1.5 flex justify-between items-center text-white/90 font-label-sm text-[9px] font-mono">
                          <span className="truncate">{p.createdBy || '현장 기록'}</span>
                          <span className="text-sky-300 shrink-0">확대보기</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-space-lg rounded-lg border border-dashed border-[rgba(29,31,32,0.15)] bg-surface-container-low/50 flex flex-col items-center justify-center gap-2 text-center py-8">
                    <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                      <span className="material-symbols-outlined text-[24px] text-[#5980a6]">add_photo_alternate</span>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-body-md font-semibold text-on-surface">
                        등록된 일일 현장 사진이 없습니다
                      </span>
                      <span className="text-[12px] text-on-surface-variant">
                        당일 배관 시공, 터파기, 자재 반입 등 작업 사진을 등록하여 일보 및 검측 자료로 활용하세요.
                      </span>
                    </div>
                    {onPhotoUpload && (
                      <label className="mt-2 cursor-pointer px-3.5 py-1.5 rounded-lg bg-[#5980a6] hover:bg-[#416180] text-white text-[12px] font-bold flex items-center gap-1.5 transition-colors shadow-xs">
                        <input type="file" accept="image/*" className="hidden" onChange={onPhotoUpload} />
                        <span className="material-symbols-outlined text-[16px]">upload</span>
                        <span>첫 작업 사진 등록하기</span>
                      </label>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── 3. Bottom Operational Row (3 Columns) ───────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
            {/* Card 1: 금일 주요 작업 공정 및 위험작업 허가 */}
            <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-[rgba(29,31,32,0.08)]">
              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between pb-space-xs border-b border-[rgba(29,31,32,0.06)]">
                  <div className="flex items-center gap-space-xs">
                    <span className="w-1.5 h-4 bg-[#5980a6] rounded-full"></span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      금일 위험작업 허가 및 주요 공정
                    </h3>
                  </div>
                  <span className="px-space-xs py-0.5 rounded font-label-sm text-label-sm bg-surface-container text-on-surface font-semibold">
                    총 3개 구간
                  </span>
                </div>

                {/* 작업 일보 입력/수정 창 */}
                <div className="flex flex-col gap-1.5 p-space-sm bg-surface-container-low rounded-lg border border-[rgba(29,31,32,0.06)]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#5980a6] flex items-center gap-1">
                      <span className="material-symbols-outlined text-sm">edit_note</span> 오늘의 주요 작업 내용 (Work Log)
                    </span>
                    <span className="text-[10px] text-on-surface-variant font-mono">포커스 해제 시 자동 저장</span>
                  </div>
                  <textarea
                    className="w-full bg-surface-container border border-[rgba(29,31,32,0.12)] rounded-lg p-2.5 text-xs text-on-surface focus:ring-1 focus:ring-[#5980a6] focus:border-[#5980a6] outline-none resize-none h-20 transition-all font-body-sm"
                    placeholder="오늘의 주요 작업 내용 및 특이사항을 입력하세요..."
                    value={workDescription}
                    onChange={(e) => onWorkDescriptionChange && onWorkDescriptionChange(e.target.value)}
                    onBlur={onSaveWorkDescription}
                  />
                </div>

                <div className="flex flex-col gap-space-sm">
                  <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1 border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 rounded font-label-sm text-label-sm font-bold bg-error-container text-on-error-container">
                        고위험 작업
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">08:00 ~ 17:00</span>
                    </div>
                    <span className="font-body-md text-body-md font-semibold text-on-surface mt-0.5">
                      18F 슬래브 콘크리트 타설
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      타설 펌프카 2대 가동 • 신호수 4인 고정 배치 • 감리원 현장 입회 승인
                    </p>
                  </div>

                  <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1 border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 rounded font-label-sm text-label-sm font-bold bg-secondary-fixed text-on-secondary-fixed-variant">
                        중위험 작업
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">09:00 ~ 16:30</span>
                    </div>
                    <span className="font-body-md text-body-md font-semibold text-on-surface mt-0.5">
                      12F 커튼월 양중 및 프레임 취부
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      순간풍속 실시간 모니터링 • 하부 보행통로 안전구획 및 통제원 배치
                    </p>
                  </div>

                  <div className="p-space-sm rounded-lg bg-surface-container-low flex flex-col gap-1 border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center justify-between">
                      <span className="px-1.5 py-0.5 rounded font-label-sm text-label-sm font-bold bg-surface-container text-on-surface">
                        일반 허가
                      </span>
                      <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">10:00 ~ 18:00</span>
                    </div>
                    <span className="font-body-md text-body-md font-semibold text-on-surface mt-0.5">
                      B1F 소방배관 용접 &amp; 트레이 가설
                    </span>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      화재감시자 2인 입회 • 불티방지포 및 ABC 소화기 4기 배치 확인
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: 현장 공정 & 일정 캘린더 (날짜 클릭 시 해당 일보 즉시 로드) */}
            <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-[rgba(29,31,32,0.08)]">
              <div className="flex flex-col gap-space-sm">
                <div className="flex items-center justify-between pb-space-xs border-b border-[rgba(29,31,32,0.06)]">
                  <div className="flex items-center gap-space-xs">
                    <span className="w-1.5 h-4 bg-[#5980a6] rounded-full"></span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[18px] text-[#5980a6]">calendar_month</span>
                      <span>현장 공정 &amp; 일정 캘린더</span>
                    </h3>
                  </div>
                  <span className="font-mono font-bold text-xs text-[#5980a6]">
                    {calendarDays.year}.{String(calendarDays.month).padStart(2, '0')}
                  </span>
                </div>

                {/* Calendar Grid */}
                <div className="w-full">
                  <div className="grid grid-cols-7 text-center font-label-sm text-[10px] font-semibold py-1 border-b border-surface-container text-on-surface-variant">
                    <span className="text-error">일</span>
                    <span>월</span>
                    <span>화</span>
                    <span>수</span>
                    <span>목</span>
                    <span>금</span>
                    <span className="text-on-tertiary-container">토</span>
                  </div>
                  <div className="grid grid-cols-7 gap-y-1 text-center font-label-sm text-[11px] pt-1.5">
                    {calendarDays.daysArr.map((item, idx) => {
                      if (!item.isCurrentMonth) {
                        return <span key={idx} className="text-outline-variant py-0.5">-</span>
                      }
                      return (
                        <div
                          key={idx}
                          onClick={() => item.dateStr && onDateChange(item.dateStr)}
                          className="py-0.5 flex flex-col items-center justify-center relative cursor-pointer group"
                          title={`${item.dateStr} 일보 보기`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full flex items-center justify-center transition-all font-medium ${item.isToday ? 'bg-[#5980a6] text-white font-bold shadow-xs' : 'text-on-surface group-hover:bg-surface-container'}`}
                          >
                            {item.day}
                          </span>
                          {item.isToday && <span className="w-1 h-1 rounded-full bg-secondary-container mt-0.5"></span>}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Upcoming Milestones */}
                <div className="flex flex-col gap-1.5 pt-space-xs">
                  <div className="flex items-center justify-between font-label-sm text-label-sm">
                    <span className="font-semibold text-on-surface">주요 마일스톤 (Upcoming)</span>
                    <span className="text-[10px] text-secondary-container font-semibold">D-Day 2건</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <div className="p-1.5 rounded-lg bg-surface-container-low flex items-center justify-between text-body-sm border border-[rgba(29,31,32,0.04)]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-1 py-0.5 rounded bg-tertiary-fixed text-on-tertiary-fixed font-label-sm text-[9px] font-bold shrink-0">
                          D-2
                        </span>
                        <span className="font-medium text-on-surface truncate">감리단 구조안전 합동점검</span>
                      </div>
                      <span className="font-label-sm text-[10px] text-on-surface-variant shrink-0 font-mono">14:00</span>
                    </div>

                    <div className="p-1.5 rounded-lg bg-surface-container-low flex items-center justify-between text-body-sm border border-[rgba(29,31,32,0.04)]">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="px-1 py-0.5 rounded bg-secondary-fixed text-on-secondary-fixed-variant font-label-sm text-[9px] font-bold shrink-0">
                          TODAY
                        </span>
                        <span className="font-medium text-on-surface truncate">18F 슬래브 콘크리트 타설</span>
                      </div>
                      <span className="font-label-sm text-[10px] text-secondary-container font-semibold shrink-0 font-mono">진행중</span>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onNavigateTab('billing')}
                className="mt-space-md w-full py-2 bg-surface-container hover:bg-surface-container-high rounded-lg text-on-surface font-label-md text-label-md font-semibold flex items-center justify-center gap-space-xs transition-colors border border-[rgba(29,31,32,0.06)]"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>
                <span>공정 마일스톤 및 기성일정 관리</span>
              </button>
            </div>

            {/* Card 3: 자재 수급 및 야적 현황 */}
            <div className="p-space-lg rounded-xl bg-surface-container-lowest shadow-sm flex flex-col justify-between border border-[rgba(29,31,32,0.08)]">
              <div className="flex flex-col gap-space-md">
                <div className="flex items-center justify-between pb-space-xs border-b border-[rgba(29,31,32,0.06)]">
                  <div className="flex items-center gap-space-xs">
                    <span className="w-1.5 h-4 bg-[#5980a6] rounded-full"></span>
                    <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      주요 자재 수급 및 야적 현황
                    </h3>
                  </div>
                  <span className="font-label-sm text-label-sm text-on-surface-variant font-mono">ERP 재고 연동</span>
                </div>

                <div className="flex flex-col gap-space-md">
                  {/* Real Materials from Log if available */}
                  {logData?.materials && logData.materials.length > 0 ? (
                    logData.materials.slice(0, 3).map((m: any) => (
                      <div key={m.id} className="flex flex-col gap-space-xs">
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="font-body-md text-body-md font-semibold text-on-surface">{m.name}</span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant">{m.spec || '현장 직송분'}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="font-label-lg text-label-lg font-bold text-on-surface font-mono">
                              {m.quantity} {m.unit}
                            </span>
                            <span className="font-label-sm text-label-sm text-secondary-container font-semibold">
                              입고완료
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex">
                          <div className="bg-[#5980a6] h-full rounded-full" style={{ width: '80%' }}></div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <>
                      <div className="flex flex-col gap-space-xs">
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="font-body-md text-body-md font-semibold text-on-surface">레미콘 (25-24-150)</span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant">18F 슬래브 전용 송장</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="font-label-lg text-label-lg font-bold text-on-surface font-mono">180 / 320 m³</span>
                            <span className="font-label-sm text-label-sm text-secondary-container font-semibold">56.2% 반입완료</span>
                          </div>
                        </div>
                        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex">
                          <div className="bg-[#5980a6] h-full rounded-full" style={{ width: '56.2%' }}></div>
                        </div>
                      </div>

                      <div className="flex flex-col gap-space-xs">
                        <div className="flex justify-between items-center">
                          <div className="flex flex-col">
                            <span className="font-body-md text-body-md font-semibold text-on-surface">고장력 이형철근 (SD500)</span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant">야적장 안전 재고</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="font-label-lg text-label-lg font-bold text-on-surface font-mono">45.8 톤</span>
                            <span className="font-label-sm text-label-sm text-on-surface-variant font-semibold">적정 안전재고</span>
                          </div>
                        </div>
                        <div className="w-full bg-surface-container-high h-2 rounded-full overflow-hidden flex">
                          <div className="bg-secondary-container h-full rounded-full" style={{ width: '76%' }}></div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Quick Logistics Info */}
                  <div className="p-space-sm rounded-lg bg-surface-container-low flex items-center justify-between text-on-surface border border-[rgba(29,31,32,0.04)]">
                    <div className="flex items-center gap-space-xs">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">local_shipping</span>
                      <span className="font-body-sm text-body-sm font-medium">당일 자재 운송차량 입차</span>
                    </div>
                    <span className="font-label-md text-label-md font-bold font-mono">총 26대 중 17대 통과</span>
                  </div>
                </div>
              </div>

              {/* Emergency Hotline & Fast Action Bar */}
              <div className="mt-space-md grid grid-cols-2 gap-space-sm">
                <button 
                  onClick={() => alert('현장 비상상황실 유선망(02-1234-5678) 및 지정병원 응급실로 연결합니다.')}
                  className="py-2 bg-error text-white hover:bg-error/90 rounded-lg font-label-md text-label-md font-bold flex items-center justify-center gap-1 shadow-sm transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">call</span>
                  <span>비상대응 (상황실)</span>
                </button>
                <button
                  onClick={() => onNavigateTab('feedback')}
                  className="py-2 bg-[#5980a6] text-white hover:bg-[#416180] rounded-lg font-label-md text-label-md font-semibold flex items-center justify-center gap-1 shadow-sm transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]">edit_document</span>
                  <span>지적사항/건의 등록</span>
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
