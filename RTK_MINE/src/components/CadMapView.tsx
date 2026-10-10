import React, { useRef, useEffect, useState, useMemo } from 'react';
import { 
  Layers, 
  ZoomIn, 
  ZoomOut, 
  Crosshair, 
  Upload, 
  MapPin, 
  Target, 
  Eye, 
  EyeOff, 
  Maximize2,
  Loader2
} from 'lucide-react';
import { GnssState, StakeoutTarget } from '../types/gnss';
import { CadDrawing, parseCadFile, findNearestCadNode } from '../services/dxfLoader';

interface CadMapViewProps {
  gnss: GnssState;
  drawing: CadDrawing;
  onSelectStakeoutTarget: (target: StakeoutTarget) => void;
  onLoadNewDrawing: (drawing: CadDrawing) => void;
}

export const CadMapView: React.FC<CadMapViewProps> = ({
  gnss,
  drawing,
  onSelectStakeoutTarget,
  onLoadNewDrawing
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 뷰포트 상태 (중심 좌표 및 줌 배율)
  const [viewCenter, setViewCenter] = useState<{ x: number; y: number }>({
    x: drawing.bounds.centerX,
    y: drawing.bounds.centerY
  });
  const [zoomScale, setZoomScale] = useState<number>(3.5); // 픽셀 per 미터
  const [activeLayers, setActiveLayers] = useState<Set<string>>(new Set(drawing.layers));
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [isSatelliteMode, setIsSatelliteMode] = useState(false);
  const [selectedNode, setSelectedNode] = useState<{ name: string; x: number; y: number; z?: number } | null>(null);

  // 드래그 상태
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // 레이어 동기화
  useEffect(() => {
    setActiveLayers(new Set(drawing.layers));
    setViewCenter({ x: drawing.bounds.centerX, y: drawing.bounds.centerY });
  }, [drawing]);

  // 내 GPS 위치로 즉시 이동
  const centerToGps = () => {
    setViewCenter({ x: gnss.easting, y: gnss.northing });
  };

  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // DXF / DWG 파일 업로드 핸들러
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoadingFile(true);
    try {
      const parsed = await parseCadFile(file);
      onLoadNewDrawing(parsed);
    } catch (err: any) {
      console.error('CAD 파일 파싱 오류:', err);
      alert(`도면을 불러오지 못했습니다: ${err.message || '지원되지 않는 DWG/DXF 형식이거나 손상된 파일입니다.'}`);
    } finally {
      setIsLoadingFile(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 캔버스 렌더링 루프
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 디스플레이 픽셀 비율 대응
    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // 배경 지우기
    if (isSatelliteMode) {
      // 위성지도 시뮬레이션 배경 (다크 위성 그리드)
      ctx.fillStyle = '#0a192f';
      ctx.fillRect(0, 0, width, height);

      // 격자선 (10m 간격)
      ctx.strokeStyle = '#1e3a5f';
      ctx.lineWidth = 0.5;
      const step = 10 * zoomScale;
      for (let x = 0; x < width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    } else {
      // 표준 CAD 흑색 HUD 배경
      ctx.fillStyle = '#050b14';
      ctx.fillRect(0, 0, width, height);
    }

    // 좌표 변환 함수: CAD (Easting: X, Northing: Y) -> Canvas (px, py)
    // 수치지도/토목도면은 Y가 북쪽(위쪽)이므로 캔버스에서는 반전 필요
    const toCanvasX = (easting: number) => width / 2 + (easting - viewCenter.x) * zoomScale;
    const toCanvasY = (northing: number) => height / 2 - (northing - viewCenter.y) * zoomScale;

    // 1. 도면 엔티티 렌더링
    drawing.entities.forEach(ent => {
      if (!activeLayers.has(ent.layer)) return;

      ctx.strokeStyle = ent.color || '#94a3b8';
      ctx.fillStyle = ent.color || '#94a3b8';

      if (ent.type === 'LWPOLYLINE' || ent.type === 'LINE') {
        if (ent.points.length < 2) return;
        ctx.lineWidth = ent.layer === 'PIPE_LINE' ? 2.5 : 1.2;
        ctx.beginPath();
        ent.points.forEach((pt, idx) => {
          const cx = toCanvasX(pt.x);
          const cy = toCanvasY(pt.y);
          if (idx === 0) ctx.moveTo(cx, cy);
          else ctx.lineTo(cx, cy);
        });
        ctx.stroke();
      } else if (ent.type === 'CIRCLE' || ent.type === 'POINT') {
        const pt = ent.points[0];
        if (!pt) return;
        const cx = toCanvasX(pt.x);
        const cy = toCanvasY(pt.y);
        const r = Math.max(3, (ent.radius || 1) * zoomScale * 0.4);

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, 2 * Math.PI);
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fill();
      } else if (ent.type === 'TEXT' && ent.text) {
        const pt = ent.points[0];
        if (!pt) return;
        const cx = toCanvasX(pt.x);
        const cy = toCanvasY(pt.y);

        ctx.font = '10px monospace';
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(ent.text, cx + 4, cy - 4);
      }
    });

    // 2. 실시간 GPS 내 위치 커서 렌더링
    const gpsCx = toCanvasX(gnss.easting);
    const gpsCy = toCanvasY(gnss.northing);

    // 오차 반경 동심원
    const errRadiusPx = Math.max(5, (Math.max(gnss.stdDevX, gnss.stdDevY) || 0.02) * zoomScale);
    ctx.beginPath();
    ctx.arc(gpsCx, gpsCy, errRadiusPx, 0, 2 * Math.PI);
    ctx.fillStyle = gnss.fixQuality === 4 ? 'rgba(16, 185, 129, 0.25)' : 'rgba(245, 158, 11, 0.25)';
    ctx.fill();
    ctx.strokeStyle = gnss.fixQuality === 4 ? '#10b981' : '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 중심 십자선 커서
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gpsCx - 10, gpsCy);
    ctx.lineTo(gpsCx + 10, gpsCy);
    ctx.moveTo(gpsCx, gpsCy - 10);
    ctx.lineTo(gpsCx, gpsCy + 10);
    ctx.stroke();

    // 헤딩 방향 화살표
    if (gnss.headingDeg !== undefined) {
      const headingRad = ((gnss.headingDeg - 90) * Math.PI) / 180;
      const arrowLen = 18;
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(gpsCx, gpsCy);
      ctx.lineTo(gpsCx + Math.cos(headingRad) * arrowLen, gpsCy + Math.sin(headingRad) * arrowLen);
      ctx.stroke();
    }
  }, [drawing, viewCenter, zoomScale, activeLayers, isSatelliteMode, gnss]);

  // 터치/마우스 클릭 스냅 핸들러
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickPxX = e.clientX - rect.left;
    const clickPxY = e.clientY - rect.top;

    // Canvas px -> CAD 좌표 변환
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const clickEasting = viewCenter.x + (clickPxX - width / 2) / zoomScale;
    const clickNorthing = viewCenter.y - (clickPxY - height / 2) / zoomScale;

    // 가장 가까운 CAD 노드 탐색 (5m 반경 내)
    const nearest = findNearestCadNode(drawing, clickEasting, clickNorthing, 6.0);
    if (nearest) {
      const entText = nearest.entity.text || nearest.entity.id;
      setSelectedNode({
        name: entText,
        x: nearest.point.x,
        y: nearest.point.y,
        z: nearest.point.z
      });
    } else {
      setSelectedNode(null);
    }
  };

  // 드래그(Pan) 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };

    setViewCenter(prev => ({
      x: prev.x - dx / zoomScale,
      y: prev.y + dy / zoomScale
    }));
  };
  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const startStakeoutToSelected = () => {
    if (!selectedNode) return;
    onSelectStakeoutTarget({
      id: `target-${Date.now()}`,
      name: selectedNode.name,
      northing: selectedNode.y,
      easting: selectedNode.x,
      elevation: selectedNode.z
    });
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col relative bg-slate-950 overflow-hidden select-none pb-0">
      {/* 1. 상단 플로팅 툴바 */}
      <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-10 pointer-events-none">
        <div className="bg-slate-900/90 backdrop-blur border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-bold text-white shadow pointer-events-auto flex items-center gap-1.5">
          <span className="truncate max-w-[180px]">{drawing.name}</span>
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
            drawing.format === 'DWG' 
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' 
              : drawing.format === 'DXF'
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
              : 'bg-slate-800 text-slate-400'
          }`}>
            {drawing.format || 'CAD'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 pointer-events-auto">
          {/* 레이어 메뉴 토글 */}
          <button
            onClick={() => setShowLayerMenu(!showLayerMenu)}
            className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white shadow"
            title="도면 레이어 필터"
          >
            <Layers className="w-4 h-4" />
          </button>

          {/* 위성/CAD 모드 토글 */}
          <button
            onClick={() => setIsSatelliteMode(!isSatelliteMode)}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold shadow transition-colors ${
              isSatelliteMode ? 'bg-cyan-500 text-slate-950 border-cyan-400' : 'bg-slate-900/90 text-slate-300 border-slate-800'
            }`}
          >
            {isSatelliteMode ? '위성지도' : 'CAD 모드'}
          </button>

          {/* DWG / DXF 파일 업로드 */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoadingFile}
            className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white shadow disabled:opacity-50"
            title="DWG / DXF 캐드 도면 불러오기"
          >
            {isLoadingFile ? <Loader2 className="w-4 h-4 animate-spin text-cyan-400" /> : <Upload className="w-4 h-4" />}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            accept=".dwg,.dxf"
            className="hidden"
          />
        </div>
      </div>

      {/* DWG 로딩 중 오버레이 */}
      {isLoadingFile && (
        <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 p-6 rounded-3xl shadow-2xl flex flex-col items-center space-y-3 max-w-xs text-center">
            <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
            <div className="text-sm font-black text-white">캐드 도면 변환 중...</div>
            <div className="text-xs text-slate-400 leading-relaxed">
              AutoCAD DWG/DXF 바이너리를 WebAssembly(WASM) 엔진으로 고속 파싱하고 있습니다.
            </div>
          </div>
        </div>
      )}

      {/* 레이어 드롭다운 메뉴 */}
      {showLayerMenu && (
        <div className="absolute top-12 right-2 bg-slate-900/95 border border-slate-800 rounded-2xl p-2.5 z-20 shadow-2xl space-y-1.5 min-w-[160px]">
          <div className="text-[11px] font-bold text-slate-400 px-1 border-b border-slate-800 pb-1">레이어 필터</div>
          {drawing.layers.map(layer => {
            const isVisible = activeLayers.has(layer);
            return (
              <button
                key={layer}
                onClick={() => {
                  const next = new Set(activeLayers);
                  if (isVisible) next.delete(layer);
                  else next.add(layer);
                  setActiveLayers(next);
                }}
                className="w-full flex items-center justify-between px-2 py-1 rounded-lg text-xs hover:bg-slate-800 text-left"
              >
                <span className="font-mono text-slate-200">{layer}</span>
                {isVisible ? <Eye className="w-3.5 h-3.5 text-cyan-400" /> : <EyeOff className="w-3.5 h-3.5 text-slate-600" />}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. 메인 인터랙티브 캔버스 */}
      <canvas
        ref={canvasRef}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            isDragging.current = true;
            lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          }
        }}
        onTouchMove={(e) => {
          if (!isDragging.current || e.touches.length !== 1) return;
          const dx = e.touches[0].clientX - lastMousePos.current.x;
          const dy = e.touches[0].clientY - lastMousePos.current.y;
          lastMousePos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
          setViewCenter(prev => ({
            x: prev.x - dx / zoomScale,
            y: prev.y + dy / zoomScale
          }));
        }}
        onTouchEnd={() => { isDragging.current = false; }}
        className="w-full h-full cursor-crosshair touch-none"
      />

      {/* 3. 우측 하단 줌 & GPS 추적 버튼 (뉴모피즘 플로팅 버튼) */}
      <div className="absolute bottom-20 right-3 flex flex-col gap-2.5 z-10">
        <button
          onClick={centerToGps}
          className="p-3.5 rounded-2xl neu-btn text-cyan-600 bg-cyan-50/60 active:scale-95 shadow-md"
          title="내 GPS 위치로 이동"
        >
          <Crosshair className="w-5 h-5 text-cyan-600" />
        </button>
        <button
          onClick={() => setZoomScale(prev => Math.min(20, prev * 1.3))}
          className="p-3.5 rounded-2xl neu-btn text-slate-700 active:scale-95"
          title="확대"
        >
          <ZoomIn className="w-5 h-5" />
        </button>
        <button
          onClick={() => setZoomScale(prev => Math.max(0.5, prev / 1.3))}
          className="p-3.5 rounded-2xl neu-btn text-slate-700 active:scale-95"
          title="축소"
        >
          <ZoomOut className="w-5 h-5" />
        </button>
      </div>

      {/* 4. 노드 선택 시 하단 원터치 측설 시작 시트 (뉴모픽 소프트 패널) */}
      {selectedNode && (
        <div className="absolute bottom-2 left-3 right-3 neu-flat rounded-3xl p-3.5 z-30 flex items-center justify-between border-2 border-cyan-400/50 shadow-2xl">
          <div className="mr-2">
            <span className="text-[10px] text-cyan-700 font-black block">도면 노드 스냅 선택됨</span>
            <div className="text-sm font-black text-slate-800">{selectedNode.name}</div>
            <div className="text-[11px] font-mono text-slate-500">
              X:{selectedNode.y.toFixed(2)} Y:{selectedNode.x.toFixed(2)} {selectedNode.z ? `EL:${selectedNode.z}m` : ''}
            </div>
          </div>
          <button
            onClick={startStakeoutToSelected}
            className="px-4 py-2.5 rounded-2xl neu-btn bg-cyan-500 text-white font-black text-xs flex items-center gap-1.5 active:scale-95 whitespace-nowrap shadow-md shadow-cyan-500/20"
          >
            <Target className="w-4 h-4 text-white" />
            측설 시작
          </button>
        </div>
      )}
    </div>
  );
};
