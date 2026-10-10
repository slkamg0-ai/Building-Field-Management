import { GnssFixQuality } from '../types/gnss';

export interface ParsedNmeaData {
  time?: string;
  lat?: number;
  lon?: number;
  altitude?: number;       // 타원체고 or MSL 고도
  geoidSep?: number;
  fixQuality?: GnssFixQuality;
  satellites?: number;
  hdop?: number;
  ageOfDiff?: number;
  speedKmh?: number;
  headingDeg?: number;
  stdDevX?: number;        // 수평 오차 (m)
  stdDevY?: number;
  stdDevZ?: number;        // 수직 오차 (m)
}

/**
 * NMEA N/S, E/W 좌표 형식(ddmm.mmmm)을 십진도(Decimal Degrees)로 변환
 * 예: 3734.1234 -> 37 + 34.1234 / 60 = 37.5687233
 */
function parseNmeaCoord(val: string, dir: string): number | undefined {
  if (!val || !dir) return undefined;
  const num = parseFloat(val);
  if (isNaN(num)) return undefined;

  const degLength = dir === 'N' || dir === 'S' ? 2 : 3;
  const degrees = parseInt(val.substring(0, degLength), 10);
  const minutes = parseFloat(val.substring(degLength));
  let dec = degrees + minutes / 60;

  if (dir === 'S' || dir === 'W') {
    dec = -dec;
  }
  return dec;
}

/**
 * NMEA 체크섬 검증
 */
export function verifyNmeaChecksum(sentence: string): boolean {
  if (!sentence.startsWith('$')) return false;
  const asteriskIdx = sentence.indexOf('*');
  if (asteriskIdx === -1) return true; // 체크섬 생략된 경우 허용

  const content = sentence.substring(1, asteriskIdx);
  const expectedHex = sentence.substring(asteriskIdx + 1, asteriskIdx + 3);
  if (!expectedHex || expectedHex.length < 2) return true;

  let checksum = 0;
  for (let i = 0; i < content.length; i++) {
    checksum ^= content.charCodeAt(i);
  }

  const calculatedHex = checksum.toString(16).toUpperCase().padStart(2, '0');
  return calculatedHex === expectedHex.toUpperCase();
}

/**
 * NMEA 단일 문장 파싱
 */
export function parseNmeaSentence(raw: string): ParsedNmeaData | null {
  const sentence = raw.trim();
  if (!sentence.startsWith('$')) return null;

  const parts = sentence.split('*')[0].split(',');
  const type = parts[0].substring(3); // 'GGA', 'RMC', 'GST', 'VTG'

  const result: ParsedNmeaData = {};

  try {
    if (type === 'GGA') {
      // $GNGGA,hhmmss.ss,llll.ll,a,yyyyy.yy,a,x,xx,x.x,x.x,M,x.x,M,x.x,xxxx
      const timeStr = parts[1];
      const latStr = parts[2];
      const latDir = parts[3];
      const lonStr = parts[4];
      const lonDir = parts[5];
      const fixQual = parseInt(parts[6], 10);
      const sats = parseInt(parts[7], 10);
      const hdop = parseFloat(parts[8]);
      const alt = parseFloat(parts[9]);
      const geoid = parseFloat(parts[11]);
      const age = parseFloat(parts[13]);

      if (timeStr) result.time = timeStr;
      if (latStr && latDir) result.lat = parseNmeaCoord(latStr, latDir);
      if (lonStr && lonDir) result.lon = parseNmeaCoord(lonStr, lonDir);

      if (!isNaN(fixQual)) {
        result.fixQuality = fixQual as GnssFixQuality;
      }
      if (!isNaN(sats)) result.satellites = sats;
      if (!isNaN(hdop)) result.hdop = hdop;
      if (!isNaN(alt)) result.altitude = alt;
      if (!isNaN(geoid)) result.geoidSep = geoid;
      if (!isNaN(age)) result.ageOfDiff = age;

      return result;
    }

    if (type === 'RMC') {
      // $GNRMC,hhmmss.ss,A,llll.ll,a,yyyyy.yy,a,x.x,x.x,ddmmyy,,,a
      const status = parts[2];
      if (status === 'A') { // Valid
        const speedKnots = parseFloat(parts[7]);
        const trackDeg = parseFloat(parts[8]);
        if (!isNaN(speedKnots)) result.speedKmh = speedKnots * 1.852;
        if (!isNaN(trackDeg)) result.headingDeg = trackDeg;
        return result;
      }
    }

    if (type === 'GST') {
      // $GNGST,hhmmss.ss,x.x,x.x,x.x,x.x,x.x,x.x,x.x
      // parts[6]: std dev of lat (m), parts[7]: std dev of lon (m), parts[8]: std dev of alt (m)
      const stdLat = parseFloat(parts[6]);
      const stdLon = parseFloat(parts[7]);
      const stdAlt = parseFloat(parts[8]);

      if (!isNaN(stdLat)) result.stdDevX = stdLat;
      if (!isNaN(stdLon)) result.stdDevY = stdLon;
      if (!isNaN(stdAlt)) result.stdDevZ = stdAlt;
      return result;
    }

    if (type === 'VTG') {
      // $GNVTG,x.x,T,x.x,M,x.x,N,x.x,K,a
      const heading = parseFloat(parts[1]);
      const speedKmh = parseFloat(parts[7]);
      if (!isNaN(heading)) result.headingDeg = heading;
      if (!isNaN(speedKmh)) result.speedKmh = speedKmh;
      return result;
    }
  } catch (err) {
    // 파싱 오류 무시
  }

  return null;
}
