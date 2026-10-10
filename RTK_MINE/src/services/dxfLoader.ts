import { CadEntity } from '../types/gnss';
import { LibreDwg, Dwg_File_Type } from '@mlightcad/libredwg-web';

export interface CadDrawing {
  name: string;
  format: 'DXF' | 'DWG' | 'DEFAULT';
  layers: string[];
  entities: CadEntity[];
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    centerX: number;
    centerY: number;
  };
}

let cachedLibreDwg: any = null;

/**
 * LibreDwg WebAssembly 싱글톤 인스턴스 초기화
 */
async function getLibreDwgInstance(): Promise<any> {
  if (cachedLibreDwg) return cachedLibreDwg;
  try {
    // 브라우저 public 폴더의 wasm 파일 경로 전달
    const instance = await LibreDwg.create('/wasm');
    cachedLibreDwg = instance;
    return instance;
  } catch (err) {
    console.warn('/wasm 경로 로드 실패, 루트 경로 재시도:', err);
    const instance = await LibreDwg.create('');
    cachedLibreDwg = instance;
    return instance;
  }
}

/**
 * 프로젝트 내 기본 오수 관로/맨홀 CAD 도면 데이터 생성
 * (Osu_plan_2_simple.dxf 실제 좌표 반영)
 */
export function getDefaultSiteDrawing(): CadDrawing {
  const sampleManholes = [
    { name: "M2-212", x: 176219.13, y: 417970.18, depth: 5.47, el: 48.25 },
    { name: "M2-235", x: 176165.72, y: 417911.29, depth: 3.40, el: 47.80 },
    { name: "M2-234", x: 176120.52, y: 417865.93, depth: 3.00, el: 47.10 },
    { name: "M2-233", x: 176133.76, y: 417848.85, depth: 2.57, el: 46.90 },
    { name: "M2-210", x: 176295.95, y: 417904.54, depth: 5.38, el: 49.12 },
    { name: "M2-211", x: 176247.23, y: 417922.45, depth: 5.75, el: 48.90 },
    { name: "M2-209", x: 176340.10, y: 417880.20, depth: 4.80, el: 49.50 },
    { name: "TBM-1",  x: 176100.00, y: 417820.00, depth: 0.00, el: 46.50 },
    { name: "TBM-2",  x: 176320.00, y: 418000.00, depth: 0.00, el: 50.10 }
  ];

  const entities: CadEntity[] = [];
  const layers = new Set<string>(['MANHOLE', 'PIPE_LINE', 'TEXT_LABEL', 'ROAD_BORDER', 'TBM']);

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  // 1. 관로 폴리라인 연결
  const pipePoints = sampleManholes.filter(m => !m.name.startsWith('TBM')).map(m => ({ x: m.x, y: m.y }));
  entities.push({
    id: 'pipe-osu-main',
    type: 'LWPOLYLINE',
    layer: 'PIPE_LINE',
    color: '#06b6d4', // Cyan
    points: pipePoints
  });

  // 도로 경계선 가상 생성 (관로 좌우 4m 오프셋)
  const roadLeft = pipePoints.map(p => ({ x: p.x - 4, y: p.y + 4 }));
  const roadRight = pipePoints.map(p => ({ x: p.x + 4, y: p.y - 4 }));
  entities.push({
    id: 'road-border-left',
    type: 'LWPOLYLINE',
    layer: 'ROAD_BORDER',
    color: '#64748b',
    points: roadLeft
  });
  entities.push({
    id: 'road-border-right',
    type: 'LWPOLYLINE',
    layer: 'ROAD_BORDER',
    color: '#64748b',
    points: roadRight
  });

  // 2. 맨홀 심볼 및 텍스트
  sampleManholes.forEach((m, idx) => {
    minX = Math.min(minX, m.x);
    maxX = Math.max(maxX, m.x);
    minY = Math.min(minY, m.y);
    maxY = Math.max(maxY, m.y);

    const isTbm = m.name.startsWith('TBM');
    const layer = isTbm ? 'TBM' : 'MANHOLE';
    const color = isTbm ? '#f59e0b' : '#3b82f6';

    // 중심 서클 / 점
    entities.push({
      id: `mh-circle-${idx}`,
      type: 'CIRCLE',
      layer,
      color,
      radius: isTbm ? 1.5 : 1.0,
      points: [{ x: m.x, y: m.y, z: m.el }]
    });

    // 텍스트 라벨
    entities.push({
      id: `mh-text-${idx}`,
      type: 'TEXT',
      layer: 'TEXT_LABEL',
      color: '#f8fafc',
      points: [{ x: m.x + 1.2, y: m.y + 1.2, z: m.el }],
      text: `${m.name} (EL:${m.el.toFixed(2)})`
    });
  });

  return {
    name: '오수간선 계획평면도 (Osu_plan_2_simple.dxf)',
    format: 'DEFAULT',
    layers: Array.from(layers),
    entities,
    bounds: {
      minX: minX - 20,
      maxX: maxX + 20,
      minY: minY - 20,
      maxY: maxY + 20,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    }
  };
}

