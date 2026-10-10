import { parseNmeaSentence } from './nmeaParser';
import { GnssState, GnssFixQuality } from '../types/gnss';
import { wgs84ToKoreanTm, calculateGeoidHeightKN18, calculateOrthometricHeight } from './coordTransform';
import { webUsbSerial } from './webUsbSerial';
import { voiceController } from './voiceController';

type GnssUpdateCallback = (state: GnssState) => void;
type NmeaSentenceCallback = (sentence: string) => void;

// BLE Nordic UART Service UUIDs
const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
const NUS_RX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // Phone to Device (RTCM3 inject)
const NUS_TX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // Device to Phone (NMEA stream)

export class GnssConnectionManager {
  private updateCallbacks: Set<GnssUpdateCallback> = new Set();
  private nmeaCallbacks: Set<NmeaSentenceCallback> = new Set();

  private bleDevice: any = null;
  private bleRxChar: any = null;
  private serialPort: any = null;
  private serialWriter: any = null;
  private simInterval: any = null;
  private monitorTimer: any = null;

  private poleHeight: number = 2.0; // 기본 폴대고 2.0m

  // 실시간 패킷 통계
  private packetCount = 0;
  private packetsInLastSec = 0;
  private lastPacketTime = 0;
  private lastAnnouncedFix = -1; // 중복 음성 알림 방지용

  private currentState: GnssState = {
    connected: false,
    source: 'disconnected',
    isReceivingData: false,
    packetCount: 0,
    packetHz: 0,
    lastNmeaSentence: '',
    fixQuality: 0,
    fixQualityLabel: 'NO FIX',
    latitude: 36.3504,
    longitude: 127.3845,
    altitude: 75.25,
    orthoHeight: 50.0,
    geoidHeight: 23.25,
    northing: 417950.0,
    easting: 176200.0,
    satellites: 0,
    hdop: 99.9,
    vdop: 99.9,
    speedKmh: 0,
    headingDeg: 0,
    ageOfDiff: 0,
    stdDevX: 0.0,
    stdDevY: 0.0,
    stdDevZ: 0.0,
    timestamp: Date.now()
  };

  public setPoleHeight(height: number) {
    this.poleHeight = height;
  }

  public getPoleHeight(): number {
    return this.poleHeight;
  }

  public getState(): GnssState {
    return { ...this.currentState };
  }

  public onUpdate(cb: GnssUpdateCallback): () => void {
    this.updateCallbacks.add(cb);
    cb(this.getState());
    return () => {
      this.updateCallbacks.delete(cb);
    };
  }

  public onNmeaSentence(cb: NmeaSentenceCallback): () => void {
    this.nmeaCallbacks.add(cb);
    return () => {
      this.nmeaCallbacks.delete(cb);
    };
  }

  private emitState() {
    const state = this.getState();
    this.updateCallbacks.forEach(cb => cb(state));
  }

  constructor() {
    this.startMonitorTimer();
  }

  private startMonitorTimer() {
    if (this.monitorTimer) clearInterval(this.monitorTimer);
    this.monitorTimer = setInterval(() => {
      this.currentState.packetHz = this.packetsInLastSec;
      this.packetsInLastSec = 0;

      // 2.5초 이상 데이터 없으면 수신 비활성화로 판정
      if (this.currentState.connected && this.lastPacketTime > 0) {
        const elapsed = Date.now() - this.lastPacketTime;
        const receiving = elapsed < 2500;
        if (this.currentState.isReceivingData !== receiving) {
          this.currentState.isReceivingData = receiving;
          this.emitState();
        }
      }
    }, 1000);
  }

  private announceFixQuality(fix: number, sats: number) {
    switch (fix) {
      case 4:
        voiceController.speak('RTK 고정 완료. 정밀 측량이 가능합니다.');
        break;
      case 5:
        voiceController.speak('RTK 부동해 수렴 중입니다.');
        break;
      case 1:
        voiceController.speak(`단독 측위 수신. 위성 ${sats || 12}개 감지.`);
        break;
      case 0:
        voiceController.speak('위성 신호 수색 중입니다.');
        break;
    }
  }

