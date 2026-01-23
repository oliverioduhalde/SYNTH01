export class AudioManager {
  private ctx: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private fxGain: GainNode | null = null;
  private musicOsc: OscillatorNode | null = null;

  constructor() {
    const AudioContextRef = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextRef) {
      this.ctx = new AudioContextRef();
      this.musicGain = this.ctx.createGain();
      this.fxGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.4;
      this.fxGain.gain.value = 0.7;
      this.musicGain.connect(this.ctx.destination);
      this.fxGain.connect(this.ctx.destination);
    }
  }

  resume(): void {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  setMusicVolume(value: number): void {
    if (this.musicGain) {
      this.musicGain.gain.value = value;
    }
  }

  setFxVolume(value: number): void {
    if (this.fxGain) {
      this.fxGain.gain.value = value;
    }
  }

  playMusic(): void {
    if (!this.ctx || !this.musicGain) {
      return;
    }
    if (this.musicOsc) {
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = 220;
    osc.connect(this.musicGain);
    osc.start();
    this.musicOsc = osc;
  }

  stopMusic(): void {
    if (this.musicOsc) {
      this.musicOsc.stop();
      this.musicOsc.disconnect();
      this.musicOsc = null;
    }
  }

  playFx(freq: number, duration = 0.08): void {
    if (!this.ctx || !this.fxGain) {
      return;
    }
    const osc = this.ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = freq;
    osc.connect(this.fxGain);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }
}