/**
 * 표준 DXF 파일 텍스트 파싱
 */
export function parseDxfText(dxfContent: string, fileName = '업로드 DXF 도면'): CadDrawing {
  const lines = dxfContent.split(/\r?\n/);
  const entities: CadEntity[] = [];
  const layers = new Set<string>();

  let i = 0;
  let inEntitiesSection = false;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  while (i < lines.length - 1) {
    const code = lines[i].trim();
    const val = lines[i + 1].trim();
    i += 2;

    if (code === '0' && val === 'SECTION') {
      if (i < lines.length && lines[i].trim() === '2' && lines[i + 1].trim() === 'ENTITIES') {
        inEntitiesSection = true;
      }
    } else if (code === '0' && val === 'ENDSEC') {
      inEntitiesSection = false;
    }

    if (inEntitiesSection && code === '0') {
      const entityType = val; // LINE, LWPOLYLINE, TEXT, POINT, CIRCLE
      let currentLayer = '0';
      const pts: { x: number; y: number; z?: number }[] = [];
      let curX = 0, curY = 0, curZ = 0;
      let textContent = '';
      let radius = 1.0;

      while (i < lines.length - 1 && lines[i].trim() !== '0') {
        const c = lines[i].trim();
        const v = lines[i + 1].trim();
        i += 2;

        if (c === '8') {
          currentLayer = v;
          layers.add(v);
        } else if (c === '10') {
          curX = parseFloat(v);
        } else if (c === '20') {
          curY = parseFloat(v);
          pts.push({ x: curX, y: curY, z: curZ });
          minX = Math.min(minX, curX);
          maxX = Math.max(maxX, curX);
          minY = Math.min(minY, curY);
          maxY = Math.max(maxY, curY);
        } else if (c === '30') {
          curZ = parseFloat(v);
        } else if (c === '11') {
          curX = parseFloat(v);
        } else if (c === '21') {
          curY = parseFloat(v);
          pts.push({ x: curX, y: curY, z: curZ });
        } else if (c === '1') {
          textContent = v;
        } else if (c === '40') {
          radius = parseFloat(v);
        }
      }

      if (['LINE', 'LWPOLYLINE', 'TEXT', 'POINT', 'CIRCLE'].includes(entityType)) {
        entities.push({
          id: `ent-${entities.length}`,
          type: entityType as any,
          layer: currentLayer,
          points: pts,
          text: textContent,
          radius
        });
      }
    }
  }

  if (entities.length === 0) {
    return getDefaultSiteDrawing();
  }

  return {
    name: fileName,
    format: 'DXF',
    layers: Array.from(layers),
    entities,
    bounds: {
      minX: minX === Infinity ? 0 : minX - 10,
      maxX: maxX === -Infinity ? 100 : maxX + 10,
      minY: minY === Infinity ? 0 : minY - 10,
      maxY: maxY === -Infinity ? 100 : maxY + 10,
      centerX: (minX + maxX) / 2,
      centerY: (minY + maxY) / 2
    }
  };
}

/**
 * AutoCAD 바이너리 DWG 파일 파싱 (WebAssembly LibreDWG 기반)
 */
