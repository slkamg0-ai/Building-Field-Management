type VoiceCommandHandler = (command: {
  action: 'MEASURE' | 'CANCEL' | 'SET_CODE' | 'SET_NAME' | 'SET_STAKEOUT' | 'UNKNOWN';
  payload?: string;
  transcript: string;
}) => void;

export class VoiceController {
  private recognition: any = null;
  private isListening: boolean = false;
  private commandHandlers: Set<VoiceCommandHandler> = new Set();
  private audioCtx: AudioContext | null = null;
  private beepOsc: OscillatorNode | null = null;
  private beepGain: GainNode | null = null;
  private lastBeepTime: number = 0;

  constructor() {
    this.initSpeechRecognition();
  }

  private initSpeechRecognition() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('이 브라우저는 음성 인식을 지원하지 않습니다.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.continuous = true;
    this.recognition.interimResults = false;
    this.recognition.lang = 'ko-KR';

    this.recognition.onresult = (event: any) => {
      const lastResult = event.results[event.results.length - 1];
      if (lastResult.isFinal) {
        const text = lastResult[0].transcript.trim().replace(/\s+/g, '');
        const rawText = lastResult[0].transcript.trim();
        this.processVoiceCommand(text, rawText);
      }
    };

    this.recognition.onerror = (event: any) => {
      console.warn('음성 인식 오류:', event.error);
      if (event.error === 'not-allowed') {
        this.isListening = false;
      }
    };

    this.recognition.onend = () => {
      // 자동 재시작 (작업 중 계속 대기)
      if (this.isListening) {
        try {
          this.recognition.start();
        } catch (e) {
          // Ignore
        }
      }
    };
  }

  private processVoiceCommand(compactText: string, rawText: string) {
    // 명령어 매칭
    // 1. 측정/기록/찍어
    if (compactText.includes('측정') || compactText.includes('찍어') || compactText.includes('기록') || compactText.includes('저장')) {
      this.dispatch({ action: 'MEASURE', transcript: rawText });
      return;
    }

    // 2. 취소
    if (compactText.includes('취소') || compactText.includes('삭제')) {
      this.dispatch({ action: 'CANCEL', transcript: rawText });
      return;
    }

    // 3. 코드 지정 (예: "코드 맨홀", "코드 도로", "코드 TBM")
    if (compactText.startsWith('코드')) {
      const code = compactText.replace('코드', '').trim();
      this.dispatch({ action: 'SET_CODE', payload: code, transcript: rawText });
      return;
    }

    // 4. 점명 지정 (예: "이름 1번", "이름 MH2")
    if (compactText.startsWith('이름') || compactText.startsWith('점명')) {
      const name = compactText.replace(/이름|점명/, '').trim();
      this.dispatch({ action: 'SET_NAME', payload: name, transcript: rawText });
      return;
    }

    // 5. 측설 타겟 지정 (예: "측설 3번")
    if (compactText.startsWith('측설')) {
      const target = compactText.replace('측설', '').trim();
      this.dispatch({ action: 'SET_STAKEOUT', payload: target, transcript: rawText });
      return;
    }

    this.dispatch({ action: 'UNKNOWN', transcript: rawText });
  }

  private dispatch(cmd: any) {
    this.commandHandlers.forEach(handler => handler(cmd));
  }

  public onCommand(handler: VoiceCommandHandler): () => void {
    this.commandHandlers.add(handler);
    return () => {
      this.commandHandlers.delete(handler);
    };
  }

  public startListening(): boolean {
    if (!this.recognition) return false;
    try {
      this.isListening = true;
      this.recognition.start();
      this.speak('음성 명령 대기 중입니다. 측정이라고 말씀하세요.');
      return true;
    } catch (e) {
      console.warn('음성 인식 시작 실패:', e);
      return false;
    }
  }

  public stopListening() {
    this.isListening = false;
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
  }

  public toggleListening(): boolean {
    if (this.isListening) {
      this.stopListening();
      return false;
    } else {
      return this.startListening();
    }
  }

  public getIsListening(): boolean {
    return this.isListening;
  }

  /**
   * 음성 안내 (TTS)
   */
  public speak(text: string) {
    if (!('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.1; // 약간 빠르게 전달
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('TTS 실패:', e);
    }
  }

  /**
   * 측설 근접 가변 비프음 (Web Audio API)
   * @param distance2D 목표점까지 남은 수평 거리 (m)
   * @param inTolerance 목표 허용범위(예: 3cm) 안착 여부
   */
  public playStakeoutBeep(distance2D: number, inTolerance: boolean) {
    if (distance2D > 2.0) return; // 2m 밖에서는 비프음 끔

    const now = performance.now();
    const intervalMs = inTolerance ? 100 : Math.max(80, distance2D * 400);

    if (now - this.lastBeepTime < intervalMs) return;
    this.lastBeepTime = now;

    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();

      // 거리가 가까울수록 고주파수 (800Hz ~ 1800Hz)
      const freq = inTolerance ? 2000 : 800 + Math.max(0, (2.0 - distance2D) * 500);
      osc.type = inTolerance ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, this.audioCtx.currentTime);

      gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + 0.06);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.07);
    } catch (e) {
      // Audio context error ignore
    }
  }
}

export const voiceController = new VoiceController();