  private handleRawNmea(sentence: string) {
    this.packetCount++;
    this.packetsInLastSec++;
    this.lastPacketTime = Date.now();
    this.currentState.isReceivingData = true;
    this.currentState.lastNmeaSentence = sentence;
    this.currentState.packetCount = this.packetCount;

    this.nmeaCallbacks.forEach(cb => cb(sentence));

    const parsed = parseNmeaSentence(sentence);
    if (!parsed) {
      this.emitState();
      return;
    }

    let updated = false;

    if (parsed.lat !== undefined && parsed.lon !== undefined) {
      this.currentState.latitude = parsed.lat;
      this.currentState.longitude = parsed.lon;
      
      // TM 좌표 및 지오이드 계산
      const tm = wgs84ToKoreanTm(parsed.lon, parsed.lat, 'EPSG:5186');
      this.currentState.northing = tm.northing;
      this.currentState.easting = tm.easting;

      const geoidN = calculateGeoidHeightKN18(parsed.lat, parsed.lon);
      this.currentState.geoidHeight = geoidN;

      if (parsed.altitude !== undefined) {
        this.currentState.altitude = parsed.altitude;
        this.currentState.orthoHeight = calculateOrthometricHeight(
          parsed.altitude,
          geoidN,
          this.poleHeight
        );
      }
      updated = true;
    }

    if (parsed.fixQuality !== undefined) {
      if (this.currentState.fixQuality !== parsed.fixQuality && parsed.fixQuality !== this.lastAnnouncedFix) {
        this.announceFixQuality(parsed.fixQuality, parsed.satellites || this.currentState.satellites);
        this.lastAnnouncedFix = parsed.fixQuality;
      }

      this.currentState.fixQuality = parsed.fixQuality;
      switch (parsed.fixQuality) {
        case 4: this.currentState.fixQualityLabel = 'RTK FIX'; break;
        case 5: this.currentState.fixQualityLabel = 'RTK FLOAT'; break;
        case 2: this.currentState.fixQualityLabel = 'DGPS'; break;
        case 1: this.currentState.fixQualityLabel = 'SINGLE'; break;
        default: this.currentState.fixQualityLabel = 'NO FIX';
      }
      updated = true;
    }

    if (parsed.satellites !== undefined) {
      this.currentState.satellites = parsed.satellites;
      updated = true;
    }
    if (parsed.hdop !== undefined) {
      this.currentState.hdop = parsed.hdop;
      updated = true;
    }
    if (parsed.ageOfDiff !== undefined) {
      this.currentState.ageOfDiff = parsed.ageOfDiff;
      updated = true;
    }
    if (parsed.speedKmh !== undefined) {
      this.currentState.speedKmh = parsed.speedKmh;
      updated = true;
    }
    if (parsed.headingDeg !== undefined) {
      this.currentState.headingDeg = parsed.headingDeg;
      updated = true;
    }
    if (parsed.stdDevX !== undefined) {
      this.currentState.stdDevX = parsed.stdDevX;
      this.currentState.stdDevY = parsed.stdDevY || parsed.stdDevX;
      this.currentState.stdDevZ = parsed.stdDevZ || parsed.stdDevX * 1.5;
      updated = true;
    }

    this.currentState.timestamp = Date.now();
    this.emitState();
  }

