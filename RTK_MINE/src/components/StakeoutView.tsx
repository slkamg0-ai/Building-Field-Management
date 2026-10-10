import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Compass, 
  ArrowUp, 
  Volume2, 
  VolumeX, 
  Target, 
  CheckCircle2, 
  Navigation,
  Crosshair,
  Smartphone,
  Radio,
  Zap,
  Save
} from 'lucide-react';
import { GnssState, StakeoutTarget, StakeoutDelta, SurveyPoint } from '../types/gnss';
import { voiceController } from '../services/voiceController';
import { headingManager, HeadingState } from '../services/headingSensor';
import { gnssManager } from '../services/bluetoothManager';

interface StakeoutViewProps {
  gnss: GnssState;
  surveyedPoints: SurveyPoint[];
  availableTargets: StakeoutTarget[];
  onMeasurePoint: () => void;
  onSavePoint?: (pt: SurveyPoint) => void;
}

export const StakeoutView: React.FC<StakeoutViewProps> = ({
  gnss,
  surveyedPoints,
  availableTargets,
  onMeasurePoint,
  onSavePoint
}) => {
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    availableTargets.length > 0 ? availableTargets[0].id : ''
  );
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrateEnabled, setVibrateEnabled] = useState(true);
  const [toleranceMeters, setToleranceMeters] = useState(0.02); // 표준 공차 2cm (0.02m)
  
  // 헤딩 상태 (하이브리드: GNSS COG vs 단말기 지자기 센서)
  const [headingState, setHeadingState] = useState<HeadingState>(() => 
    headingManager.resolveHeading(gnss.speedKmh, gnss.headingDeg)
  );

  const lastVibrateTime = useRef(0);

  // 실시간 헤딩 갱신 (초당 10~20회 부드러운 회전)
  useEffect(() => {
    const timer = setInterval(() => {
      setHeadingState(headingManager.resolveHeading(gnss.speedKmh, gnss.headingDeg));
    }, 80);
    return () => clearInterval(timer);
  }, [gnss.speedKmh, gnss.headingDeg]);

  // 현재 선택된 타겟
  const currentTarget = useMemo(() => {
    return availableTargets.find(t => t.id === selectedTargetId) || availableTargets[0] || null;
  }, [selectedTargetId, availableTargets]);

  // =========================================================================
  // [알고리즘 구현] 방위각 및 전후/좌우 상대 벡터 변환 (요구서 수식 100% 일치)
  // =========================================================================
  const delta: (StakeoutDelta & { isCloseUp: boolean; headingSourceLabel: string }) | null = useMemo(() => {
    if (!currentTarget) return null;

    // 1. 도북 기준 오프셋 (Delta Easting, Delta Northing)
    const deltaE = currentTarget.easting - gnss.easting;   // ΔE = E_tgt - E_cur
    const deltaN = currentTarget.northing - gnss.northing; // ΔN = N_tgt - N_cur

    // 2. 목표점 절대 거리(D) 및 절대 방위각(θ_target)
    const dist2D = Math.hypot(deltaE, deltaN); // D = sqrt(ΔE^2 + ΔN^2)

    // θ_target = atan2(ΔE, ΔN) (0° ~ 360° 정규화)
    let azimRad = Math.atan2(deltaE, deltaN);
    if (azimRad < 0) azimRad += 2 * Math.PI;
    const azimDeg = (azimRad * 180) / Math.PI;

    // 3. 작업자 기준 상대 각도(Δθ = θ_target - θ_heading)
    const currentHeading = headingState.headingDeg;
    let relAngle = azimDeg - currentHeading;
    while (relAngle > 180) relAngle -= 360;
    while (relAngle < -180) relAngle += 360;

    // 4. 전후(Forward) / 좌우(Right) 벡터 산출
    const relRad = (relAngle * Math.PI) / 180;
    const forward = dist2D * Math.cos(relRad); // Forward = D * cos(Δθ)
    const right = dist2D * Math.sin(relRad);   // Right   = D * sin(Δθ)

    // 5. 델타 Z (Cut/Fill 절성토 산출)
    const targetZ = currentTarget.elevation ?? gnss.orthoHeight;
    const dH = targetZ - gnss.orthoHeight; // Target.Z - Current.Z
    let cutFill: 'CUT' | 'FILL' | 'OK' = 'OK';
    if (Math.abs(dH) > toleranceMeters) {
      cutFill = dH > 0 ? 'FILL' : 'CUT';
    }

    const inTol = dist2D <= toleranceMeters;
    const isCloseUp = dist2D <= 0.50; // 50cm 이내 근접 시 10cm 미세 줌 모드

    const headingSourceLabel = 
      headingState.source === 'GNSS_COG' 
        ? `GNSS 이동 (${(headingState.speedMs).toFixed(1)}m/s)` 
        : headingState.source === 'DEVICE_COMPASS' 
        ? '단말 나침반 (정지)' 
        : '자세 고정';

    return {
      target: currentTarget,
      distance2D: dist2D,
      deltaX: deltaN,
      deltaY: deltaE,
      deltaH: dH,
      cutFill,
      azimuthDeg: azimDeg,
      relativeHeading: relAngle,
      forwardDist: forward,
      rightDist: right,
      inTolerance: inTol,
      isCloseUp,
      headingSourceLabel
    };
  }, [currentTarget, gnss, headingState, toleranceMeters]);

  // 근접 사운드 및 진동(Vibrate) 피드백
  useEffect(() => {
    if (!delta) return;

    if (soundEnabled) {
      voiceController.playStakeoutBeep(delta.distance2D, delta.inTolerance);
    }

    // 2cm 공차 이내 안착 시 햅틱 진동 피드백
    if (vibrateEnabled && delta.inTolerance) {
      const now = Date.now();
      if (now - lastVibrateTime.current > 600) {
        lastVibrateTime.current = now;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate([120, 60, 120]);
        }
      }
    }
  }, [delta, soundEnabled, vibrateEnabled]);

  // 음성 안내 (상대 거리 우선 출력)
  const speakGuidance = () => {
    if (!delta) return;
    if (delta.inTolerance) {
      voiceController.speak('공차 2센티 안착. 목표 지점에 도달했습니다.');
      return;
    }
    const fStr = delta.forwardDist >= 0 
      ? `앞으로 ${Math.abs(delta.forwardDist).toFixed(2)}미터` 
      : `뒤로 ${Math.abs(delta.forwardDist).toFixed(2)}미터`;
    const rStr = delta.rightDist >= 0 
      ? `오른쪽 ${Math.abs(delta.rightDist).toFixed(2)}미터` 
      : `왼쪽 ${Math.abs(delta.rightDist).toFixed(2)}미터`;
    const hStr = delta.cutFill === 'FILL' 
      ? `채움 ${Math.abs(delta.deltaH).toFixed(2)}미터` 
      : delta.cutFill === 'CUT' 
      ? `파기 ${Math.abs(delta.deltaH).toFixed(2)}미터` 
      : '높이 일치';

    voiceController.speak(`${fStr}, ${rStr}, ${hStr}`);
  };

  // 안착 후 바로 현재 점 기록
  const handleInstantSave = () => {
    if (!onSavePoint || !delta) return;
    const newPt: SurveyPoint = {
      id: `pt-${Date.now()}`,
      name: `${delta.target.name}_측설`,
      code: '측설완료',
      northing: gnss.northing,
      easting: gnss.easting,
      elevation: gnss.orthoHeight,
      ellipsoidHeight: gnss.altitude,
      poleHeight: gnssManager.getPoleHeight?.() || 2.0,
      fixQuality: gnss.fixQuality,
      satellites: gnss.satellites,
      hdop: gnss.hdop,
      stdDevH: Math.max(gnss.stdDevX, gnss.stdDevY),
      stdDevV: gnss.stdDevZ,
      timestamp: new Date().toISOString()
    };
    onSavePoint(newPt);
    voiceController.speak(`${newPt.name} 성과 저장 완료.`);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#ebf0f7] overflow-y-auto p-2.5 space-y-2.5 pb-4 select-none">
      {/* 1. 상단 타겟 선택 및 상태 바 */}
      <div className="neu-flat rounded-3xl p-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 flex-1 mr-2">
          <div className="neu-inset-sm p-2 rounded-2xl text-rose-500">
            <Target className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-slate-500">목표점</span>
              {delta && (
                <span className="text-[10px] font-mono px-2 py-0.2 rounded-full neu-inset text-cyan-700 font-bold">
                  {delta.headingSourceLabel}
                </span>
              )}
            </div>
            <select
              value={selectedTargetId}
              onChange={e => setSelectedTargetId(e.target.value)}
              className="w-full bg-transparent text-sm font-black text-slate-800 outline-none cursor-pointer truncate"
            >
              {availableTargets.map(t => (
                <option key={t.id} value={t.id} className="bg-slate-900 text-white">
                  {t.name} {t.elevation !== undefined ? `(EL:${t.elevation}m)` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 제어 아이콘 버튼들 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`p-2.5 rounded-2xl transition-all ${
              soundEnabled ? 'neu-inset text-cyan-700 bg-cyan-50/50' : 'neu-btn text-slate-400'
            }`}
            title="근접 비프음 토글"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={speakGuidance}
            className="p-2.5 rounded-2xl neu-btn text-slate-700 hover:text-slate-950"
            title="음성 유도 듣기"
          >
            <Navigation className="w-4 h-4 text-cyan-600" />
          </button>
        </div>
      </div>

      {/* 2. 메인 동적 레이더 뷰 (User-Centric 진행방향 고정 뷰) */}
      {delta && (
        <div className={`relative neu-dark rounded-3xl pt-3.5 pb-4 px-3.5 flex flex-col items-center justify-center overflow-hidden transition-all ${
          delta.inTolerance ? 'ring-4 ring-emerald-400 shadow-emerald-500/40' : ''
        }`}>
          {/* 상단 진행 방향 인디케이터 (글자 잘림 방지: 독립 캡슐 바 및 여유 있는 패딩) */}
          <div className="w-full flex items-center justify-between text-[11px] sm:text-xs px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-slate-300 mb-1">
            <div className="flex items-center gap-1 font-mono text-cyan-300">
              <span className="text-slate-400">방위:</span>
              <span className="font-black">{headingState.headingDeg.toFixed(0)}°</span>
            </div>
            <div className="flex items-center gap-1.5 font-bold text-slate-100">
              <ArrowUp className="w-3.5 h-3.5 text-cyan-400 animate-bounce" />
              <span>진행 방향 (정면)</span>
            </div>
            <div className="font-mono text-[10px] sm:text-[11px]">
              {delta.isCloseUp ? (
                <span className="text-amber-400 font-bold bg-amber-950/80 px-2 py-0.5 rounded-full border border-amber-600/80">
                  🔍 10cm 미세 줌
                </span>
              ) : (
                <span className="text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded-full border border-slate-700/60">
                  일반 뷰
                </span>
              )}
            </div>
          </div>

          {/* 거대 남은 총 직선 거리 */}
          <div className="text-center my-1.5">
            <div className={`text-4xl sm:text-5xl font-black font-mono tracking-tight leading-none ${
              delta.inTolerance 
                ? 'text-emerald-400 animate-pulse' 
                : delta.isCloseUp 
                ? 'text-amber-300' 
                : 'text-white'
            }`}>
              {delta.distance2D.toFixed(3)} <span className="text-lg sm:text-xl font-normal text-slate-400">m</span>
            </div>
            <div className="text-[10px] sm:text-[11px] text-slate-400 mt-1 flex items-center justify-center gap-1">
              <span>목표까지 직선거리</span>
              {delta.inTolerance && (
                <span className="text-emerald-400 font-bold ml-1">● 2cm 공차 안착 달성!</span>
              )}
            </div>
          </div>

          {/* 원형 레이더 캔버스 영역 (User-Centric 회전 뷰, 모바일 최적화 지름 208px) */}
          <div className="relative w-52 h-52 sm:w-56 sm:h-56 my-1.5 rounded-full neu-dark-inset border-2 border-white/10 flex items-center justify-center shadow-inner overflow-hidden">
            {/* 동심원 그리드 (거리별 동심원) */}
            {delta.isCloseUp ? (
              // 50cm 이내 미세 줌 모드 (10cm 간격 정밀 동심원)
              <>
                <div className="absolute inset-3 rounded-full border border-white/10"></div>
                <div className="absolute inset-10 rounded-full border border-white/10"></div>
                <div className="absolute inset-16 rounded-full border border-cyan-500/20"></div>
                <div className="absolute inset-22 rounded-full border border-amber-400/40"></div>
                {/* 2cm 공차 한계 링 */}
                <div className={`absolute w-10 h-10 rounded-full border-2 transition-all ${
                  delta.inTolerance ? 'border-emerald-400 bg-emerald-500/30 shadow-lg shadow-emerald-400/50' : 'border-rose-500/60'
                }`}></div>
                <span className="absolute top-1 text-[8px] font-mono text-slate-400">50cm</span>
                <span className="absolute top-7 text-[8px] font-mono text-slate-400">30cm</span>
                <span className="absolute top-13 text-[8px] font-mono text-slate-400">10cm</span>
              </>
            ) : (
              // 50cm 초과 일반 모드 (5m, 2m, 1m 동심원)
              <>
                <div className="absolute inset-3 rounded-full border border-white/5"></div>
                <div className="absolute inset-11 rounded-full border border-white/10"></div>
                <div className="absolute inset-19 rounded-full border border-cyan-500/20"></div>
                <div className="absolute w-8 h-8 rounded-full border border-rose-500/40"></div>
                <span className="absolute top-1 text-[8px] font-mono text-slate-500">5.0m</span>
                <span className="absolute top-9 text-[8px] font-mono text-slate-500">2.0m</span>
                <span className="absolute top-16 text-[8px] font-mono text-slate-500">1.0m</span>
              </>
            )}

            {/* 십자선 (진행축 & 좌우축) */}
            <div className="absolute w-full h-[1px] bg-white/10"></div>
            <div className="absolute h-full w-[1px] bg-white/10"></div>

            {/* 시각적 가이드 회전 화살표 (화살표만 따라가면 목표점에 도달!) */}
            <div
              className="absolute w-14 h-14 flex items-center justify-center transition-transform duration-150"
              style={{ transform: `rotate(${delta.relativeHeading}deg)` }}
            >
              <ArrowUp className={`w-12 h-12 filter drop-shadow-lg ${
                delta.inTolerance 
                  ? 'text-emerald-400 scale-90' 
                  : delta.isCloseUp 
                  ? 'text-amber-400 animate-pulse' 
                  : 'text-rose-500 animate-pulse'
              }`} />
            </div>

            {/* 화면상 목표점(●) 위치 표시 (상대 각도 및 거리 기반 투영) */}
            {(() => {
              // 레이더 반경(104px) 내 목표점 위치 매핑
              const maxDist = delta.isCloseUp ? 0.50 : 5.0;
              const normalizedDist = Math.min(1.0, delta.distance2D / maxDist);
              const radarRadiusPx = 86;
              const angleRad = ((delta.relativeHeading - 90) * Math.PI) / 180;
              const tgtX = Math.cos(angleRad) * (normalizedDist * radarRadiusPx);
              const tgtY = Math.sin(angleRad) * (normalizedDist * radarRadiusPx);

              return (
                <div 
                  className="absolute w-4 h-4 -ml-2 -mt-2 flex items-center justify-center transition-all duration-150 z-20"
                  style={{ transform: `translate(${tgtX}px, ${tgtY}px)` }}
                >
                  <span className="w-3.5 h-3.5 rounded-full bg-rose-500 ring-4 ring-rose-400/40 animate-ping absolute"></span>
                  <span className="w-3 h-3 rounded-full bg-rose-400 shadow-md z-10 flex items-center justify-center text-[7px] font-black text-white">
                    ●
                  </span>
                </div>
              );
            })()}

            {/* 중앙 작업자(내 위치) 마커 */}
            <div className="w-3.5 h-3.5 rounded-full bg-cyan-400 ring-4 ring-cyan-500/40 z-10 shadow-lg"></div>
          </div>

          {/* 공차 안착 시 즉시 저장 액션 버튼 */}
          {delta.inTolerance && (
            <button
              onClick={handleInstantSave}
              className="w-full mt-1 mb-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30 active:scale-95"
            >
              <Save className="w-4 h-4" />
              현재 지점 성과 즉시 저장 (공차 달성)
            </button>
          )}
        </div>
      )}

      {/* 3. 상대 거리 우선 표기 카드 (요구서 4번 핵심 UI: 크고 굵은 폰트) */}
      {delta && (
        <div className="neu-flat rounded-2xl sm:rounded-3xl p-3 space-y-2">
          <div className="text-[11px] sm:text-xs font-bold text-slate-500 px-1">
            작업자 기준 상대 이동 가이던스
          </div>

          {/* 1) 앞으로 / 뒤로 벡터 (Forward) */}
          <div className="neu-inset rounded-xl sm:rounded-2xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${delta.forwardDist >= 0 ? 'bg-cyan-500' : 'bg-slate-400'}`}></span>
              <span className="text-xs font-bold text-slate-600">
                {delta.forwardDist >= 0 ? '▶ 앞으로 (Forward)' : '▼ 뒤로 (Backward)'}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-800">
              {Math.abs(delta.forwardDist).toFixed(2)} <span className="text-xs font-bold text-slate-500">m</span>
            </div>
          </div>

          {/* 2) 오른쪽 / 왼쪽 벡터 (Right) */}
          <div className="neu-inset rounded-xl sm:rounded-2xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${delta.rightDist >= 0 ? 'bg-cyan-500' : 'bg-slate-400'}`}></span>
              <span className="text-xs font-bold text-slate-600">
                {delta.rightDist >= 0 ? '▶ 오른쪽 (Right)' : '◀ 왼쪽 (Left)'}
              </span>
            </div>
            <div className="text-xl sm:text-2xl font-black font-mono text-slate-800">
              {Math.abs(delta.rightDist).toFixed(2)} <span className="text-xs font-bold text-slate-500">m</span>
            </div>
          </div>

          {/* 3) 높이 델타 Z (Cut / Fill) */}
          <div className="neu-inset rounded-xl sm:rounded-2xl p-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-black ${
                delta.cutFill === 'FILL' 
                  ? 'bg-blue-500/20 text-blue-700 border border-blue-500/30' 
                  : delta.cutFill === 'CUT' 
                  ? 'bg-rose-500/20 text-rose-700 border border-rose-500/30' 
                  : 'bg-emerald-500/20 text-emerald-700'
              }`}>
                {delta.cutFill === 'FILL' ? '▲ 채움 (성토)' : delta.cutFill === 'CUT' ? '▼ 파기 (절토)' : '적정 (OK)'}
              </span>
              <span className="text-xs font-bold text-slate-600">델타 Z</span>
            </div>
            <div className={`text-xl sm:text-2xl font-black font-mono ${
              delta.cutFill === 'FILL' ? 'text-blue-700' : delta.cutFill === 'CUT' ? 'text-rose-700' : 'text-emerald-700'
            }`}>
              {delta.deltaH > 0 ? `+${delta.deltaH.toFixed(2)}` : delta.deltaH.toFixed(2)} <span className="text-xs font-bold text-slate-500">m</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
