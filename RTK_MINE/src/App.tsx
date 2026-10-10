import React, { useState, useEffect } from 'react';
import { GnssState, SurveyPoint, StakeoutTarget, CoordSystemCode } from './types/gnss';
import { gnssManager } from './services/bluetoothManager';
import { ntripClient, NtripStatus } from './services/ntripClient';
import { getDefaultSiteDrawing, CadDrawing } from './services/dxfLoader';
import { HeaderStatusBar } from './components/HeaderStatusBar';
import { NavigationTabs, ActiveTab } from './components/NavigationTabs';
import { TopoSurveyView } from './components/TopoSurveyView';
import { StakeoutView } from './components/StakeoutView';
import { CadMapView } from './components/CadMapView';
import { PointsListView } from './components/PointsListView';
import { SettingsModal } from './components/SettingsModal';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('SURVEY');
  const [gnssState, setGnssState] = useState<GnssState>(gnssManager.getState());
  const [ntripStatus, setNtripStatus] = useState<NtripStatus>(ntripClient.getStatus());
  const [poleHeight, setPoleHeight] = useState<number>(2.0);
  const [selectedCoordCode, setSelectedCoordCode] = useState<CoordSystemCode>('EPSG:5186');

  // CAD 도면 상태
  const [drawing, setDrawing] = useState<CadDrawing>(getDefaultSiteDrawing());

  // 실측 성과 목록
  const [surveyedPoints, setSurveyedPoints] = useState<SurveyPoint[]>(() => {
    try {
      const saved = localStorage.getItem('smartfield_surveyed_points');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // 측설 타겟 목록 (CAD 맨홀/노드 + 기 실측점)
  const availableTargets: StakeoutTarget[] = [
    // CAD 맨홀들
    ...drawing.entities
      .filter(e => e.type === 'CIRCLE' || e.type === 'POINT')
      .map(e => ({
        id: e.id,
        name: e.text || e.id,
        northing: e.points[0]?.y || 0,
        easting: e.points[0]?.x || 0,
        elevation: e.points[0]?.z,
        code: e.layer
      })),
    // 실측점들
    ...surveyedPoints.map(p => ({
      id: p.id,
      name: p.name,
      northing: p.northing,
      easting: p.easting,
      elevation: p.elevation,
      code: p.code
    }))
  ];

  // GNSS 상태 및 NTRIP 구독
  useEffect(() => {
    const unsubGnss = gnssManager.onUpdate(setGnssState);
    const unsubNtrip = ntripClient.onStatus(setNtripStatus);

    // 기본적으로 시뮬레이션 모드로 즉시 동작시켜 필드 화면을 바로 확인 가능하도록 지원
    if (!gnssManager.getState().connected) {
      gnssManager.startSimulation();
    }

    return () => {
      unsubGnss();
      unsubNtrip();
    };
  }, []);

  // 성과 저장
  const handleSavePoint = (pt: SurveyPoint) => {
    setSurveyedPoints(prev => {
      const next = [pt, ...prev];
      localStorage.setItem('smartfield_surveyed_points', JSON.stringify(next));
      return next;
    });
  };

  const handleDeletePoint = (id: string) => {
    setSurveyedPoints(prev => {
      const next = prev.filter(p => p.id !== id);
      localStorage.setItem('smartfield_surveyed_points', JSON.stringify(next));
      return next;
    });
  };

  const handleClearAllPoints = () => {
    setSurveyedPoints([]);
    localStorage.removeItem('smartfield_surveyed_points');
  };

  const handleSelectStakeoutTarget = (target: StakeoutTarget) => {
    setActiveTab('STAKEOUT');
  };

  return (
    <div className="fixed inset-0 w-full h-[100dvh] flex flex-col bg-[#ebf0f7] text-slate-800 overflow-hidden font-sans select-none">
      {/* 1. 상단 고정 상태바 (shrink-0 필수) */}
      <div className="shrink-0 z-40">
        <HeaderStatusBar
          gnss={gnssState}
          ntripStatus={ntripStatus}
          onOpenSettings={() => setActiveTab('SETTINGS')}
        />
      </div>

      {/* 2. 메인 뷰 영역 (flex-1 min-h-0 로 정확한 영역 내 스크롤 보장) */}
      <main className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative">
        {activeTab === 'SURVEY' && (
          <TopoSurveyView
            gnss={gnssState}
            poleHeight={poleHeight}
            onSetPoleHeight={h => {
              setPoleHeight(h);
              gnssManager.setPoleHeight(h);
            }}
            onSavePoint={handleSavePoint}
            lastPointName={surveyedPoints[0]?.name || 'PT000'}
          />
        )}

        {activeTab === 'STAKEOUT' && (
          <StakeoutView
            gnss={gnssState}
            surveyedPoints={surveyedPoints}
            availableTargets={availableTargets}
            onMeasurePoint={() => {}}
            onSavePoint={handleSavePoint}
          />
        )}

        {activeTab === 'CAD_MAP' && (
          <CadMapView
            gnss={gnssState}
            drawing={drawing}
            onSelectStakeoutTarget={handleSelectStakeoutTarget}
            onLoadNewDrawing={setDrawing}
          />
        )}

        {activeTab === 'POINTS' && (
          <PointsListView
            points={surveyedPoints}
            onDeletePoint={handleDeletePoint}
            onClearAll={handleClearAllPoints}
            onSelectForStakeout={handleSelectStakeoutTarget}
          />
        )}

        {activeTab === 'SETTINGS' && (
          <SettingsModal
            gnss={gnssState}
            ntripStatus={ntripStatus}
            selectedCoordCode={selectedCoordCode}
            onSelectCoordCode={setSelectedCoordCode}
            poleHeight={poleHeight}
            onSetPoleHeight={h => {
              setPoleHeight(h);
              gnssManager.setPoleHeight(h);
            }}
          />
        )}
      </main>

      {/* 3. 하단 네비게이션 (shrink-0 으로 절대 잘리지 않음) */}
      <div className="shrink-0 z-50 w-full">
        <NavigationTabs
          activeTab={activeTab}
          onChangeTab={setActiveTab}
          pointsCount={surveyedPoints.length}
        />
      </div>
    </div>
  );
};

export default App;
