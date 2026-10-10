// GPS / GNSS RTK Core Types

export type GnssFixQuality = 
  | 0 // Invalid / No Fix
  | 1 // GPS Single / Autonomous (오차 ~2.5m)
  | 2 // DGPS / SBAS (오차 ~0.5m)
  | 4 // RTK FIX (정밀 고정해, 오차 1~2cm)
  | 5 // RTK FLOAT (부동해, 오차 10~50cm)
  | 6 // Dead Reckoning (추측항법);

export interface GnssState {
  connected: boolean;
  source: 'bluetooth' | 'serial' | 'usb' | 'simulation' | 'disconnected';
  deviceName?: string;
  fixQuality: GnssFixQuality;
  fixQualityLabel: 'RTK FIX' | 'RTK FLOAT' | 'DGPS' | 'SINGLE' | 'NO FIX';
  latitude: number;       // WGS84 위도 (deg)
  longitude: number;      // WGS84 경도 (deg)
  altitude: number;       // 타원체고 h (m)
  orthoHeight: number;    // 표고 H (m) = h - geoid - pole
  geoidHeight: number;    // 지오이드고 N (m)
  northing: number;       // TM X 좌표 (북향 m)
  easting: number;        // TM Y 좌표 (동향 m)
  satellites: number;     // 수신 위성수
  hdop: number;           // 수평정밀도저하율
  vdop: number;           // 수직정밀도저하율
  speedKmh: number;       // 이동 속도 (km/h)
  headingDeg: number;     // 이동 방위각 (deg)
  ageOfDiff: number;      // 보정신호 수신 시차 (초)
  stdDevX: number;        // 수평 표준편차 (m)
  stdDevY: number;        // 수평 표준편차 (m)
  stdDevZ: number;        // 수직 표준편차 (m)
  timestamp: number;
}

export interface SurveyPoint {
  id: string;
  name: string;           // 점명 (예: PT001, TBM-1, MH01)
  code: string;           // 지목/구조물 코드 (예: 맨홀, 도로, 관로, 자연지반, TBM)
  northing: number;       // X (m)
  easting: number;        // Y (m)
  elevation: number;      // Z 표고 (m)
  ellipsoidHeight: number;// h 타원체고 (m)
  poleHeight: number;     // 안테나/폴대고 (m)
  fixQuality: GnssFixQuality;
  satellites: number;
  hdop: number;
  stdDevH: number;        // 수평 오차 (m)
  stdDevV: number;        // 수직 오차 (m)
  timestamp: string;      // ISO String
  memo?: string;
}

export interface StakeoutTarget {
  id: string;
  name: string;
  northing: number;       // 목표 X
  easting: number;        // 목표 Y
  elevation?: number;     // 목표 Z (설계고)
  code?: string;
}

export interface StakeoutDelta {
  target: StakeoutTarget;
  distance2D: number;     // 수평 거리 (m)
  deltaX: number;         // 북향 잔차 (Target.X - Current.X)
  deltaY: number;         // 동향 잔차 (Target.Y - Current.Y)
  deltaH: number;         // 높이 잔차 (Target.Z - Current.Z)
  cutFill: 'CUT' | 'FILL' | 'OK'; // CUT(절토), FILL(성토)
  azimuthDeg: number;     // 현재 위치 -> 목표점 방위각 (0~360)
  relativeHeading: number;// 작업자 진행방향 기준 상대 각도 (-180 ~ +180)
  forwardDist: number;    // 진행방향 기준 전진(+) / 후진(-) 거리
  rightDist: number;      // 진행방향 기준 우측(+) / 좌측(-) 거리
  inTolerance: boolean;   // 허용오차 (예: 2cm 이내) 진입 여부
}

export interface NtripSettings {
  host: string;
  port: number;
  mountpoint: string;
  username: string;
  password: string;
  autoSendGga: boolean;
  sendIntervalSec: number;
}

export type CoordSystemCode = 'EPSG:5186' | 'EPSG:5185' | 'EPSG:5187' | 'EPSG:5188' | 'EPSG:5179' | 'EPSG:5174';

export interface CoordSystemInfo {
  code: CoordSystemCode;
  name: string;
  origin: string;
  proj4Def: string;
}

export interface CadEntity {
  id: string;
  type: 'LINE' | 'LWPOLYLINE' | 'CIRCLE' | 'TEXT' | 'POINT';
  layer: string;
  color?: string;
  points: { x: number; y: number; z?: number }[];
  text?: string;
  radius?: number;
}

export interface CalibrationPoint {
  id: string;
  name: string;
  wgs84: { lat: number; lon: number; h: number };
  local: { x: number; y: number; z: number };
  residualX?: number;
  residualY?: number;
  residualZ?: number;
}
