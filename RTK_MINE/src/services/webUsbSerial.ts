/**
 * WebUSB 직렬 드라이버 (Android 스마트폰 브라우저 완벽 대응)
 * CDC-ACM (UM982 / UM980 / STM32), CP2102, CH340, FTDI 및 범용 Bulk USB 지원
 */

export interface UsbSerialOptions {
  baudRate?: number;
  dataBits?: number;
  stopBits?: number;
  parity?: 'none' | 'even' | 'odd';
}

export class WebUsbSerial {
  private device: any = null;
  private interfaceNumber: number = 0;
  private endpointIn: number = 0;
  private endpointOut: number = 0;
  private isReading = false;
  private onDataCallback: ((chunk: string) => void) | null = null;
  private onErrorCallback: ((err: Error) => void) | null = null;
  private textDecoder = new TextDecoder();

  public isConnected(): boolean {
    return this.device !== null && this.device.opened;
  }

  public getDeviceName(): string {
    if (!this.device) return '';
    return this.device.productName || this.device.manufacturerName || `USB (${this.device.vendorId?.toString(16)}:${this.device.productId?.toString(16)})`;
  }

  /**
   * Android/PC 브라우저에서 USB 장치 요청 및 연결
   */
  public async connect(options: UsbSerialOptions = { baudRate: 115200 }): Promise<string> {
    if (!('usb' in navigator)) {
      throw new Error('이 브라우저는 WebUSB를 지원하지 않습니다. Chrome 또는 Samsung Internet 최신 버전을 사용해주세요.');
    }

    try {
      // filters를 빈 배열로 두면 연결된 모든 USB 장치(CDC-ACM, CP2102, CH340 등)가 Android 팝업에 나타납니다.
      this.device = await (navigator as any).usb.requestDevice({ filters: [] });
      await this.device.open();

      if (this.device.configuration === null) {
        await this.device.selectConfiguration(1);
      }

      await this.configureDevice(options.baudRate || 115200);

      // 데이터 수신 루프 시작
      this.startReading();

      return this.getDeviceName();
    } catch (err: any) {
      this.disconnect();
      throw err;
    }
  }

  /**
   * 칩셋별 엔드포인트 탐색 및 보레이트 설정
   */
  private async configureDevice(baudRate: number) {
    const interfaces = this.device.configuration.interfaces;
    let dataInterface = null;
    let controlInterface = null;

    // 1. Bulk IN과 Bulk OUT을 가진 인터페이스 탐색
    for (const iface of interfaces) {
      for (const alt of iface.alternates) {
        const hasBulkIn = alt.endpoints.some((e: any) => e.type === 'bulk' && e.direction === 'in');
        const hasBulkOut = alt.endpoints.some((e: any) => e.type === 'bulk' && e.direction === 'out');
        if (hasBulkIn && hasBulkOut) {
          dataInterface = iface;
          break;
        }
      }
      if (dataInterface) break;
    }

    // 통신 제어 인터페이스(CDC-ACM일 경우 대개 0번)
    controlInterface = interfaces[0];
    if (!dataInterface) {
      // fallback: 마지막 인터페이스
      dataInterface = interfaces[interfaces.length - 1];
    }

    this.interfaceNumber = dataInterface.interfaceNumber;

    // 인터페이스 클레임
    try {
      await this.device.claimInterface(this.interfaceNumber);
    } catch (e) {
      console.warn('Interface claim retry:', e);
    }

    // 엔드포인트 번호 획득
    const alt = dataInterface.alternates[0];
    for (const ep of alt.endpoints) {
      if (ep.type === 'bulk' && ep.direction === 'in') {
        this.endpointIn = ep.endpointNumber;
      } else if (ep.type === 'bulk' && ep.direction === 'out') {
        this.endpointOut = ep.endpointNumber;
      }
    }

    const vid = this.device.vendorId;

    // 2. 칩셋별 라인 제어 (CDC-ACM, CP2102, CH340, FTDI)
    if (vid === 0x10c4) {
      // Silicon Labs CP2102
      await this.initCp2102(baudRate);
    } else if (vid === 0x1a86) {
      // WCH CH340
      await this.initCh340(baudRate);
    } else if (vid === 0x0403) {
      // FTDI
      await this.initFtdi(baudRate);
    } else {
      // 표준 CDC-ACM (UM982, UM980, STM32, Arduino)
      await this.initCdcAcm(controlInterface.interfaceNumber, baudRate);
    }
  }

