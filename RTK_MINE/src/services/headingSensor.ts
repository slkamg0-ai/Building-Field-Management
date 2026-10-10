type HeadingSource = 'GNSS_COG' | 'DEVICE_COMPASS' | 'MANUAL';

export interface HeadingState {
  headingDeg: number;       // 0 ~ 360 (도북 기준 시계방향)
  source: HeadingSource;
  speedMs: number;          // GNSS 속도 (m/s)
  isDeviceCompassAvailable: boolean;
}

export class HybridHeadingManager {
  private deviceCompassDeg: number = 0;
  private smoothedCompassDeg: number = 0;
  private isCompassAvailable: boolean = false;
  private lpfAlpha: number = 0.25; // 저주파 필터 계수 (흔들림 방지)
  private listeners: Set<(state: HeadingState) => void> = new Set();

  constructor() {
    this.initDeviceOrientation();
  }

  private initDeviceOrientation() {
    if (typeof window === 'undefined') return;

    const handleOrientation = (event: DeviceOrientationEvent) => {
      let rawHeading: number | null = null;

      // 1. iOS (WebKit) 나침반 절대 방위각
      if ((event as any).webkitCompassHeading !== undefined) {
        rawHeading = (event as any).webkitCompassHeading;
      }
      // 2. Android 절대 방위각 (absolute 이벤트 또는 alpha)
      else if (event.alpha !== null) {
        rawHeading = 360 - event.alpha;
      }

      if (rawHeading !== null && !isNaN(rawHeading)) {
        this.isCompassAvailable = true;
        this.deviceCompassDeg = (rawHeading + 360) % 360;

        // 각도 순환(0 <-> 360)을 고려한 저주파 필터(LPF) 적용 (바늘 떨림 방지)
        let diff = this.deviceCompassDeg - this.smoothedCompassDeg;
        while (diff < -180) diff += 360;
        while (diff > 180) diff -= 360;

        this.smoothedCompassDeg = (this.smoothedCompassDeg + this.lpfAlpha * diff + 360) % 360;
      }
    };

    // 안드로이드 / 크롬
    window.addEventListener('deviceorientationabsolute', handleOrientation as any, true);
    window.addEventListener('deviceorientation', handleOrientation, true);
  }

  /**
   * iOS 13+ 권한 요청
   */
  public async requestPermission(): Promise<boolean> {
    if (typeof (DeviceOrientationEvent as any)?.requestPermission === 'function') {
      try {
        const response = await (DeviceOrientationEvent as any).requestPermission();
        return response === 'granted';
      } catch (e) {
        return false;
      }
    }
    return true;
  }

  /**
   * 속도 및 하드웨어 상태에 따른 하이브리드 헤딩 산출
   * - 속도 >= 0.5 m/s (1.8 km/h): GNSS COG 채택
   * - 속도 < 0.5 m/s (정지 상태): 단말기 지자기 나침반(LPF 적용) 자동 전환
   */
  public resolveHeading(gnssSpeedKmh: number, gnssTrackDeg?: number): HeadingState {
    const speedMs = (gnssSpeedKmh || 0) / 3.6;

    // 1. 보행/이동 중 (>= 0.5 m/s): GNSS 이동 벡터(COG) 최우선
    if (speedMs >= 0.5 && gnssTrackDeg !== undefined && !isNaN(gnssTrackDeg)) {
      return {
        headingDeg: (gnssTrackDeg + 360) % 360,
        source: 'GNSS_COG',
        speedMs,
        isDeviceCompassAvailable: this.isCompassAvailable
      };
    }

    // 2. 정지 상태 (< 0.5 m/s): 단말기 나침반 센서로 자동 전환 (작업자 제자리 회전 추적)
    if (this.isCompassAvailable) {
      return {
        headingDeg: Math.round(this.smoothedCompassDeg * 10) / 10,
        source: 'DEVICE_COMPASS',
        speedMs,
        isDeviceCompassAvailable: true
      };
    }

    // 3. 나침반 미지원 단말기 대체값
    return {
      headingDeg: gnssTrackDeg || 0,
      source: 'MANUAL',
      speedMs,
      isDeviceCompassAvailable: false
    };
  }

  public getRawCompass(): number {
    return this.smoothedCompassDeg;
  }
}

export const headingManager = new HybridHeadingManager();