  /**
   * 1. Web Bluetooth (BLE) 연결
   */
  public async connectBle(): Promise<boolean> {
    this.disconnect();
    if (!('bluetooth' in navigator)) {
      throw new Error('이 브라우저는 Web Bluetooth를 지원하지 않습니다.');
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        filters: [{ namePrefix: 'GNSS' }, { namePrefix: 'RTK' }, { namePrefix: 'ESP32' }, { namePrefix: 'u-blox' }],
        optionalServices: [NUS_SERVICE_UUID, 'generic_access']
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(NUS_SERVICE_UUID);
      const txChar = await service.getCharacteristic(NUS_TX_CHAR_UUID);
      const rxChar = await service.getCharacteristic(NUS_RX_CHAR_UUID);

      this.bleDevice = device;
      this.bleRxChar = rxChar;

      await txChar.startNotifications();
      let buffer = '';

      txChar.addEventListener('characteristicvaluechanged', (event: any) => {
        const value = new TextDecoder().decode(event.target.value);
        buffer += value;
        const lines = buffer.split('\r\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('$')) {
            this.handleRawNmea(line);
          }
        }
      });

      this.currentState.connected = true;
      this.currentState.source = 'bluetooth';
      this.currentState.deviceName = device.name || 'GNSS BLE Receiver';
      this.emitState();
      return true;
    } catch (err: any) {
      console.error('BLE 연결 실패:', err);
      throw err;
    }
  }

  /**
   * 2. Web Serial (USB OTG) 연결
   */
  public async connectSerial(baudRate = 115200): Promise<boolean> {
    this.disconnect();
    if (!('serial' in navigator)) {
      throw new Error('이 브라우저는 Web Serial을 지원하지 않습니다. 크롬 브라우저를 이용해주세요.');
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });
      this.serialPort = port;
      this.serialWriter = port.writable.getWriter();

      this.currentState.connected = true;
      this.currentState.source = 'serial';
      this.currentState.deviceName = 'USB-Serial GNSS';
      this.emitState();

      // Read loop
      this.readSerialLoop(port);
      return true;
    } catch (err: any) {
      console.error('시리얼 포트 연결 실패:', err);
      throw err;
    }
  }

  /**
   * 2-1. WebUSB 모바일 유선 직결 (Android 스마트폰 브라우저 완벽 대응)
   */
  public async connectWebUsb(baudRate = 115200): Promise<boolean> {
    this.disconnect();
    try {
      const devName = await webUsbSerial.connect({ baudRate });
      
      this.currentState.connected = true;
      this.currentState.source = 'usb';
      this.currentState.deviceName = devName || 'UM982 USB-C GNSS';
      this.currentState.isReceivingData = false;
      this.packetCount = 0;
      this.lastPacketTime = 0;
      this.lastAnnouncedFix = -1;
      this.emitState();

      voiceController.speak('USB 수신기 연결되었습니다. 위성 신호를 수색합니다.');

      // NMEA 라인 콜백 등록
      webUsbSerial.onData((line) => {
        this.handleRawNmea(line);
      });

      // UM982 / UM980 출력 활성화 커맨드 자동 전송 (혹시 보드가 대기 상태인 경우 기동)
      setTimeout(async () => {
        try {
          await webUsbSerial.write("mode rover\r\n");
          await webUsbSerial.write("gpgga com1 0.2\r\n");
          await webUsbSerial.write("gprmc com1 0.2\r\n");
          await webUsbSerial.write("gpgst com1 0.2\r\n");
          await webUsbSerial.write("gphdt com1 0.2\r\n");
          await webUsbSerial.write("gpgga usb 0.2\r\n");
          await webUsbSerial.write("gprmc usb 0.2\r\n");
          await webUsbSerial.write("gpgst usb 0.2\r\n");
        } catch (e) {
          console.warn('Auto config commands optional write:', e);
        }
      }, 300);

      return true;
    } catch (err: any) {
      console.error('WebUSB 연결 실패:', err);
      throw err;
    }
  }

  private async readSerialLoop(port: any) {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    let buffer = '';

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          buffer += value;
          const lines = buffer.split(/[\r\n]+/);
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('$')) {
              this.handleRawNmea(line);
            }
          }
        }
      }
    } catch (e) {
      console.warn('시리얼 읽기 종료:', e);
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 3. 필드 시뮬레이션 모드 (수신기 없이도 즉시 현장 테스트 가능)
   */
  public startSimulation(baseNorthing = 417950.0, baseEasting = 176200.0) {
    this.disconnect();
    this.currentState.connected = true;
    this.currentState.source = 'simulation';
    this.currentState.deviceName = '가상 RTK 수신기 (ZED-F9P Simulation)';
    this.currentState.fixQuality = 4;
    this.currentState.fixQualityLabel = 'RTK FIX';
    this.currentState.satellites = 28;
    this.currentState.hdop = 0.65;
    this.currentState.vdop = 0.85;
    this.currentState.ageOfDiff = 1.0;
    this.currentState.stdDevX = 0.008; // 8mm
    this.currentState.stdDevY = 0.007; // 7mm
    this.currentState.stdDevZ = 0.015; // 15mm

    let angle = 0;
    let step = 0;

    this.simInterval = setInterval(() => {
      angle += 0.05;
      step++;

      // 현장 반경 내 천천히 이동 시뮬레이션
      const curN = baseNorthing + Math.sin(angle) * 8.5;
      const curE = baseEasting + Math.cos(angle) * 8.5;
      const curZ = 45.32 + Math.sin(step * 0.1) * 0.12;

      this.currentState.northing = Number(curN.toFixed(4));
      this.currentState.easting = Number(curE.toFixed(4));
      this.currentState.orthoHeight = Number(curZ.toFixed(4));
      this.currentState.altitude = Number((curZ + 23.25 + this.poleHeight).toFixed(4));
      this.currentState.speedKmh = 1.8;
      this.currentState.headingDeg = (Math.round((angle * 180 / Math.PI) + 90)) % 360;
      this.currentState.timestamp = Date.now();

      // 시뮬레이션 NMEA 문장 송출
      const simGga = `$GNGGA,084530.00,3621.0245,N,12723.0728,E,4,28,0.6,${this.currentState.altitude},M,23.25,M,1.0,0000*6B`;
      this.nmeaCallbacks.forEach(cb => cb(simGga));

      this.emitState();
    }, 200); // 5Hz 업데이트
  }

  /**
   * NTRIP Caster로부터 수신된 RTCM3 바이너리/데이터를 GNSS 수신기로 주입
   */
  public async sendRtcmData(data: Uint8Array): Promise<void> {
    if (this.bleRxChar) {
      try {
        await this.bleRxChar.writeValue(data);
      } catch (err) {
        console.warn('BLE RTCM 전송 실패:', err);
      }
    } else if (this.currentState.source === 'usb') {
      try {
        await webUsbSerial.write(data);
      } catch (err) {
        console.warn('WebUSB RTCM 전송 실패:', err);
      }
    } else if (this.serialWriter) {
      try {
        await this.serialWriter.write(data);
      } catch (err) {
        console.warn('시리얼 RTCM 전송 실패:', err);
      }
    }
  }

  /**
   * 연결 해제
   */
  public disconnect() {
    if (this.simInterval) {
      clearInterval(this.simInterval);
      this.simInterval = null;
    }
    if (this.bleDevice && this.bleDevice.gatt.connected) {
      this.bleDevice.gatt.disconnect();
    }
    this.bleDevice = null;
    this.bleRxChar = null;

    webUsbSerial.disconnect();

    if (this.serialWriter) {
      this.serialWriter.releaseLock();
      this.serialWriter = null;
    }
    if (this.serialPort) {
      this.serialPort.close();
      this.serialPort = null;
    }

    this.currentState.connected = false;
    this.currentState.source = 'disconnected';
    this.currentState.fixQuality = 0;
    this.currentState.fixQualityLabel = 'NO FIX';
    this.emitState();
  }
}

// 싱글톤 인스턴스
export const gnssManager = new GnssConnectionManager();
