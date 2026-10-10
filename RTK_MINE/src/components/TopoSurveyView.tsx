import React, { useState, useEffect } from 'react';
import { 
  Crosshair, 
  Layers, 
  CheckCircle2, 
  AlertCircle, 
  Ruler, 
  Tag, 
  Play, 
  Sparkles, 
  RotateCcw,
  Check,
  Target
} from 'lucide-react';
import { GnssState, SurveyPoint } from '../types/gnss';
import { voiceController } from '../services/voiceController';

interface TopoSurveyViewProps {
  gnss: GnssState;
  poleHeight: number;
  onSetPoleHeight: (h: number) => void;
  onSavePoint: (pt: SurveyPoint) => void;
  lastPointName: string;
}

const DEFAULT_CODES = ['TBM', '맨홀', '오수관', '우수관', '상수관', '도로중심', '도로경계', '터파기바닥', '자연지반'];

export const TopoSurveyView: React.FC<TopoSurveyViewProps> = ({
  gnss,
  poleHeight,
  onSetPoleHeight,
  onSavePoint,
  lastPointName
}) => {
  const [pointPrefix, setPointPrefix] = useState('PT');
  const [pointNum, setPointNum] = useState(1);
  const [selectedCode, setSelectedCode] = useState('맨홀');
  const [epochCount, setEpochCount] = useState<number>(1);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureProgress, setMeasureProgress] = useState(0);
  const [epochBuffer, setEpochBuffer] = useState<GnssState[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  const currentPointName = `${pointPrefix}${pointNum.toString().padStart(3, '0')}`;

  useEffect(() => {
    const unsub = voiceController.onCommand((cmd) => {
      if (cmd.action === 'MEASURE') {
        startMeasurement();
      } else if (cmd.action === 'SET_CODE' && cmd.payload) {
        setSelectedCode(cmd.payload);
        voiceController.speak(`코드 ${cmd.payload} 설정`);
      } else if (cmd.action === 'SET_NAME' && cmd.payload) {
        setPointPrefix(cmd.payload);
        voiceController.speak(`점명 ${cmd.payload} 설정`);
      }
    });
    return unsub;
  }, [gnss, pointNum, selectedCode, epochCount, isMeasuring]);

  const startMeasurement = () => {
    if (isMeasuring) return;

    if (gnss.fixQuality !== 4) {
      voiceController.speak('주의: RTK 고정 상태가 아닙니다.');
    }

    if (epochCount === 1) {
      executeSave([gnss]);
    } else {
      setIsMeasuring(true);
      setMeasureProgress(0);
      setEpochBuffer([]);
    }
  };

  useEffect(() => {
    if (!isMeasuring) return;

    const timer = setInterval(() => {
      setEpochBuffer(prev => {
        const next = [...prev, { ...gnss }];
        const pct = Math.min(100, Math.round((next.length / epochCount) * 100));
        setMeasureProgress(pct);

        if (next.length >= epochCount) {
          clearInterval(timer);
          setIsMeasuring(false);
          executeSave(next);
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isMeasuring, epochCount, gnss]);

  const executeSave = (buffer: GnssState[]) => {
    let sumN = 0, sumE = 0, sumZ = 0, sumH = 0;
    buffer.forEach(s => {
      sumN += s.northing;
      sumE += s.easting;
      sumZ += s.orthoHeight;
      sumH += s.altitude;
    });
    const avgN = sumN / buffer.length;
    const avgE = sumE / buffer.length;
    const avgZ = sumZ / buffer.length;
    const avgH = sumH / buffer.length;

    const newPoint: SurveyPoint = {
      id: `pt-${Date.now()}`,
      name: currentPointName,
      code: selectedCode,
      northing: Number(avgN.toFixed(4)),
      easting: Number(avgE.toFixed(4)),
      elevation: Number(avgZ.toFixed(4)),
      ellipsoidHeight: Number(avgH.toFixed(4)),
      poleHeight: poleHeight,
      fixQuality: gnss.fixQuality,
      satellites: gnss.satellites,
      hdop: gnss.hdop,
      stdDevH: Math.max(gnss.stdDevX, gnss.stdDevY),
      stdDevV: gnss.stdDevZ,
      timestamp: new Date().toISOString()
    };

    onSavePoint(newPoint);
    setPointNum(prev => prev + 1);

    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1200);

    const errCm = (newPoint.stdDevH * 100).toFixed(1);
    const qualStr = gnss.fixQuality === 4 ? '고정' : '플로트';
    voiceController.speak(`${currentPointName} 저장 완료. ${qualStr}, 오차 ${errCm}센티.`);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#ebf0f7] overflow-y-auto p-2.5 space-y-2.5 pb-4 select-none">
      {/* 1. 사이버 다크 고정밀 좌표 계기판 (레퍼런스 이미지의 다크 시계/우주 위젯 영감) */}
      <div className={`neu-dark rounded-2xl sm:rounded-3xl p-3 sm:p-3.5 transition-all duration-300 ${
        justSaved ? 'ring-4 ring-emerald-400/60 shadow-emerald-500/30' : ''
      }`}>
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-xs">
          <span className="font-bold text-slate-300 flex items-center gap-1.5 text-[11px] sm:text-xs">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
            중부원점 (EPSG:5186)
          </span>
          <span className="text-[10px] sm:text-[11px] font-mono text-cyan-400 font-bold bg-cyan-950/60 px-2 py-0.5 rounded-full border border-cyan-800/60">
            KNGeoid18 (N={gnss.geoidHeight.toFixed(2)}m)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm font-mono">
          <div className="neu-dark-inset p-2 sm:p-2.5 rounded-xl">
            <div className="text-[9px] text-slate-400 font-sans tracking-wide">X (North 북향)</div>
            <div className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
              {gnss.northing.toFixed(4)} <span className="text-[10px] font-normal text-slate-500">m</span>
            </div>
          </div>
          <div className="neu-dark-inset p-2 sm:p-2.5 rounded-xl">
            <div className="text-[9px] text-slate-400 font-sans tracking-wide">Y (East 동향)</div>
            <div className="text-lg sm:text-xl font-black text-white tracking-tight mt-0.5">
              {gnss.easting.toFixed(4)} <span className="text-[10px] font-normal text-slate-500">m</span>
            </div>
          </div>
          <div className="neu-dark-inset p-2 sm:p-2.5 rounded-xl border-emerald-500/30">
            <div className="text-[9px] text-emerald-400 font-sans font-bold tracking-wide">Z (표고 H)</div>
            <div className="text-lg sm:text-xl font-black text-emerald-300 tracking-tight mt-0.5">
              {gnss.orthoHeight.toFixed(4)} <span className="text-[10px] font-normal text-slate-500">m</span>
            </div>
          </div>
          <div className="neu-dark-inset p-2 sm:p-2.5 rounded-xl">
            <div className="text-[9px] text-slate-400 font-sans tracking-wide">h (타원체고)</div>
            <div className="text-lg sm:text-xl font-black text-slate-300 tracking-tight mt-0.5">
              {gnss.altitude.toFixed(4)} <span className="text-[10px] font-normal text-slate-500">m</span>
            </div>
          </div>
        </div>

        {/* 품질 보증 상태 */}
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400 px-1 font-mono border-t border-white/5 pt-1.5">
          <span>수평: ±{(gnss.stdDevX * 100).toFixed(1)}cm</span>
          <span>수직: ±{(gnss.stdDevZ * 100).toFixed(1)}cm</span>
          <span>에이지: {gnss.ageOfDiff.toFixed(1)}s</span>
        </div>
      </div>

      {/* 2. 측점 설정 (소프트 뉴모픽 패널) */}
      <div className="neu-flat rounded-2xl sm:rounded-3xl p-3 space-y-2.5">
        <div className="flex items-center gap-2.5">
          <div className="flex-1">
            <label className="text-[11px] font-bold text-slate-500 block mb-1">측점명 (자동증분)</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={pointPrefix}
                onChange={e => setPointPrefix(e.target.value)}
                className="w-16 neu-inset rounded-xl px-2 py-2 text-sm font-black text-center text-cyan-700 outline-none"
              />
              <input
                type="number"
                value={pointNum}
                onChange={e => setPointNum(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 neu-inset rounded-xl px-2 py-2 text-sm font-black text-center text-slate-800 outline-none font-mono"
              />
              <div className="flex-1 text-right text-xs font-mono text-slate-500">
                ➔ <span className="text-cyan-700 font-black text-sm">{currentPointName}</span>
              </div>
            </div>
          </div>

          <div className="w-24">
            <label className="text-[11px] font-bold text-slate-500 block mb-1">폴대고</label>
            <div className="neu-inset rounded-xl px-2 py-2 flex items-center text-sm font-black text-slate-800 font-mono">
              <input
                type="number"
                step="0.05"
                value={poleHeight}
                onChange={e => onSetPoleHeight(parseFloat(e.target.value) || 2.0)}
                className="w-full bg-transparent text-right outline-none"
              />
              <span className="text-xs text-slate-400 ml-1">m</span>
            </div>
          </div>
        </div>

        {/* 지목/구조물 빠른 선택 (소프트 토글 버튼들) */}
        <div>
          <label className="text-[11px] font-bold text-slate-500 block mb-1.5">구조물/지목 코드</label>
          <div className="flex flex-wrap gap-2">
            {DEFAULT_CODES.map(code => (
              <button
                key={code}
                onClick={() => setSelectedCode(code)}
                className={`px-3 py-1.5 rounded-full text-xs transition-all ${
                  selectedCode === code
                    ? 'neu-inset text-cyan-700 font-black bg-cyan-50/40'
                    : 'neu-btn text-slate-600 hover:text-slate-900 font-medium'
                }`}
              >
                {code}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. 에포크 평균 및 거대 뉴모픽 측정 버튼 */}
      <div className="neu-flat rounded-2xl sm:rounded-3xl p-3 sm:p-4 flex flex-col items-center justify-center space-y-3">
        {/* 에포크 캡슐 셀렉터 (레퍼런스 이미지의 날짜/요일 캡슐 영감) */}
        <div className="w-full flex items-center justify-between px-1 text-xs">
          <span className="font-bold text-slate-500">측정 모드</span>
          <div className="neu-inset rounded-2xl p-0.5 sm:p-1 flex gap-1 font-bold text-[11px] sm:text-xs">
            <button
              onClick={() => setEpochCount(1)}
              className={`px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl transition-all ${
                epochCount === 1 ? 'neu-flat text-cyan-700 font-black' : 'text-slate-500'
              }`}
            >
              1초 단발
            </button>
            <button
              onClick={() => setEpochCount(3)}
              className={`px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl transition-all ${
                epochCount === 3 ? 'neu-flat text-cyan-700 font-black' : 'text-slate-500'
              }`}
            >
              3초 평균
            </button>
            <button
              onClick={() => setEpochCount(5)}
              className={`px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-xl transition-all ${
                epochCount === 5 ? 'neu-flat text-cyan-700 font-black' : 'text-slate-500'
              }`}
            >
              5초 정밀
            </button>
          </div>
        </div>

        {/* 에포크 프로그레스 바 */}
        {isMeasuring && (
          <div className="w-full neu-inset rounded-full h-2 p-0.5 overflow-hidden">
            <div 
              className="bg-cyan-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${measureProgress}%` }}
            ></div>
          </div>
        )}

        {/* 큼직한 뉴모픽 촉감 측정 버튼 (모바일 화면 최적화 지름 108px) */}
        <button
          onClick={startMeasurement}
          disabled={isMeasuring}
          className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center transition-all active:scale-95 border-4 border-white ${
            gnss.fixQuality === 4
              ? 'neu-btn text-emerald-600'
              : 'neu-btn text-amber-600'
          }`}
          style={{
            boxShadow: '7px 7px 18px rgba(166, 175, 195, 0.55), -7px -7px 18px rgba(255, 255, 255, 0.95)'
          }}
        >
          <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full neu-inset flex flex-col items-center justify-center">
            <Target className={`w-6 h-6 sm:w-7 sm:h-7 mb-0.5 ${
              gnss.fixQuality === 4 ? 'text-emerald-500' : 'text-amber-500'
            } animate-pulse`} />
            <span className="font-black text-[11px] sm:text-xs text-slate-800 tracking-wider">
              {isMeasuring ? `${measureProgress}%` : '측정 / 기록'}
            </span>
          </div>
          <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold mt-0.5">
            (음성: "측정")
          </span>
        </button>
      </div>
    </div>
  );
};
