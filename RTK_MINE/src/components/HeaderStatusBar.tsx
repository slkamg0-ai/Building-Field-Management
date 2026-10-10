import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Satellite, 
  Mic, 
  MicOff, 
  Bluetooth, 
  Usb,
  Wifi, 
  Battery, 
  BatteryCharging,
  Sparkles,
  Clock
} from 'lucide-react';
import { GnssState } from '../types/gnss';
import { voiceController } from '../services/voiceController';
import { NtripStatus } from '../services/ntripClient';

interface HeaderStatusBarProps {
  gnss: GnssState;
  ntripStatus: NtripStatus;
  onOpenSettings: () => void;
}

export const HeaderStatusBar: React.FC<HeaderStatusBarProps> = ({
  gnss,
  ntripStatus,
  onOpenSettings
}) => {
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleVoiceToggle = () => {
    const active = voiceController.toggleListening();
    setIsVoiceActive(active);
  };

  const timeHour = currentTime.getHours().toString().padStart(2, '0');
  const timeMin = currentTime.getMinutes().toString().padStart(2, '0');
  const dayNames = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const dayName = dayNames[currentTime.getDay()];
  const dateStr = `${currentTime.getFullYear()}.${(currentTime.getMonth() + 1).toString().padStart(2, '0')}.${currentTime.getDate().toString().padStart(2, '0')}`;

  const getFixBadge = () => {
    switch (gnss.fixQuality) {
      case 4:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/30 text-xs font-black tracking-wider shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            RTK FIX
          </div>
        );
      case 5:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 border border-amber-500/30 text-xs font-black tracking-wider">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span>
            FLOAT
          </div>
        );
      case 2:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-500/10 text-blue-700 border border-blue-500/30 text-xs font-bold">
            DGPS
          </div>
        );
      case 1:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/10 text-rose-700 border border-rose-500/30 text-xs font-bold">
            SINGLE
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-300 text-slate-600 text-xs font-bold">
            NO FIX
          </div>
        );
    }
  };

  return (
    <header className="w-full bg-[#ebf0f7] px-3.5 pt-2 pb-2.5 select-none z-40 border-b border-white/60">
      {/* 1. 최상단 미니 헤더: 시간 + 상태 배지 + 배터리 */}
      <div className="flex items-center justify-between mb-2">
        {/* 디지털 시계 (레퍼런스 이미지의 07:37 타이포그래피 영감) */}
        <div className="flex items-baseline gap-1.5">
          <span className="text-xl font-black text-slate-800 tracking-tight font-mono">{timeHour}:{timeMin}</span>
          <span className="text-[10px] font-bold text-slate-500 uppercase">{dayName}</span>
          <span className="text-[10px] font-mono text-slate-400 hidden xs:inline">{dateStr}</span>
        </div>

        {/* 상태 배지들 (NTRIP, BT, 음성) */}
        <div className="flex items-center gap-1.5">
          {/* 하드웨어 연결 상태 */}
          <button 
            onClick={onOpenSettings}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
              gnss.connected 
                ? 'neu-btn text-cyan-700 border-cyan-400/40 bg-cyan-50/50' 
                : 'neu-inset-sm text-slate-400'
            }`}
          >
            {gnss.source === 'usb' || gnss.source === 'serial' ? (
              <Usb className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <Bluetooth className="w-3.5 h-3.5 text-cyan-600" />
            )}
            <span>{gnss.source === 'simulation' ? '가상' : gnss.connected ? (gnss.source === 'usb' ? 'USB' : 'GNSS') : '미연결'}</span>
          </button>

          {/* NTRIP Caster 상태 */}
          <button 
            onClick={onOpenSettings}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
              ntripStatus.connected 
                ? 'neu-btn text-blue-700 border-blue-400/40 bg-blue-50/50' 
                : 'neu-inset-sm text-slate-400'
            }`}
          >
            <Wifi className="w-3.5 h-3.5 text-blue-600" />
            <span>NTRIP</span>
          </button>

          {/* 음성인식 토글 버튼 (소프트 뉴모픽 스위치) */}
          <button
            onClick={handleVoiceToggle}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
              isVoiceActive 
                ? 'bg-rose-500 text-white shadow-md shadow-rose-500/30 animate-pulse' 
                : 'neu-btn text-slate-700 hover:text-slate-900'
            }`}
            title="음성인식 측량 ('측정', '기록', '찍어')"
          >
            {isVoiceActive ? <Mic className="w-3.5 h-3.5 text-white" /> : <MicOff className="w-3.5 h-3.5 text-slate-400" />}
            <span>{isVoiceActive ? '음성대기' : '음성'}</span>
          </button>
        </div>
      </div>

      {/* 2. GNSS 퀄리티 뉴모피즘 상태 바 */}
      <div className="neu-flat rounded-2xl p-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onOpenSettings} className="hover:opacity-80 transition-opacity">
            {getFixBadge()}
          </button>

          <div className="flex items-center gap-1.5 text-xs font-mono">
            <div className="neu-inset-sm px-2 py-0.5 rounded-lg flex items-center gap-1 text-slate-700">
              <Satellite className="w-3.5 h-3.5 text-cyan-600" />
              <span className="font-black">{gnss.satellites}</span>
            </div>

            <div className="neu-inset-sm px-2 py-0.5 rounded-lg flex items-center gap-1 text-slate-700">
              <span className="text-[10px] text-slate-400">HDOP</span>
              <span className={`font-black ${gnss.hdop < 1.0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {gnss.hdop.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* 오차 및 시차 (Age) */}
        <div className="flex items-center gap-2 text-xs font-mono text-slate-600 pr-1">
          <span className="font-bold text-emerald-700">
            ±{(Math.max(gnss.stdDevX, gnss.stdDevY) * 100).toFixed(1)}cm
          </span>
          <span className="text-[11px] text-slate-400">
            {gnss.ageOfDiff.toFixed(1)}s
          </span>
        </div>
      </div>
    </header>
  );
};
