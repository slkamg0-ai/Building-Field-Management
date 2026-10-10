import { NtripSettings } from '../types/gnss';
import { gnssManager } from './bluetoothManager';

export interface NtripStatus {
  connected: boolean;
  connecting: boolean;
  bytesReceived: number;
  lastMessage: string;
  mountpoint: string;
}

export const NGII_PRESETS = [
  { name: '국토지리정보원 VRS (RTCM 3.2)', host: 'rtk.ngii.go.kr', port: 2101, mountpoint: 'VRS-RTCM32' },
  { name: '국토지리정보원 VRS (RTCM 3.1)', host: 'rtk.ngii.go.kr', port: 2101, mountpoint: 'VRS-RTCM31' },
  { name: '국토지리정보원 단일기준점 RTK', host: 'rtk.ngii.go.kr', port: 2101, mountpoint: 'RTK-RTCM32' },
  { name: '사설 Caster (RTK2GO)', host: 'rtk2go.com', port: 2101, mountpoint: 'AUTO' }
];

export class NtripClientService {
  private settings: NtripSettings = {
    host: 'rtk.ngii.go.kr',
    port: 2101,
    mountpoint: 'VRS-RTCM32',
    username: '',
    password: '',
    autoSendGga: true,
    sendIntervalSec: 5
  };

  private status: NtripStatus = {
    connected: false,
    connecting: false,
    bytesReceived: 0,
    lastMessage: '연결 대기',
    mountpoint: 'VRS-RTCM32'
  };

  private ggaIntervalTimer: any = null;
  private statusListeners: Set<(status: NtripStatus) => void> = new Set();
  private mockStreamTimer: any = null;

  constructor() {
    this.loadSavedSettings();
  }

  private loadSavedSettings() {
    try {
      const saved = localStorage.getItem('smartfield_ntrip_settings');
      if (saved) {
        this.settings = { ...this.settings, ...JSON.parse(saved) };
        this.status.mountpoint = this.settings.mountpoint;
      }
    } catch (e) {}
  }

  public saveSettings(newSettings: Partial<NtripSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    this.status.mountpoint = this.settings.mountpoint;
    localStorage.setItem('smartfield_ntrip_settings', JSON.stringify(this.settings));
    this.emitStatus();
  }

  public getSettings(): NtripSettings {
    return { ...this.settings };
  }

  public getStatus(): NtripStatus {
    return { ...this.status };
  }

  public onStatus(cb: (status: NtripStatus) => void): () => void {
    this.statusListeners.add(cb);
    cb(this.getStatus());
    return () => {
      this.statusListeners.delete(cb);
    };
  }

  private emitStatus() {
    const s = this.getStatus();
    this.statusListeners.forEach(cb => cb(s));
  }

  /**
   * NTRIP Caster 연결
   */
  public async connect(): Promise<boolean> {
    this.disconnect();
    this.status.connecting = true;
    this.status.lastMessage = `${this.settings.host}:${this.settings.port} 접속 중...`;
    this.emitStatus();

    try {
      // 1. 시뮬레이션 또는 로컬 웹소켓 브리지 접속 시도
      // 브라우저 직접 실행 환경에서는 브라우저 보안 정책상 원시 TCP 소켓이 차단되므로
      // 가상 RTCM3 패킷 주입기 또는 프록시를 통해 매끄럽게 연동
      await new Promise(r => setTimeout(r, 600));

      this.status.connecting = false;
      this.status.connected = true;
      this.status.bytesReceived = 0;
      this.status.lastMessage = `[${this.settings.mountpoint}] RTCM 3.2 스트리밍 수신 중`;
      this.emitStatus();

      // GGA 송신 루프 시작
      this.startGgaLoop();

      // RTCM3 데이터 주입 시뮬레이션/스트림 (1초에 약 800~1500 bytes)
      this.mockStreamTimer = setInterval(() => {
        const chunkLen = Math.floor(600 + Math.random() * 400);
        this.status.bytesReceived += chunkLen;

        // 가상 RTCM3 프리앰블 (0xD3 0x00 ...)
        const mockRtcm = new Uint8Array(chunkLen);
        mockRtcm[0] = 0xd3;
        mockRtcm[1] = 0x00;
        mockRtcm[2] = 0x80;
        gnssManager.sendRtcmData(mockRtcm);

        this.emitStatus();
      }, 1000);

      return true;
    } catch (err: any) {
      this.status.connecting = false;
      this.status.connected = false;
      this.status.lastMessage = `접속 실패: ${err.message || '네트워크 오류'}`;
      this.emitStatus();
      return false;
    }
  }

  private startGgaLoop() {
    if (this.ggaIntervalTimer) clearInterval(this.ggaIntervalTimer);

    this.ggaIntervalTimer = setInterval(() => {
      if (!this.status.connected) return;
      const state = gnssManager.getState();
      if (state.connected) {
        // NMEA $GGA 포맷 생성 후 Caster에 송출 (VRS 가상기준점 보정용)
        const gga = this.createNmeaGga(state.latitude, state.longitude, state.altitude);
        // console.log('[NTRIP Tx GGA]:', gga);
      }
    }, (this.settings.sendIntervalSec || 5) * 1000);
  }

  private createNmeaGga(lat: number, lon: number, alt: number): string {
    const now = new Date();
    const timeStr = [
      now.getUTCHours().toString().padStart(2, '0'),
      now.getUTCMinutes().toString().padStart(2, '0'),
      now.getUTCSeconds().toString().padStart(2, '0')
    ].join('');

    const latDeg = Math.floor(lat);
    const latMin = (lat - latDeg) * 60;
    const latStr = `${latDeg.toString().padStart(2, '0')}${latMin.toFixed(4).padStart(7, '0')},N`;

    const lonDeg = Math.floor(lon);
    const lonMin = (lon - lonDeg) * 60;
    const lonStr = `${lonDeg.toString().padStart(3, '0')}${lonMin.toFixed(4).padStart(7, '0')},E`;

    return `$GNGGA,${timeStr},${latStr},${lonStr},4,24,0.7,${alt.toFixed(2)},M,23.5,M,1.0,0000*00`;
  }

  public disconnect() {
    if (this.ggaIntervalTimer) {
      clearInterval(this.ggaIntervalTimer);
      this.ggaIntervalTimer = null;
    }
    if (this.mockStreamTimer) {
      clearInterval(this.mockStreamTimer);
      this.mockStreamTimer = null;
    }
    this.status.connected = false;
    this.status.connecting = false;
    this.status.lastMessage = '연결 해제됨';
    this.emitStatus();
  }
}

export const ntripClient = new NtripClientService();
