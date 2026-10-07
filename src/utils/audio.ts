/**
 * Web Audio API synthesizer for retro arcade sound effects and music
 * Works natively in any modern browser with zero external file dependencies
 */

class SoundController {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  private bgmPlaying: boolean = false;
  private bgmTimer: number | null = null;
  private bgmStep: number = 0;
  private laserOsc: OscillatorNode | null = null;
  private laserGain: GainNode | null = null;
  private laserLfo: OscillatorNode | null = null;
  private laserLfoGain: GainNode | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.ctx && this.ctx.state === 'running') {
            this.ctx.suspend().catch(() => {});
          }
        } else {
          if (this.ctx && this.ctx.state === 'suspended' && !this.isMuted) {
            this.ctx.resume().catch(() => {});
          }
        }
      });
    }
  }

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopLaser();
      this.stopBGM();
    } else {
      if (this.bgmPlaying) {
        this.startBGM();
      }
    }
    return this.isMuted;
  }

  public getMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Chicken Cluck (Zanna's righteous clucking sound!)
   */
  public playCluck() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    // Frequency drops rapidly like a chicken cluck
    osc.frequency.setValueAtTime(450, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.12);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.12);

    // Second miniature cluck for a "bok-bok" double effect
    setTimeout(() => {
      if (this.isMuted || !this.ctx) return;
      const t2 = this.ctx.currentTime;
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();

      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(520, t2);
      osc2.frequency.exponentialRampToValueAtTime(220, t2 + 0.09);

      gain2.gain.setValueAtTime(0.2, t2);
      gain2.gain.exponentialRampToValueAtTime(0.01, t2 + 0.09);

      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);

      osc2.start(t2);
      osc2.stop(t2 + 0.09);
    }, 90);
  }

  /**
   * Light, lively ambient chick chirp & cheerful mini-cluck for background flocks
   */
  public playAmbientCluck() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    // Random pitch variation so each flock sounds lively, cheerful and cute
    const basePitch = 550 + Math.random() * 240;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(basePitch, t);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 0.45, t + 0.1);

    gain.gain.setValueAtTime(0.065, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.1);

    // Occasional double chirp "peep-peep" / "bok-bok"
    if (Math.random() < 0.65) {
      setTimeout(() => {
        if (this.isMuted || !this.ctx) return;
        const t2 = this.ctx.currentTime;
        const osc2 = this.ctx.createOscillator();
        const gain2 = this.ctx.createGain();
        const pitch2 = basePitch * 1.18;
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(pitch2, t2);
        osc2.frequency.exponentialRampToValueAtTime(pitch2 * 0.52, t2 + 0.08);

        gain2.gain.setValueAtTime(0.05, t2);
        gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.08);

        osc2.connect(gain2);
        gain2.connect(this.ctx.destination);

        osc2.start(t2);
        osc2.stop(t2 + 0.08);
      }, 75 + Math.random() * 45);
    }
  }

  /**
   * Continuous righteous laser audio
   */
  public startLaser() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx || this.laserOsc) return;

    const t = this.ctx.currentTime;
    this.laserOsc = this.ctx.createOscillator();
    this.laserGain = this.ctx.createGain();

    this.laserOsc.type = 'sawtooth';
    this.laserOsc.frequency.setValueAtTime(650, t);

    // Mild vibrato LFO
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.frequency.value = 24;
    lfoGain.gain.value = 80;
    lfo.connect(this.laserOsc.frequency);
    lfo.start(t);
    this.laserLfo = lfo;
    this.laserLfoGain = lfoGain;

    this.laserGain.gain.setValueAtTime(0.01, t);
    this.laserGain.gain.linearRampToValueAtTime(0.08, t + 0.05);

    // Lowpass filter to avoid harshness
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;

    this.laserOsc.connect(filter);
    filter.connect(this.laserGain);
    this.laserGain.connect(this.ctx.destination);

    this.laserOsc.start(t);
  }

  public stopLaser() {
    if (this.laserOsc && this.laserGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.laserGain.gain.linearRampToValueAtTime(0.001, t + 0.05);
      setTimeout(() => {
        try {
          this.laserLfo?.stop();
          this.laserLfo?.disconnect();
          this.laserLfo = null;
          this.laserLfoGain = null;

          this.laserOsc?.stop();
          this.laserOsc?.disconnect();
          this.laserOsc = null;
          this.laserGain = null;
        } catch {}
      }, 50);
    }
  }

  /**
   * Heavenly Bell Chime when greedy member repents!
   */
  public playRepentChime() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const chord = [523.25, 659.25, 783.99, 1046.5]; // C5 major
    const t = this.ctx.currentTime;

    chord.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + idx * 0.04);

      gain.gain.setValueAtTime(0.12, t + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.04 + 0.6);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + idx * 0.04);
      osc.stop(t + idx * 0.04 + 0.6);
    });
  }

  /**
   * Holy Codex Unlock Chime (Fanfare)
   */
  public playRuleUnlockFanfare() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const notes = [440, 554.37, 659.25, 880]; // A Major fanfare
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + idx * 0.09);

      gain.gain.setValueAtTime(0.16, t + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.001, t + idx * 0.09 + 0.8);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(t + idx * 0.09);
      osc.stop(t + idx * 0.09 + 0.8);
    });
  }

  /**
   * Ultimate "勸你善良" Blast Boom
   */
  public playSuperBlast() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.8);

    gain.gain.setValueAtTime(0.35, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.8);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.8);

    // Add bright high sweep
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1200, t);
    osc2.frequency.linearRampToValueAtTime(2400, t + 0.4);
    gain2.gain.setValueAtTime(0.2, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.5);
  }

  /**
   * Play coin/virtue collect sound
   */
  public playCoin() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.setValueAtTime(1318.51, t + 0.06); // E6

    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.25);
  }

  /**
   * Play player hurt / shield impact
   */
  public playHit() {
    if (this.isMuted) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.linearRampToValueAtTime(50, t + 0.15);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);
  }

  /**
   * Background 8-bit chip groove
   */
  public startBGM() {
    this.bgmPlaying = true;
    if (this.isMuted || this.bgmTimer) return;
    this.initCtx();

    // 130 BPM retro bass pattern
    const bassline = [130.81, 130.81, 155.56, 174.61, 130.81, 130.81, 196.0, 174.61]; // C3, Eb3, F3, G3
    const leadArp = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 587.33, 523.25];

    this.bgmStep = 0;
    this.bgmTimer = window.setInterval(() => {
      if (this.isMuted || !this.ctx || !this.bgmPlaying) return;

      const t = this.ctx.currentTime;

      // Bass note
      const bassFreq = bassline[this.bgmStep % bassline.length];
      const bOsc = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();
      bOsc.type = 'triangle';
      bOsc.frequency.setValueAtTime(bassFreq, t);
      bGain.gain.setValueAtTime(0.07, t);
      bGain.gain.exponentialRampToValueAtTime(0.005, t + 0.18);
      bOsc.connect(bGain);
      bGain.connect(this.ctx.destination);
      bOsc.start(t);
      bOsc.stop(t + 0.18);

      // Soft Lead arpeggio
      if (this.bgmStep % 2 === 0) {
        const leadFreq = leadArp[(this.bgmStep / 2) % leadArp.length];
        const lOsc = this.ctx.createOscillator();
        const lGain = this.ctx.createGain();
        lOsc.type = 'square';
        lOsc.frequency.setValueAtTime(leadFreq, t);
        lGain.gain.setValueAtTime(0.02, t);
        lGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        lOsc.connect(lGain);
        lGain.connect(this.ctx.destination);
        lOsc.start(t);
        lOsc.stop(t + 0.15);
      }

      this.bgmStep++;
    }, 220);
  }

  public stopBGM() {
    this.bgmPlaying = false;
    if (this.bgmTimer) {
      clearInterval(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

export const sound = new SoundController();
