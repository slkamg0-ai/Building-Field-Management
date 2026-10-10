import React, { useState } from 'react';
import { 
  Bluetooth, 
  Usb, 
  Play, 
  Wifi, 
  Globe2, 
  Check, 
  Save, 
  Sliders 
} from 'lucide-react';
import { GnssState, CoordSystemCode } from '../types/gnss';
import { gnssManager } from '../services/bluetoothManager';
import { ntripClient, NtripStatus, NGII_PRESETS } from '../services/ntripClient';
import { COORD_SYSTEMS } from '../services/coordTransform';
import { calculateHelmertCalibration, CalibrationResult } from '../services/siteCalibration';

interface SettingsModalProps {
  gnss: GnssState;
  ntripStatus: NtripStatus;
  selectedCoordCode: CoordSystemCode;
  onSelectCoordCode: (code: CoordSystemCode) => void;
  poleHeight: number;
  onSetPoleHeight: (h: number) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  gnss,
  ntripStatus,
  selectedCoordCode,
  onSelectCoordCode,
  poleHeight,
  onSetPoleHeight
}) => {
  const [ntripForm, setNtripForm] = useState(ntripClient.getSettings());
  const [activeSubTab, setActiveSubTab] = useState<'DEVICE' | 'NTRIP' | 'COORD' | 'CALIB'>('DEVICE');
  const [savedMsg, setSavedMsg] = useState(false);

  const [calibResult, setCalibResult] = useState<CalibrationResult | null>(null);

  const handleApplyPreset = (preset: typeof NGII_PRESETS[0]) => {
    setNtripForm(prev => ({
      ...prev,
      host: preset.host,
      port: preset.port,
      mountpoint: preset.mountpoint
    }));
  };

  const handleSaveNtrip = () => {
    ntripClient.saveSettings(ntripForm);
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2000);
  };

  const handleRunCalibration = () => {
    const result = calculateHelmertCalibration([
      { id: '1', name: 'TBM-1', wgs84: { lat: 36.3501, lon: 127.3842, h: 69.8 }, local: { x: 417820.0, y: 176100.0, z: 46.5 } },
      { id: '2', name: 'TBM-2', wgs84: { lat: 36.3512, lon: 127.3855, h: 73.4 }, local: { x: 418000.0, y: 176320.0, z: 50.1 } }
    ]);
    setCalibResult(result);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#ebf0f7] overflow-y-auto p-2.5 space-y-2.5 pb-4 select-none">
      {/* 서브 탭 헤더 (뉴모픽 인셋 슬롯) */}
      <div className="neu-inset rounded-2xl p-1 flex text-xs font-black">
        <button
          onClick={() => setActiveSubTab('DEVICE')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeSubTab === 'DEVICE' ? 'neu-flat text-cyan-800' : 'text-slate-500'
          }`}
        >
          수신기 연결
        </button>
        <button
          onClick={() => setActiveSubTab('NTRIP')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeSubTab === 'NTRIP' ? 'neu-flat text-cyan-800' : 'text-slate-500'
          }`}
        >
          NTRIP 보정
        </button>
        <button
          onClick={() => setActiveSubTab('COORD')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeSubTab === 'COORD' ? 'neu-flat text-cyan-800' : 'text-slate-500'
          }`}
        >
          좌표계
        </button>
        <button
          onClick={() => setActiveSubTab('CALIB')}
          className={`flex-1 py-2 rounded-xl transition-all ${
            activeSubTab === 'CALIB' ? 'neu-flat text-cyan-800' : 'text-slate-500'
          }`}
        >
          점합치 (MG)
        </button>
      </div>

      {/* 1. 수신기 하드웨어 연결 */}
      {activeSubTab === 'DEVICE' && (
        <div className="neu-flat rounded-3xl p-4 space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <div>
              <span className="text-xs font-black text-slate-800 block">GNSS 하드웨어 연결</span>
              <span className="text-[11px] text-slate-500">
                현재 상태: {gnss.connected ? `${gnss.deviceName} (${gnss.source})` : '미연결'}
              </span>
            </div>
            {gnss.connected && (
              <button
                onClick={() => gnssManager.disconnect()}
                className="px-3 py-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold neu-btn"
              >
                연결 해제
              </button>
            )}
          </div>

          {/* 실시간 하드웨어 통신 검증 모니터 (진짜 연결되었는지 한눈에 100% 확인!) */}
          {gnss.connected && (
            <div className="neu-dark rounded-2xl p-3 space-y-2 border border-white/10 text-xs font-mono">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${
                    gnss.isReceivingData 
                      ? 'bg-emerald-400 animate-pulse' 
                      : 'bg-rose-500 animate-ping'
                  }`}></span>
                  <span className="font-bold text-slate-200 font-sans">
                    {gnss.isReceivingData ? '데이터 수신 중 (정상)' : 'NMEA 데이터 대기 중...'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="text-emerald-400 font-bold font-mono">
                    {gnss.packetHz ? `${gnss.packetHz} Hz` : '0 Hz'}
                  </span>
                  <span>|</span>
                  <span>{gnss.packetCount ? `${gnss.packetCount} pkts` : '0 pkts'}</span>
                </div>
              </div>

              {/* 최근 수신된 NMEA 원문 프리뷰 */}
              <div className="bg-slate-950/80 rounded-xl p-2 border border-white/5 text-[10px] text-cyan-300 break-all select-all font-mono leading-relaxed">
                {gnss.lastNmeaSentence ? (
                  gnss.lastNmeaSentence
                ) : (
                  <span className="text-amber-400 font-sans">
                    ⏳ 보드로부터 데이터 수신을 기다리고 있습니다. (보드 전원 및 안테나 연결 확인)
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-2.5 pt-1">
            {/* 1. WebUSB 모바일 유선 직결 (Android 스마트폰 공식 지원) */}
            <button
              onClick={() => gnssManager.connectWebUsb().catch(e => alert(e.message))}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl neu-btn text-slate-800 font-bold text-xs border border-emerald-500/30 bg-emerald-50/30"
            >
              <div className="flex items-center gap-3">
                <div className="neu-inset-sm p-2 rounded-xl text-emerald-600 bg-emerald-100/50">
                  <Usb className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="font-black text-slate-800 flex items-center gap-1.5">
                    <span>USB-C (WebUSB) 모바일 직결</span>
                    <span className="text-[9px] bg-emerald-600 text-white px-1.5 py-0.2 rounded-full font-bold">안드로이드 추천</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-normal">스마트폰 C타입 케이블 직결 (UM982/CH340/CP2102)</div>
                </div>
              </div>
              <span className="text-emerald-700 text-xs font-black">연결 ➔</span>
            </button>

            {/* 2. Web Bluetooth 무선 연결 */}
            <button
              onClick={() => gnssManager.connectBle().catch(e => alert(e.message))}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl neu-btn text-slate-800 font-bold text-xs"
            >
              <div className="flex items-center gap-3">
                <div className="neu-inset-sm p-2 rounded-xl text-cyan-600">
                  <Bluetooth className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="font-black text-slate-800">블루투스 (Web BLE) 무선 연결</div>
                  <div className="text-[10px] text-slate-400 font-normal">ESP32, HC-05, ZED-F9P 무선 모듈</div>
                </div>
              </div>
              <span className="text-cyan-700 text-xs font-black">탐색 ➔</span>
            </button>

            {/* 3. Web Serial 시리얼 포트 연결 (PC 크롬용) */}
            <button
              onClick={() => gnssManager.connectSerial().catch(e => alert(e.message))}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl neu-btn text-slate-700 font-bold text-xs opacity-90"
            >
              <div className="flex items-center gap-3">
                <div className="neu-inset-sm p-2 rounded-xl text-slate-600">
                  <Sliders className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="font-black text-slate-800">USB (Web Serial) 포트 연결</div>
                  <div className="text-[10px] text-slate-400 font-normal">PC/노트북 크롬 또는 가상 COM 포트 (115200bps)</div>
                </div>
              </div>
              <span className="text-slate-600 text-xs font-black">열기 ➔</span>
            </button>

            {/* 4. 현장 가상 시뮬레이션 모드 */}
            <button
              onClick={() => gnssManager.startSimulation()}
              className="w-full flex items-center justify-between p-3.5 rounded-2xl neu-btn text-cyan-800 font-bold text-xs bg-cyan-50/40"
            >
              <div className="flex items-center gap-3">
                <div className="neu-inset-sm p-2 rounded-xl text-cyan-600">
                  <Play className="w-5 h-5" />
                </div>
                <div className="text-left">
                  <div className="font-black text-cyan-900">현장 가상 시뮬레이션 모드</div>
                  <div className="text-[10px] text-cyan-600 font-normal">실제 도면 좌표 기반 RTK FIX 5Hz 가상 주행</div>
                </div>
              </div>
              <span className="text-cyan-700 text-xs font-black">시작 ➔</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. NTRIP 설정 */}
      {activeSubTab === 'NTRIP' && (
        <div className="neu-flat rounded-3xl p-4 space-y-3.5">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-200">
            <div>
              <span className="text-xs font-black text-slate-800 block">NTRIP Client 보정 설정</span>
              <span className="text-[11px] text-slate-500">{ntripStatus.lastMessage}</span>
            </div>
            <div className="flex items-center gap-2">
              {ntripStatus.connected ? (
                <button
                  onClick={() => ntripClient.disconnect()}
                  className="px-3 py-1.5 rounded-full bg-rose-50 text-rose-600 border border-rose-200 text-xs font-bold neu-btn"
                >
                  중단
                </button>
              ) : (
                <button
                  onClick={() => ntripClient.connect()}
                  className="px-3.5 py-1.5 rounded-full neu-btn bg-emerald-500 text-white text-xs font-black shadow-sm"
                >
                  연결 시작
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1.5">상용 Caster 빠른 선택</label>
            <div className="grid grid-cols-2 gap-2">
              {NGII_PRESETS.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => handleApplyPreset(p)}
                  className="p-2.5 rounded-2xl neu-btn text-left text-xs font-medium text-slate-700"
                >
                  <div className="font-black text-slate-800 truncate">{p.name}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{p.mountpoint}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Caster Host</label>
                <input
                  type="text"
                  value={ntripForm.host}
                  onChange={e => setNtripForm({ ...ntripForm, host: e.target.value })}
                  className="w-full neu-inset rounded-xl px-3 py-2 text-slate-800 font-mono font-bold outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">Port</label>
                <input
                  type="number"
                  value={ntripForm.port}
                  onChange={e => setNtripForm({ ...ntripForm, port: parseInt(e.target.value) || 2101 })}
                  className="w-full neu-inset rounded-xl px-3 py-2 text-slate-800 font-mono font-bold outline-none"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-bold text-slate-500 block mb-1">Mountpoint (마운트포인트)</label>
              <input
                type="text"
                value={ntripForm.mountpoint}
                onChange={e => setNtripForm({ ...ntripForm, mountpoint: e.target.value })}
                className="w-full neu-inset rounded-xl px-3 py-2 text-cyan-800 font-mono font-black outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">아이디 (User)</label>
                <input
                  type="text"
                  value={ntripForm.username}
                  onChange={e => setNtripForm({ ...ntripForm, username: e.target.value })}
                  placeholder="국토지리정보원 ID"
                  className="w-full neu-inset rounded-xl px-3 py-2 text-slate-800 outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] font-bold text-slate-500 block mb-1">비밀번호</label>
                <input
                  type="password"
                  value={ntripForm.password}
                  onChange={e => setNtripForm({ ...ntripForm, password: e.target.value })}
                  placeholder="Password"
                  className="w-full neu-inset rounded-xl px-3 py-2 text-slate-800 outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleSaveNtrip}
              className="w-full mt-2 py-2.5 rounded-2xl neu-btn text-slate-800 font-black flex items-center justify-center gap-1.5"
            >
              {savedMsg ? <Check className="w-4 h-4 text-emerald-600" /> : <Save className="w-4 h-4" />}
              <span>{savedMsg ? '설정 저장 완료!' : 'NTRIP 설정 저장'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 3. 좌표계 선택 */}
      {activeSubTab === 'COORD' && (
        <div className="neu-flat rounded-3xl p-4 space-y-3">
          <div className="text-xs font-black text-slate-800 pb-2 border-b border-slate-200">
            한국 표준 투영좌표계 선택
          </div>
          <div className="space-y-2">
            {Object.values(COORD_SYSTEMS).map(cs => {
              const isSelected = selectedCoordCode === cs.code;
              return (
                <button
                  key={cs.code}
                  onClick={() => onSelectCoordCode(cs.code)}
                  className={`w-full p-3 rounded-2xl text-left transition-all ${
                    isSelected 
                      ? 'neu-inset text-cyan-900 border-cyan-400 bg-cyan-50/30' 
                      : 'neu-btn text-slate-700 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-black text-xs">
                    <span>{cs.name}</span>
                    <span className="font-mono text-[11px] text-cyan-700">{cs.code}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{cs.origin}</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. 현장 캘리브레이션 (점합치) */}
      {activeSubTab === 'CALIB' && (
        <div className="neu-flat rounded-3xl p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-200">
            <div>
              <span className="text-xs font-black text-slate-800 block">현장 캘리브레이션 (점합치)</span>
              <span className="text-[11px] text-slate-500">TBM 기지점 대조 2D 헬머트 변환 매트릭스</span>
            </div>
            <button
              onClick={handleRunCalibration}
              className="px-3.5 py-1.5 rounded-full neu-btn bg-cyan-500 text-white text-xs font-black shadow-sm"
            >
              캘리브레이션 계산
            </button>
          </div>

          {calibResult ? (
            <div className="neu-dark rounded-2xl p-3.5 space-y-2 text-xs font-mono">
              <div className="text-emerald-400 font-black font-sans">
                ✓ 2D 헬머트 변환 파라미터 산출 완료
              </div>
              <div className="grid grid-cols-2 gap-2 text-slate-300">
                <div>dX: {calibResult.dx} m</div>
                <div>dY: {calibResult.dy} m</div>
                <div>회전각(θ): {calibResult.rotationDeg}°</div>
                <div>축척계수: {calibResult.scale}</div>
                <div>dZ(표고보정): {calibResult.dz} m</div>
                <div className="text-cyan-300 font-bold">수평오차: ±{(calibResult.rmsResidual2D * 100).toFixed(1)}cm</div>
              </div>
              <div className="text-[10px] text-slate-400 font-sans pt-1">
                ※ 이 파라미터는 굴착기 머신가이던스(MG) 제어 모듈에 그대로 전송할 수 있습니다.
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 neu-inset rounded-2xl">
              현장 기준점(TBM-1, TBM-2)을 측정한 후 [캘리브레이션 계산]을 실행하세요.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