export async function parseDwgArrayBuffer(buffer: ArrayBuffer, fileName = '업로드 DWG 도면'): Promise<CadDrawing> {
  const libredwg = await getLibreDwgInstance();

  // 1. dwg_write_dxf를 통해 DXF로 변환 시도
  try {
    const dxfBytes = libredwg.dwg_write_dxf(buffer);
    if (dxfBytes && dxfBytes.length > 0) {
      const dxfText = new TextDecoder('utf-8').decode(dxfBytes);
      const drawing = parseDxfText(dxfText, fileName);
      drawing.format = 'DWG';
      return drawing;
    }
  } catch (e) {
    console.warn('dwg_write_dxf 변환 실패, dwg_read_data 직접 파싱 시도:', e);
  }

  // 2. 직접 dwg_read_data 및 DwgDatabase 변환
  const dwgDataPtr = libredwg.dwg_read_data(buffer, Dwg_File_Type.DWG);
  if (!dwgDataPtr) {
    throw new Error('DWG 파일을 디코딩할 수 없습니다. 손상되었거나 암호화된 파일일 수 있습니다.');
  }

  try {
    const db = libredwg.convert(dwgDataPtr);
    const entities: CadEntity[] = [];
    const layers = new Set<string>();

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    if (db && Array.isArray(db.entities)) {
      db.entities.forEach((ent: any, idx: number) => {
        const layer = ent.layer || '0';
        layers.add(layer);

        if (ent.type === 'LINE' && ent.startPoint && ent.endPoint) {
          const pts = [
            { x: ent.startPoint.x, y: ent.startPoint.y, z: ent.startPoint.z },
            { x: ent.endPoint.x, y: ent.endPoint.y, z: ent.endPoint.z }
          ];
          minX = Math.min(minX, ent.startPoint.x, ent.endPoint.x);
          maxX = Math.max(maxX, ent.startPoint.x, ent.endPoint.x);
          minY = Math.min(minY, ent.startPoint.y, ent.endPoint.y);
          maxY = Math.max(maxY, ent.startPoint.y, ent.endPoint.y);

          entities.push({
            id: `dwg-line-${idx}`,
            type: 'LINE',
            layer,
            points: pts
          });
        } else if ((ent.type === 'LWPOLYLINE' || ent.type === 'POLYLINE') && Array.isArray(ent.vertices)) {
          const pts = ent.vertices.map((v: any) => {
            minX = Math.min(minX, v.x);
            maxX = Math.max(maxX, v.x);
            minY = Math.min(minY, v.y);
            maxY = Math.max(maxY, v.y);
            return { x: v.x, y: v.y, z: v.z };
          });
          if (pts.length > 0) {
            entities.push({
              id: `dwg-poly-${idx}`,
              type: 'LWPOLYLINE',
              layer,
              points: pts
            });
          }
        } else if (ent.type === 'CIRCLE' && ent.center) {
          minX = Math.min(minX, ent.center.x);
          maxX = Math.max(maxX, ent.center.x);
          minY = Math.min(minY, ent.center.y);
          maxY = Math.max(maxY, ent.center.y);

          entities.push({
            id: `dwg-circle-${idx}`,
            type: 'CIRCLE',
            layer,
            radius: ent.radius || 1.0,
            points: [{ x: ent.center.x, y: ent.center.y, z: ent.center.z }]
          });
        } else if ((ent.type === 'TEXT' || ent.type === 'MTEXT') && ent.insertionPoint) {
          minX = Math.min(minX, ent.insertionPoint.x);
          maxX = Math.max(maxX, ent.insertionPoint.x);
          minY = Math.min(minY, ent.insertionPoint.y);
          maxY = Math.max(maxY, ent.insertionPoint.y);

          entities.push({
            id: `dwg-text-${idx}`,
            type: 'TEXT',
            layer,
            text: ent.text || '',
            points: [{ x: ent.insertionPoint.x, y: ent.insertionPoint.y, z: ent.insertionPoint.z }]
          });
        } else if (ent.type === 'POINT' && ent.location) {
          minX = Math.min(minX, ent.location.x);
          maxX = Math.max(maxX, ent.location.x);
          minY = Math.min(minY, ent.location.y);
          maxY = Math.max(maxY, ent.location.y);

          entities.push({
            id: `dwg-pt-${idx}`,
            type: 'POINT',
            layer,
            points: [{ x: ent.location.x, y: ent.location.y, z: ent.location.z }]
          });
        }
      });
    }

    return {
      name: fileName,
      format: 'DWG',
      layers: Array.from(layers),
      entities,
      bounds: {
        minX: minX === Infinity ? 0 : minX - 10,
        maxX: maxX === -Infinity ? 100 : maxX + 10,
        minY: minY === Infinity ? 0 : minY - 10,
        maxY: maxY === -Infinity ? 100 : maxY + 10,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2
      }
    };
  } finally {
    libredwg.dwg_free(dwgDataPtr);
  }
}

/**
 * CAD 파일 (DWG 또는 DXF) 자동 판별 및 파싱 통합 함수
 */
export async function parseCadFile(file: File): Promise<CadDrawing> {
  const isDwg = file.name.toLowerCase().endsWith('.dwg');

  if (isDwg) {
    const buffer = await file.arrayBuffer();
    return await parseDwgArrayBuffer(buffer, file.name);
  } else {
    const text = await file.text();
    return parseDxfText(text, file.name);
  }
}

/**
 * 마우스/터치 클릭 좌표 근처에서 가장 가까운 도면 정점/노드 탐색 (스냅 기능)
 */
export function findNearestCadNode(
  drawing: CadDrawing,
  clickX: number,
  clickY: number,
  snapDistanceMeters = 5.0
): { entity: CadEntity; point: { x: number; y: number; z?: number }; dist: number } | null {
  let nearest: any = null;
  let minDist = snapDistanceMeters;

  for (const ent of drawing.entities) {
    for (const pt of ent.points) {
      const d = Math.hypot(pt.x - clickX, pt.y - clickY);
      if (d < minDist) {
        minDist = d;
        nearest = { entity: ent, point: pt, dist: d };
      }
    }
  }

  return nearest;
}