  /**
   * 표준 CDC-ACM 초기화 (Unicore UM982 / UM980 VCP 기본 규격)
   */
  private async initCdcAcm(ctrlIface: number, baudRate: number) {
    try {
      // SET_LINE_CODING (Baud rate, 1 stop bit, no parity, 8 data bits)
      const lineCoding = new Uint8Array(7);
      const view = new DataView(lineCoding.buffer);
      view.setUint32(0, baudRate, true); // Baud rate (little-endian)
      view.setUint8(4, 0); // 1 Stop bit
      view.setUint8(5, 0); // None parity
      view.setUint8(6, 8); // 8 Data bits

      await this.device.controlTransferOut({
        requestType: 'class',
        recipient: 'interface',
        request: 0x20, // SET_LINE_CODING
        value: 0,
        index: ctrlIface
      }, lineCoding);

      // SET_CONTROL_LINE_STATE (DTR=1, RTS=1)
      await this.device.controlTransferOut({
        requestType: 'class',
        recipient: 'interface',
        request: 0x22, // SET_CONTROL_LINE_STATE
        value: 0x03,
        index: ctrlIface
      });
    } catch (e) {
      console.warn('CDC-ACM init optional transfer failed (still attempting stream):', e);
    }
  }

  /**
   * CP2102 초기화
   */
  private async initCp2102(baudRate: number) {
    try {
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'interface', request: 0x00, value: 1, index: this.interfaceNumber }); // IFC_ENABLE
      const baudBytes = new Uint8Array(4);
      new DataView(baudBytes.buffer).setUint32(0, baudRate, true);
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'interface', request: 0x1e, value: 0, index: this.interfaceNumber }, baudBytes); // SET_BAUDRATE
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'interface', request: 0x07, value: 0x0303, index: this.interfaceNumber }); // SET_MHS (DTR+RTS)
    } catch (e) {
      console.warn('CP2102 init failed:', e);
    }
  }

  /**
   * CH340 초기화
   */
  private async initCh340(baudRate: number) {
    try {
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0xa1, value: 0xc29c, index: 0xb2b9 });
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0x9a, value: 0x2518, index: 0x0050 });
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0xa4, value: 0x00ff, index: 0 });
    } catch (e) {
      console.warn('CH340 init failed:', e);
    }
  }

  /**
   * FTDI 초기화
   */
  private async initFtdi(baudRate: number) {
    try {
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0x00, value: 0, index: this.interfaceNumber }); // Reset
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0x01, value: 0x001a, index: this.interfaceNumber }); // 115200 baud
      await this.device.controlTransferOut({ requestType: 'vendor', recipient: 'device', request: 0x03, value: 0x0808, index: this.interfaceNumber }); // 8N1
    } catch (e) {
      console.warn('FTDI init failed:', e);
    }
  }

  /**
   * NMEA 수신 루프 (transferIn)
   */
  private async startReading() {
    this.isReading = true;
    let lineBuffer = '';

    while (this.isReading && this.device && this.device.opened) {
      try {
        const result = await this.device.transferIn(this.endpointIn, 64);
        if (result.status === 'ok' && result.data && result.data.byteLength > 0) {
          const chunk = this.textDecoder.decode(result.data, { stream: true });
          lineBuffer += chunk;

          const lines = lineBuffer.split(/[\r\n]+/);
          lineBuffer = lines.pop() || '';

          for (const line of lines) {
            if (line.trim().startsWith('$') && this.onDataCallback) {
              this.onDataCallback(line.trim());
            }
          }
        }
      } catch (err: any) {
        if (!this.isReading) break;
        console.warn('WebUSB transferIn warning:', err);
        await new Promise(r => setTimeout(r, 10));
      }
    }
  }

  /**
   * RTCM3 보정 신호 및 명령어를 UM982로 전송
   */
  public async write(data: Uint8Array | string): Promise<void> {
    if (!this.device || !this.device.opened || !this.endpointOut) return;

    try {
      const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      await this.device.transferOut(this.endpointOut, buffer);
    } catch (err) {
      console.error('WebUSB transferOut error:', err);
    }
  }

  public onData(cb: (line: string) => void) {
    this.onDataCallback = cb;
  }

  public onError(cb: (err: Error) => void) {
    this.onErrorCallback = cb;
  }

  public async disconnect() {
    this.isReading = false;
    if (this.device) {
      try {
        if (this.device.opened) {
          await this.device.releaseInterface(this.interfaceNumber);
          await this.device.close();
        }
      } catch (e) {
        console.warn('WebUSB disconnect error:', e);
      } finally {
        this.device = null;
      }
    }
  }
}

export const webUsbSerial = new WebUsbSerial();
