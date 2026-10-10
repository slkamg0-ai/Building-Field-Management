import React, { useState } from 'react';
import { 
  Download, 
  Share2, 
  Trash2, 
  Search, 
  FileSpreadsheet, 
  FileCode, 
  Copy, 
  Check, 
  Target 
} from 'lucide-react';
import { SurveyPoint, StakeoutTarget } from '../types/gnss';

interface PointsListViewProps {
  points: SurveyPoint[];
  onDeletePoint: (id: string) => void;
  onClearAll: () => void;
  onSelectForStakeout: (target: StakeoutTarget) => void;
}

export const PointsListView: React.FC<PointsListViewProps> = ({
  points,
  onDeletePoint,
  onClearAll,
  onSelectForStakeout
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  const filteredPoints = points.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.code.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const exportCsv = () => {
    if (points.length === 0) return;
    const header = ['점명', 'X(North)', 'Y(East)', 'Z(표고)', 'h(타원체고)', '폴대고', '구분', '품질', '수평오차(m)', '수직오차(m)', '측정시각'];
    const rows = points.map(p => [
      p.name,
      p.northing.toFixed(4),
      p.easting.toFixed(4),
      p.elevation.toFixed(4),
      p.ellipsoidHeight.toFixed(4),
      p.poleHeight.toFixed(2),
      p.code,
      p.fixQuality === 4 ? 'RTK FIX' : 'FLOAT',
      p.stdDevH.toFixed(3),
      p.stdDevV.toFixed(3),
      p.timestamp
    ]);

    const csvContent = '\uFEFF' + [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    downloadBlob(csvContent, `측량성과_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8;');
  };

  const exportDxf = () => {
    if (points.length === 0) return;
    let dxf = `0\nSECTION\n2\nENTITIES\n`;

    points.forEach(p => {
      dxf += `0\nPOINT\n8\nSURVEY_PTS\n10\n${p.easting}\n20\n${p.northing}\n30\n${p.elevation}\n`;
      dxf += `0\nTEXT\n8\nSURVEY_TEXT\n10\n${p.easting + 0.5}\n20\n${p.northing + 0.5}\n30\n${p.elevation}\n40\n0.8\n1\n${p.name}(${p.elevation.toFixed(2)})\n`;
    });

    dxf += `0\nENDSEC\n0\nEOF\n`;
    downloadBlob(dxf, `측량성과_${new Date().toISOString().slice(0, 10)}.dxf`, 'application/dxf');
  };

  const exportMgJson = () => {
    if (points.length === 0) return;
    const mgData = {
      project: 'MG_PRE_SURVEY',
      exportedAt: new Date().toISOString(),
      coordinateSystem: 'EPSG:5186',
      controlPoints: points.map(p => ({
        id: p.id,
        name: p.name,
        code: p.code,
        northing: p.northing,
        easting: p.easting,
        elevation: p.elevation
      }))
    };
    downloadBlob(JSON.stringify(mgData, null, 2), `MG_기준점연계_${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
  };

  const copyToClipboard = () => {
    if (points.length === 0) return;
    const lines = [
      `[현장 RTK 측량 성과 총 ${points.length}점]`,
      `일시: ${new Date().toLocaleString()}`,
      '--------------------------',
      ...points.map(p => `${p.name} | X:${p.northing.toFixed(3)} Y:${p.easting.toFixed(3)} Z:${p.elevation.toFixed(3)} (${p.code})`)
    ];
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadBlob = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[#ebf0f7] overflow-hidden p-2.5 space-y-2.5 pb-4 select-none">
      {/* 1. 상단 내보내기 및 관리 패널 (뉴모피즘 소프트 카드) */}
      <div className="neu-flat rounded-3xl p-3.5 space-y-3">
        <div className="flex items-center justify-between px-1">
          <div className="text-xs font-black text-slate-800">
            실측 성과 관리 <span className="text-cyan-700 font-mono">({points.length}점)</span>
          </div>
          {points.length > 0 && (
            <button
              onClick={() => {
                if (confirm('전체 측점을 삭제하시겠습니까?')) onClearAll();
              }}
              className="text-[11px] font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> 전체비우기
            </button>
          )}
        </div>

        {/* 내보내기 버튼 그리드 (소프트 뉴모픽 타일) */}
        <div className="grid grid-cols-4 gap-2 text-xs font-bold">
          <button
            onClick={exportCsv}
            disabled={points.length === 0}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl neu-btn text-slate-700 disabled:opacity-40"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 mb-1" />
            <span>CSV (엑셀)</span>
          </button>
          <button
            onClick={exportDxf}
            disabled={points.length === 0}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl neu-btn text-slate-700 disabled:opacity-40"
          >
            <FileCode className="w-5 h-5 text-cyan-600 mb-1" />
            <span>DXF (CAD)</span>
          </button>
          <button
            onClick={exportMgJson}
            disabled={points.length === 0}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl neu-btn text-slate-700 disabled:opacity-40"
          >
            <Download className="w-5 h-5 text-amber-600 mb-1" />
            <span>MG 포맷</span>
          </button>
          <button
            onClick={copyToClipboard}
            disabled={points.length === 0}
            className="flex flex-col items-center justify-center p-2.5 rounded-2xl neu-btn text-slate-700 disabled:opacity-40"
          >
            {copied ? <Check className="w-5 h-5 text-emerald-600 mb-1" /> : <Copy className="w-5 h-5 text-purple-600 mb-1" />}
            <span>{copied ? '복사됨!' : '카톡 복사'}</span>
          </button>
        </div>
      </div>

      {/* 2. 검색창 (뉴모픽 인셋 슬롯) */}
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
        <input
          type="text"
          placeholder="점명 또는 지목 검색..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="w-full neu-inset rounded-2xl pl-10 pr-3.5 py-2.5 text-xs text-slate-800 placeholder-slate-400 outline-none font-medium"
        />
      </div>

      {/* 3. 측점 목록 */}
      <div className="flex-1 overflow-y-auto space-y-2.5 pr-0.5">
        {filteredPoints.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-slate-400 text-xs">
            측정된 점이 없습니다. [수치측량] 탭에서 측정을 진행하세요.
          </div>
        ) : (
          filteredPoints.map(p => (
            <div
              key={p.id}
              className="neu-flat rounded-2xl p-3 flex items-center justify-between"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-slate-800 font-mono">{p.name}</span>
                  <span className="neu-inset-sm px-2 py-0.5 rounded-md text-[10px] font-bold text-slate-600">
                    {p.code}
                  </span>
                  <span className={`text-[10px] font-mono font-bold ${p.fixQuality === 4 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {p.fixQuality === 4 ? 'FIX' : 'FLOAT'} (±{(p.stdDevH * 100).toFixed(1)}cm)
                  </span>
                </div>
                <div className="text-[11px] font-mono text-slate-500 space-x-2">
                  <span>X:{p.northing.toFixed(3)}</span>
                  <span>Y:{p.easting.toFixed(3)}</span>
                  <span className="text-emerald-700 font-bold">Z:{p.elevation.toFixed(3)}m</span>
                </div>
              </div>

              {/* 측설 타겟 지정 및 삭제 */}
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onSelectForStakeout({
                    id: p.id,
                    name: p.name,
                    northing: p.northing,
                    easting: p.easting,
                    elevation: p.elevation
                  })}
                  className="p-2.5 rounded-xl neu-btn text-cyan-700 hover:text-cyan-900"
                  title="이 점을 측설 목표로 지정"
                >
                  <Target className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeletePoint(p.id)}
                  className="p-2.5 rounded-xl neu-btn text-rose-500 hover:text-rose-700"
                  title="삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
