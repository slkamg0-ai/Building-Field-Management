import { CalibrationPoint } from '../types/gnss';

export interface CalibrationResult {
  numPoints: number;
  dx: number;        // X 평행이동 (m)
  dy: number;        // Y 평행이동 (m)
  rotationDeg: number;// 회전각 (도)
  scale: number;     // 축척계수 (ppm)
  dz: number;        // 표고 보정 (m)
  rmsResidual2D: number; // 수평 평균 잔차 (m)
  rmsResidualZ: number;  // 수직 평균 잔차 (m)
}

/**
 * 2D 헬머트 4변수 변환 및 표고 1D 시프트 계산 (현장 캘리브레이션 / 점합치)
 */
export function calculateHelmertCalibration(points: CalibrationPoint[]): CalibrationResult | null {
  if (points.length < 2) {
    return null; // 최소 2점 이상 필요
  }

  // 1. 무게중심(Centroid) 계산
  let sumWgsX = 0, sumWgsY = 0, sumWgsZ = 0;
  let sumLocX = 0, sumLocY = 0, sumLocZ = 0;
  const n = points.length;

  points.forEach(p => {
    // WGS84 좌표를 TM 좌표계로 1차 투영한 값을 기준으로 점합치 수행
    sumWgsX += p.wgs84.lat; // or TM Northing
    sumWgsY += p.wgs84.lon; // or TM Easting
    sumWgsZ += p.wgs84.h;
    sumLocX += p.local.x;
    sumLocY += p.local.y;
    sumLocZ += p.local.z;
  });

  const meanWgsX = sumWgsX / n;
  const meanWgsY = sumWgsY / n;
  const meanWgsZ = sumWgsZ / n;

  const meanLocX = sumLocX / n;
  const meanLocY = sumLocY / n;
  const meanLocZ = sumLocZ / n;

  // 2. 중심화 좌표
  let numA = 0, numB = 0, den = 0;
  for (const p of points) {
    const u = p.wgs84.lat - meanWgsX;
    const v = p.wgs84.lon - meanWgsY;
    const x = p.local.x - meanLocX;
    const y = p.local.y - meanLocY;

    numA += u * x + v * y;
    numB += u * y - v * x;
    den += u * u + v * v;
  }

  if (den === 0) return null;

  const a = numA / den;
  const b = numB / den;

  const scale = Math.hypot(a, b);
  const rotationRad = Math.atan2(b, a);
  const rotationDeg = rotationRad * (180 / Math.PI);

  const dx = meanLocX - (a * meanWgsX - b * meanWgsY);
  const dy = meanLocY - (b * meanWgsX + a * meanWgsY);
  const dz = meanLocZ - meanWgsZ;

  // 잔차(Residual) 계산
  let sumSq2D = 0;
  let sumSqZ = 0;

  points.forEach(p => {
    const calcX = a * p.wgs84.lat - b * p.wgs84.lon + dx;
    const calcY = b * p.wgs84.lat + a * p.wgs84.lon + dy;
    const calcZ = p.wgs84.h + dz;

    const resX = p.local.x - calcX;
    const resY = p.local.y - calcY;
    const resZ = p.local.z - calcZ;

    p.residualX = Number(resX.toFixed(4));
    p.residualY = Number(resY.toFixed(4));
    p.residualZ = Number(resZ.toFixed(4));

    sumSq2D += resX * resX + resY * resY;
    sumSqZ += resZ * resZ;
  });

  return {
    numPoints: n,
    dx: Number(dx.toFixed(4)),
    dy: Number(dy.toFixed(4)),
    rotationDeg: Number(rotationDeg.toFixed(6)),
    scale: Number(scale.toFixed(6)),
    dz: Number(dz.toFixed(4)),
    rmsResidual2D: Number(Math.sqrt(sumSq2D / n).toFixed(4)),
    rmsResidualZ: Number(Math.sqrt(sumSqZ / n).toFixed(4))
  };
}
