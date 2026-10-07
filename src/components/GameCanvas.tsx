import React, { useRef, useEffect, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Enemy, Particle, FloatingText, UpgradeState, ClubRule } from '../types/game';
import { ENEMY_TEMPLATES } from '../data/rules';
import { sound } from '../utils/audio';

export interface GameCanvasStatsEvent {
  type: 'laser_tick' | 'pacifist_tick' | 'boss_purified' | 'ult_used' | 'wave_clear_health' | 'laser_accuracy' | 'pacifist_sec';
  hit?: boolean;
  dtSec?: number;
  health?: number;
  accuracy?: number;
  sec?: number;
}

interface BgFlyingChick {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseY: number;
  waveOffset: number;
  waveFreq: number;
  waveAmp: number;
  scale: number;
  alpha: number;
  facingRight: boolean;
}

interface BgRighteousSymbol {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  symbol: string;
  rotation: number;
  rotSpeed: number;
  scale: number;
  alpha: number;
  life: number;
  maxLife: number;
}

interface GameCanvasProps {
  wave: number;
  maxWave: number;
  upgrades: UpgradeState;
  health: number;
  setHealth: React.Dispatch<React.SetStateAction<number>>;
  funds: number;
  setFunds: React.Dispatch<React.SetStateAction<number>>;
  rage: number;
  setRage: React.Dispatch<React.SetStateAction<number>>;
  purifiedCount: number;
  setPurifiedCount: React.Dispatch<React.SetStateAction<number>>;
  combo: number;
  setCombo: React.Dispatch<React.SetStateAction<number>>;
  setMaxCombo: React.Dispatch<React.SetStateAction<number>>;
  rules: ClubRule[];
  setRules: React.Dispatch<React.SetStateAction<ClubRule[]>>;
  onWaveComplete: () => void;
  onGameOver: (victory: boolean) => void;
  isFiring: boolean;
  setIsFiring: React.Dispatch<React.SetStateAction<boolean>>;
  triggerUltSignal: number;
  onStatsEvent?: (event: GameCanvasStatsEvent) => void;
  gameState?: 'TITLE' | 'PLAYING' | 'SHOP' | 'GAMEOVER' | 'VICTORY';
  setRemainingEnemies?: (count: number) => void;
}

export const GameCanvas: React.FC<GameCanvasProps> = ({
  wave,
  maxWave,
  upgrades,
  health,
  setHealth,
  setFunds,
  rage,
  setRage,
  setPurifiedCount,
  combo,
  setCombo,
  setMaxCombo,
  rules,
  setRules,
  onWaveComplete,
  onGameOver,
  isFiring: _isFiring,
  setIsFiring,
  triggerUltSignal,
  onStatsEvent,
  gameState = 'PLAYING',
  setRemainingEnemies,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isFiringInternalRef = useRef<boolean>(false);
  const upgradesRef = useRef<UpgradeState>(upgrades);

  useEffect(() => {
    upgradesRef.current = upgrades;
  }, [upgrades]);

  // References for game state inside requestAnimationFrame loop
  const gameStateRef = useRef({
    chickenAngle: 0,
    mousePos: { x: 0, y: 0 },
    enemies: [] as Enemy[],
    particles: [] as Particle[],
    floatingTexts: [] as FloatingText[],
    shockwaves: [] as { x: number; y: number; radius: number; maxRadius: number; color: string }[],
    waveSpawnRemaining: 0,
    waveTotalToSpawn: 0,
    spawnTimer: 0,
    lastTime: performance.now(),
    screenShake: 0,
    flappingRecoil: 0,
    lastHitEnemyIds: new Set<string>(),
    comboTimer: 0,
    health: 100,
    rage: 0,
    waveActive: true,
    bgChicks: [] as BgFlyingChick[],
    bgSymbols: [] as BgRighteousSymbol[],
    chickFlockSpawnTimer: 0,
    nextFlockDelay: 3500,
    symbolSpawnTimer: 0,
    ambientCluckTimer: 0,
    laserFiredTicks: 0,
    laserHitTicks: 0,
    pacifistSec: 0,
    lastReportedPacifistSec: 0,
    lastReportedAccuracy: 0,
  });

  // Sync health & rage to ref
  useEffect(() => {
    gameStateRef.current.health = health;
  }, [health]);

  useEffect(() => {
    gameStateRef.current.rage = rage;
  }, [rage]);

  // Handle Ult Trigger
  const triggerUltimate = useCallback(() => {
    const state = gameStateRef.current;
    if (state.rage < 100) return;

    state.rage = 0;
    setRage(0);

    onStatsEvent?.({ type: 'ult_used' });

    sound.playSuperBlast();
    sound.playCluck();

    // Trigger full screen holy chicken shockwave!
    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width / 2 : 400;
    const cy = canvas ? canvas.height / 2 : 300;

    state.shockwaves.push({
      x: cx,
      y: cy,
      radius: 20,
      maxRadius: Math.max(cx, cy) * 1.5,
      color: '#FBBF24',
    });

    state.screenShake = 15;

    // Purify or heavily damage all enemies on screen
    let ultPurifiedCount = 0;
    state.enemies.forEach((enemy) => {
      if (!enemy.isPurified) {
        enemy.currentGreed = 0;
        enemy.isPurified = true;
        enemy.purifiedTimer = 180;
        ultPurifiedCount++;

        if (enemy.type === 'boss_president') {
          onStatsEvent?.({ type: 'boss_purified' });
        }

        // Repent speech
        const template = ENEMY_TEMPLATES[enemy.type];
        const quote = template.repentQuotePool[Math.floor(Math.random() * template.repentQuotePool.length)];
        state.floatingTexts.push({
          id: Math.random().toString(),
          x: enemy.x,
          y: enemy.y - 25,
          text: quote,
          color: '#FEF08A',
          life: 90,
          maxLife: 90,
          fontSize: 13,
        });

        // Drop funds
        const currentUpgrades = upgradesRef.current;
        const earned = Math.floor(enemy.fundDrop * (1 + (currentUpgrades.fundMultiplier - 1) * 0.4));
        setFunds((prev) => prev + earned);

        // Unlock rule
        if (enemy.ruleIdUnlock) {
          setRules((prevRules) =>
            prevRules.map((r) => {
              if (r.id === enemy.ruleIdUnlock && !r.unlocked) {
                sound.playRuleUnlockFanfare();
                return { ...r, unlocked: true };
              }
              return r;
            })
          );
        }
      }
    });

    if (ultPurifiedCount > 0) {
      setPurifiedCount((prev) => prev + ultPurifiedCount);
      setCombo((prev) => {
        const next = prev + ultPurifiedCount;
        setMaxCombo((m) => Math.max(m, next));
        return next;
      });
      state.comboTimer = 240;

      confetti({
        particleCount: 70,
        spread: 90,
        origin: { y: 0.5 },
      });
    }

    state.floatingTexts.push({
      id: Math.random().toString(),
      x: cx,
      y: cy - 70,
      text: '⚡ 勸你善良！全屏超載雞鳴 ⚡',
      color: '#F59E0B',
      life: 100,
      maxLife: 100,
      fontSize: 22,
    });
  }, [setRage, setFunds, setPurifiedCount, setCombo, setMaxCombo, setRules]);

  // Ult signal from outside
  useEffect(() => {
    if (triggerUltSignal > 0) {
      triggerUltimate();
    }
  }, [triggerUltSignal, triggerUltimate]);

  // Spacebar to trigger Ult
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        triggerUltimate();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerUltimate]);

  // Initialize Wave Spawn configuration
  useEffect(() => {
    if (gameState !== 'PLAYING') return;

    const state = gameStateRef.current;
    state.enemies = [];
    state.shockwaves = [];
    state.particles = [];
    state.waveActive = true;

    // Fast, responsive, snappy wave enemy counts:
    // Wave 1: 6, Wave 2: 9, Wave 3: 12, Wave 4: 15, Wave 5: 16 (includes Boss)
    let total = 6;
    if (wave === 2) total = 9;
    if (wave === 3) total = 12;
    if (wave === 4) total = 15;
    if (wave === maxWave) total = 16;

    state.waveSpawnRemaining = total;
    state.waveTotalToSpawn = total;
    state.spawnTimer = 0;
    setRemainingEnemies?.(total);

    // Welcome banner text
    const canvas = canvasRef.current;
    if (canvas) {
      state.floatingTexts.push({
        id: Math.random().toString(),
        x: canvas.width / 2,
        y: canvas.height / 2 - 90,
        text: wave === maxWave ? '⚠️ 警告：爆倉前社長親自攜帶巨資登場！' : `⚡ 第 ${wave} 波 貪婪侵蝕來襲！`,
        color: wave === maxWave ? '#EF4444' : '#38BDF8',
        life: 120,
        maxLife: 120,
        fontSize: 18,
      });
    }
  }, [wave, maxWave, gameState, setRemainingEnemies]);

  // Main Canvas Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    let dpr = 1;
    let cssWidth = 800;
    let cssHeight = 600;

    const resizeCanvas = () => {
      const container = canvas.parentElement;
      if (container) {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        cssWidth = container.clientWidth || 800;
        cssHeight = Math.max(480, Math.min(650, window.innerHeight - 200));
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Mouse / Touch Event Listeners
    const handlePointerMove = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      let clientX = 0;
      let clientY = 0;
      if ('touches' in e && e.touches.length > 0) {
        if (e.cancelable) e.preventDefault();
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else if ('clientX' in e) {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      gameStateRef.current.mousePos = {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if ('touches' in e && e.cancelable) {
        e.preventDefault();
      }
      isFiringInternalRef.current = true;
      setIsFiring(true);
      sound.startLaser();
      sound.playCluck();
      handlePointerMove(e);
    };

    const handlePointerUp = () => {
      isFiringInternalRef.current = false;
      setIsFiring(false);
      sound.stopLaser();
    };

    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('mouseup', handlePointerUp);

    canvas.addEventListener('touchmove', handlePointerMove, { passive: false });
    canvas.addEventListener('touchstart', handlePointerDown, { passive: false });
    window.addEventListener('touchend', handlePointerUp);

    // Context menu prevent default
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      triggerUltimate();
    };
    canvas.addEventListener('contextmenu', handleContextMenu);

    // Spawn an enemy
    const spawnEnemy = (w: number, h: number) => {
      const types: Array<'crypto_gambler' | 'pyramid_senior' | 'ppt_vaporware' | 'leek_officer' | 'boss_president'> = [];

      // Wave-based enemy spawn distribution
      if (wave >= 1) types.push('crypto_gambler', 'crypto_gambler');
      if (wave >= 2) types.push('pyramid_senior');
      if (wave >= 3) types.push('ppt_vaporware');
      if (wave >= 4) types.push('leek_officer');

      // Check if boss should spawn
      const isBossWave = wave === maxWave;
      const isBossSpawnTime = isBossWave && gameStateRef.current.waveSpawnRemaining === 1;

      const chosenType = isBossSpawnTime ? 'boss_president' : types[Math.floor(Math.random() * types.length)];
      const template = ENEMY_TEMPLATES[chosenType];

      // Spawn outside border
      const side = Math.floor(Math.random() * 4);
      let x = 0;
      let y = 0;
      const buffer = 40;

      if (side === 0) {
        // top
        x = Math.random() * w;
        y = -buffer;
      } else if (side === 1) {
        // right
        x = w + buffer;
        y = Math.random() * h;
      } else if (side === 2) {
        // bottom
        x = Math.random() * w;
        y = h + buffer;
      } else {
        // left
        x = -buffer;
        y = Math.random() * h;
      }

      const quote = template.quotePool[Math.floor(Math.random() * template.quotePool.length)];

      const newEnemy: Enemy = {
        id: Math.random().toString(),
        x,
        y,
        type: template.type,
        name: template.name,
        avatarIcon: template.avatarIcon,
        quote,
        repentQuote: template.repentQuotePool[0],
        ruleIdUnlock: template.ruleIdUnlock,
        maxGreed: template.baseGreed * (1 + (wave - 1) * 0.15),
        currentGreed: template.baseGreed * (1 + (wave - 1) * 0.15),
        speed: template.speed * (0.9 + Math.random() * 0.25),
        radius: template.radius,
        isPurified: false,
        purifiedTimer: 0,
        angle: 0,
        color: template.color,
        points: template.points,
        fundDrop: template.fundDrop,
      };

      gameStateRef.current.enemies.push(newEnemy);
    };

    // Game Loop
    const loop = (timestamp: number) => {
      const state = gameStateRef.current;
      const dt = Math.min(32, timestamp - state.lastTime);
      state.lastTime = timestamp;

      const w = cssWidth;
      const h = cssHeight;
      const cx = w / 2;
      const cy = h / 2;

      // Update Chicken Facing Angle
      const targetAngle = Math.atan2(state.mousePos.y - cy, state.mousePos.x - cx);
      state.chickenAngle = targetAngle;

      if (isFiringInternalRef.current) {
        state.flappingRecoil = Math.sin(timestamp * 0.04) * 4;
      } else {
        state.flappingRecoil = 0;
      }

      // Screen Shake Decay
      if (state.screenShake > 0) {
        state.screenShake *= 0.88;
        if (state.screenShake < 0.1) state.screenShake = 0;
      }

      // Combo Timer decay
      if (state.comboTimer > 0) {
        state.comboTimer -= dt * 0.06;
        if (state.comboTimer <= 0) {
          setCombo(0);
        }
      }

      // Enemy Spawning (Snappy and fast pacing)
      if (state.waveSpawnRemaining > 0) {
        state.spawnTimer += dt;
        const spawnInterval = Math.max(500, 950 - wave * 75);
        if (state.spawnTimer >= spawnInterval) {
          state.spawnTimer = 0;
          spawnEnemy(w, h);
          state.waveSpawnRemaining--;
        }
      }

      // Clear Canvas with subtle screen shake offset and DPR transform
      ctx.save();
      ctx.scale(dpr, dpr);
      if (state.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * state.screenShake;
        const shakeY = (Math.random() - 0.5) * state.screenShake;
        ctx.translate(shakeX, shakeY);
      }

      // 1. Draw Background Grid & Subtle Trading Candlesticks
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, w, h);

      // Cyber Grid Lines
      ctx.strokeStyle = 'rgba(30, 41, 59, 0.4)';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < w; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Subtle satirical stock market tickers floating in background
      ctx.fillStyle = 'rgba(239, 68, 68, 0.12)';
      ctx.font = '10px monospace';
      ctx.fillText('FINTECH_GREED: -99.9% 📉', 20, 25);
      ctx.fillText('LEVERAGE_COLLAPSE: MARGIN CALL', 20, 42);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
      ctx.fillText('ZANNA_ETHICS_FUND: +∞% 🚀', w - 190, 25);
      ctx.fillText('COMMUNITY_TRUST: RESTORED 🕊️', w - 190, 42);

      // --- 1.5 Background Ambient Flying Chicks & Righteous Symbols ---
      // Update background timers
      state.chickFlockSpawnTimer += dt;
      if (state.chickFlockSpawnTimer >= state.nextFlockDelay) {
        state.chickFlockSpawnTimer = 0;
        state.nextFlockDelay = 3800 + Math.random() * 3200;

        const facingRight = Math.random() > 0.45;
        const flockCount = 3 + Math.floor(Math.random() * 3);
        const startX = facingRight ? -60 : w + 60;
        const startY = 40 + Math.random() * (h - 80);
        const baseSpeed = (facingRight ? 1 : -1) * (1.8 + Math.random() * 1.3);
        const baseVy = (Math.random() - 0.5) * 0.35;

        for (let k = 0; k < flockCount; k++) {
          const chickX = startX - (facingRight ? 1 : -1) * (k * 26 + Math.random() * 8);
          const chickY = startY + (k % 2 === 0 ? k * 14 : -k * 14) + (Math.random() - 0.5) * 8;
          state.bgChicks.push({
            id: Math.random().toString(),
            x: chickX,
            y: chickY,
            vx: baseSpeed * (0.95 + Math.random() * 0.1),
            vy: baseVy,
            baseY: chickY,
            waveOffset: Math.random() * Math.PI * 2,
            waveFreq: 0.02 + Math.random() * 0.015,
            waveAmp: 6 + Math.random() * 8,
            scale: 0.7 + Math.random() * 0.25,
            alpha: 0.55 + Math.random() * 0.25,
            facingRight,
          });
        }
        sound.playAmbientCluck();
      }

      // Random ambient cluck sound during gameplay
      state.ambientCluckTimer += dt;
      if (state.ambientCluckTimer >= 5200 + Math.random() * 3800) {
        state.ambientCluckTimer = 0;
        if (state.bgChicks.length > 0) {
          sound.playAmbientCluck();
        }
      }

      // Spawn righteous symbols
      state.symbolSpawnTimer += dt;
      if (state.symbolSpawnTimer >= 2400) {
        state.symbolSpawnTimer = 0;
        const symbolPool = ['⚖️', '🕊️', '📜', '💛', '✨', '🌟', '🕊️', '🛡️'];
        const chosenSymbol = symbolPool[Math.floor(Math.random() * symbolPool.length)];
        state.bgSymbols.push({
          id: Math.random().toString(),
          x: 40 + Math.random() * (w - 80),
          y: h + 25,
          vx: (Math.random() - 0.5) * 0.5,
          vy: -0.6 - Math.random() * 0.7,
          symbol: chosenSymbol,
          rotation: Math.random() * Math.PI * 2,
          rotSpeed: (Math.random() - 0.5) * 0.015,
          scale: 0.9 + Math.random() * 0.4,
          alpha: 0.28 + Math.random() * 0.2,
          life: 340,
          maxLife: 340,
        });
      }

      // Render Background Righteous Symbols
      for (let sIdx = state.bgSymbols.length - 1; sIdx >= 0; sIdx--) {
        const s = state.bgSymbols[sIdx];
        s.x += s.vx;
        s.y += s.vy;
        s.rotation += s.rotSpeed;
        s.life--;

        const progress = s.life / s.maxLife;
        const currentAlpha = Math.sin(progress * Math.PI) * s.alpha;

        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.rotation);
        ctx.scale(s.scale, s.scale);
        ctx.globalAlpha = currentAlpha;
        ctx.font = '22px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(251, 191, 36, 0.45)';
        ctx.shadowBlur = 8;
        ctx.fillText(s.symbol, 0, 0);
        ctx.restore();

        // Subtle holy sparkle trail
        if (Math.random() < 0.04) {
          state.particles.push({
            x: s.x + (Math.random() - 0.5) * 10,
            y: s.y + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            life: 25,
            maxLife: 25,
            color: '#FDE047',
            size: 2.5,
            shape: 'spark',
          });
        }

        if (s.life <= 0 || s.y < -40) {
          state.bgSymbols.splice(sIdx, 1);
        }
      }

      // Render Background Flying Chicks
      for (let cIdx = state.bgChicks.length - 1; cIdx >= 0; cIdx--) {
        const c = state.bgChicks[cIdx];
        c.x += c.vx;
        c.baseY += c.vy;
        const drawY = c.baseY + Math.sin(c.x * c.waveFreq + c.waveOffset) * c.waveAmp;

        ctx.save();
        ctx.translate(c.x, drawY);
        if (!c.facingRight) {
          ctx.scale(-1, 1);
        }
        ctx.scale(c.scale, c.scale);
        ctx.globalAlpha = c.alpha;

        // Animated wing flap
        const wingFlap = Math.sin(timestamp * 0.024 + c.waveOffset) * 6;

        // Golden halo
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(-2, -14, 5, 2.2, 0, 0, Math.PI * 2);
        ctx.stroke();

        // Body (Plump round chick)
        ctx.fillStyle = '#FEF08A';
        ctx.beginPath();
        ctx.ellipse(0, 0, 11, 8.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        // Flapping wing
        ctx.fillStyle = '#FDE047';
        ctx.beginPath();
        ctx.ellipse(-2, -wingFlap, 6.5, 4.5, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#EAB308';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Orange Beak
        ctx.fillStyle = '#F97316';
        ctx.beginPath();
        ctx.moveTo(8, -1.5);
        ctx.lineTo(13.5, 0.5);
        ctx.lineTo(8, 2.5);
        ctx.closePath();
        ctx.fill();

        // Beady Eye with cute shine
        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(4, -2, 1.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(4.7, -2.5, 0.7, 0, Math.PI * 2);
        ctx.fill();

        // Rosy cheek blush
        ctx.fillStyle = 'rgba(251, 113, 133, 0.55)';
        ctx.beginPath();
        ctx.arc(3.5, 2, 1.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();

        // Fairy sparkle dust trail behind chick
        if (Math.random() < 0.12) {
          state.particles.push({
            x: c.x - (c.facingRight ? 12 : -12),
            y: drawY + (Math.random() - 0.5) * 6,
            vx: (c.facingRight ? -0.8 : 0.8) + (Math.random() - 0.5) * 0.4,
            vy: (Math.random() - 0.5) * 0.6,
            life: 20,
            maxLife: 20,
            color: '#FEF08A',
            size: 2,
            shape: 'star',
          });
        }

        // Offscreen removal
        const offscreen = c.facingRight ? c.x > w + 120 : c.x < -120;
        if (offscreen) {
          state.bgChicks.splice(cIdx, 1);
        }
      }

      // 2. Reverence Aura Field around Zanna
      const currentUpgrades = upgradesRef.current;
      const auraRadius = 110 + currentUpgrades.reverenceAura * 20;
      const auraGrad = ctx.createRadialGradient(cx, cy, 30, cx, cy, auraRadius);
      auraGrad.addColorStop(0, 'rgba(56, 189, 248, 0.15)');
      auraGrad.addColorStop(0.7, 'rgba(245, 158, 11, 0.08)');
      auraGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // Aura dashed border
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(cx, cy, auraRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. Process Shockwaves
      for (let i = state.shockwaves.length - 1; i >= 0; i--) {
        const sw = state.shockwaves[i];
        sw.radius += dt * 0.8;
        const alpha = Math.max(0, 1 - sw.radius / sw.maxRadius);
        ctx.save();
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha})`;
        ctx.lineWidth = 8 * alpha;
        ctx.beginPath();
        ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        if (sw.radius >= sw.maxRadius) {
          state.shockwaves.splice(i, 1);
        }
      }

      // 4. Update & Render Enemies
      const laserWidth = 14 + currentUpgrades.laserWidth * 6;
      const laserDPS = (80 + currentUpgrades.laserPower * 30) * (dt / 1000);
      const beamLength = 1200;

      // Laser vector
      const laserDirX = Math.cos(state.chickenAngle);
      const laserDirY = Math.sin(state.chickenAngle);
      const beakStartX = cx + laserDirX * 32;
      const beakStartY = cy + laserDirY * 32;

      let anyEnemyHitByLaser = false;

      for (let i = state.enemies.length - 1; i >= 0; i--) {
        const enemy = state.enemies[i];

        // If purified: move backwards, fade away
        if (enemy.isPurified) {
          enemy.purifiedTimer -= dt * 0.06;
          const retreatSpeed = enemy.speed * 1.5;
          const awayAngle = Math.atan2(enemy.y - cy, enemy.x - cx);
          enemy.x += Math.cos(awayAngle) * retreatSpeed;
          enemy.y += Math.sin(awayAngle) * retreatSpeed;

          // Render Purified Chick
          ctx.save();
          ctx.translate(enemy.x, enemy.y);
          // Halo
          ctx.strokeStyle = '#FBBF24';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, -enemy.radius - 8, 8, 0, Math.PI * 2);
          ctx.stroke();

          // Peaceful Baby Chick body
          ctx.fillStyle = '#FEF08A';
          ctx.beginPath();
          ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#F59E0B';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Chick Beak & Eyes
          ctx.fillStyle = '#0F172A';
          ctx.beginPath();
          ctx.arc(-4, -2, 2, 0, Math.PI * 2);
          ctx.arc(4, -2, 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#F97316';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-3, 5);
          ctx.lineTo(3, 5);
          ctx.closePath();
          ctx.fill();

          // Peaceful badge text
          ctx.fillStyle = '#10B981';
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('😇 已醒悟', 0, enemy.radius + 14);

          ctx.restore();

          // Spawn occasional virtue hearts/stars
          if (Math.random() < 0.15) {
            state.particles.push({
              x: enemy.x + (Math.random() - 0.5) * 20,
              y: enemy.y + (Math.random() - 0.5) * 20,
              vx: (Math.random() - 0.5) * 1.5,
              vy: -1.5,
              life: 30,
              maxLife: 30,
              color: '#34D399',
              size: 4,
              shape: 'star',
            });
          }

          if (enemy.purifiedTimer <= 0) {
            state.enemies.splice(i, 1);
          }
          continue;
        }

        // Unpurified Enemy Movement towards Zanna
        const distToCenter = Math.hypot(cx - enemy.x, cy - enemy.y);
        let speedMult = 1;

        // Reverence Aura slowdown
        if (distToCenter < auraRadius) {
          speedMult = Math.max(0.2, 1 - currentUpgrades.reverenceAura * 0.15);
        }

        const moveAngle = Math.atan2(cy - enemy.y, cx - enemy.x);
        enemy.x += Math.cos(moveAngle) * enemy.speed * speedMult;
        enemy.y += Math.sin(moveAngle) * enemy.speed * speedMult;

        // Collision with Zanna Shield
        if (distToCenter < 40 + enemy.radius) {
          // Push enemy back
          enemy.x -= Math.cos(moveAngle) * 35;
          enemy.y -= Math.sin(moveAngle) * 35;

          // Damage Zanna
          sound.playHit();
          state.screenShake = 8;
          setHealth((prev) => {
            const next = Math.max(0, prev - 12);
            if (next <= 0 && state.waveActive) {
              state.waveActive = false;
              onGameOver(false);
            }
            return next;
          });

          // Text float
          state.floatingTexts.push({
            id: Math.random().toString(),
            x: cx + (Math.random() - 0.5) * 40,
            y: cy - 30,
            text: '-12 護盾侵蝕!',
            color: '#F43F5E',
            life: 45,
            maxLife: 45,
            fontSize: 12,
          });
        }

        // Laser Collision Check
        let isHitByLaser = false;
        if (isFiringInternalRef.current) {
          // Point-to-Ray distance
          const toEnemyX = enemy.x - beakStartX;
          const toEnemyY = enemy.y - beakStartY;
          const projection = toEnemyX * laserDirX + toEnemyY * laserDirY;

          if (projection > 0 && projection < beamLength) {
            const closestX = beakStartX + laserDirX * projection;
            const closestY = beakStartY + laserDirY * projection;
            const dist = Math.hypot(enemy.x - closestX, enemy.y - closestY);

            if (dist < enemy.radius + laserWidth / 2) {
              isHitByLaser = true;
              anyEnemyHitByLaser = true;

              // Apply purification damage
              enemy.currentGreed -= laserDPS;

              // Generate Ult Rage
              setRage((prev) => {
                const add = (0.2 + (currentUpgrades.rageGeneration - 1) * 0.1) * (dt / 16);
                return Math.min(100, prev + add);
              });

              // Spark particles at intersection
              if (Math.random() < 0.6) {
                state.particles.push({
                  x: enemy.x + (Math.random() - 0.5) * enemy.radius,
                  y: enemy.y + (Math.random() - 0.5) * enemy.radius,
                  vx: (Math.random() - 0.5) * 4,
                  vy: (Math.random() - 0.5) * 4,
                  life: 20,
                  maxLife: 20,
                  color: '#38BDF8',
                  size: 3 + Math.random() * 3,
                  shape: 'spark',
                });
              }

              // Check if Greed reached 0 -> Purified!
              if (enemy.currentGreed <= 0) {
                enemy.isPurified = true;
                enemy.purifiedTimer = 160;

                if (enemy.type === 'boss_president') {
                  onStatsEvent?.({ type: 'boss_purified' });
                }

                sound.playRepentChime();
                sound.playCoin();

                // Speech bubble
                const template = ENEMY_TEMPLATES[enemy.type];
                const quote = template.repentQuotePool[Math.floor(Math.random() * template.repentQuotePool.length)];
                state.floatingTexts.push({
                  id: Math.random().toString(),
                  x: enemy.x,
                  y: enemy.y - 25,
                  text: quote,
                  color: '#FEF08A',
                  life: 90,
                  maxLife: 90,
                  fontSize: 13,
                });

                // Drop recovered funds
                const earned = Math.floor(enemy.fundDrop * (1 + (currentUpgrades.fundMultiplier - 1) * 0.4));
                setFunds((prev) => prev + earned);
                state.floatingTexts.push({
                  id: Math.random().toString(),
                  x: enemy.x,
                  y: enemy.y - 45,
                  text: `+NT$ ${earned.toLocaleString()}`,
                  color: '#34D399',
                  life: 60,
                  maxLife: 60,
                  fontSize: 12,
                });

                // Unlock rule
                if (enemy.ruleIdUnlock) {
                  setRules((prevRules) =>
                    prevRules.map((r) => {
                      if (r.id === enemy.ruleIdUnlock && !r.unlocked) {
                        sound.playRuleUnlockFanfare();
                        return { ...r, unlocked: true };
                      }
                      return r;
                    })
                  );
                }

                // Increment counts & combo
                setPurifiedCount((prev) => prev + 1);
                setCombo((prev) => {
                  const next = prev + 1;
                  setMaxCombo((m) => Math.max(m, next));
                  return next;
                });
                state.comboTimer = 240;

                // Particle celebration
                for (let p = 0; p < 12; p++) {
                  state.particles.push({
                    x: enemy.x,
                    y: enemy.y,
                    vx: (Math.random() - 0.5) * 5,
                    vy: (Math.random() - 0.5) * 5,
                    life: 30,
                    maxLife: 30,
                    color: '#FBBF24',
                    size: 4,
                    shape: 'coin',
                  });
                }
              }
            }
          }
        }

        // Draw Unpurified Greedy Enemy
        ctx.save();
        ctx.translate(enemy.x, enemy.y);

        // Shake if hit by laser
        if (isHitByLaser) {
          ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
        }

        // Outer Glow based on greed
        ctx.shadowColor = enemy.color;
        ctx.shadowBlur = isHitByLaser ? 16 : 8;

        // Base Circle
        ctx.fillStyle = enemy.color;
        ctx.beginPath();
        ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Emoji / Symbol inside
        ctx.font = `${enemy.radius * 1.1}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(enemy.avatarIcon, 0, 1);

        // Greed Health Bar
        const barWidth = enemy.radius * 2.2;
        const barHeight = 5;
        const greedPct = Math.max(0, enemy.currentGreed / enemy.maxGreed);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.fillRect(-barWidth / 2, -enemy.radius - 12, barWidth, barHeight);

        ctx.fillStyle = isHitByLaser ? '#F87171' : '#EF4444';
        ctx.fillRect(-barWidth / 2, -enemy.radius - 12, barWidth * greedPct, barHeight);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-barWidth / 2, -enemy.radius - 12, barWidth, barHeight);

        // Enemy Name
        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 9px sans-serif';
        ctx.fillText(enemy.name, 0, enemy.radius + 12);

        // Occasional greedy speech bubble
        if (Math.sin(timestamp * 0.002 + enemy.x) > 0.85) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(-60, -enemy.radius - 28, 120, 14);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
          ctx.strokeRect(-60, -enemy.radius - 28, 120, 14);
          ctx.fillStyle = '#FCA5A5';
          ctx.font = '8px sans-serif';
          ctx.fillText(enemy.quote.substring(0, 14) + '...', 0, -enemy.radius - 18);
        }

        ctx.restore();

        // Draw offscreen directional indicator if enemy is outside viewport
        const margin = 20;
        if (enemy.x < margin || enemy.x > w - margin || enemy.y < margin || enemy.y > h - margin) {
          const clampX = Math.max(margin, Math.min(w - margin, enemy.x));
          const clampY = Math.max(margin, Math.min(h - margin, enemy.y));
          ctx.save();
          ctx.fillStyle = enemy.color;
          ctx.beginPath();
          ctx.arc(clampX, clampY, 11, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#FFFFFF';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.font = '10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(enemy.avatarIcon, clampX, clampY);
          ctx.restore();
        }
      }

      if (isFiringInternalRef.current) {
        state.laserFiredTicks++;
        if (anyEnemyHitByLaser) {
          state.laserHitTicks++;
        }
        state.pacifistSec = 0;

        // Throttled stats notification (every 30 ticks ~ 500ms)
        if (state.laserFiredTicks >= 150 && state.laserFiredTicks % 30 === 0) {
          const accuracyPct = Math.round((state.laserHitTicks / state.laserFiredTicks) * 100);
          if (accuracyPct !== state.lastReportedAccuracy) {
            state.lastReportedAccuracy = accuracyPct;
            onStatsEvent?.({ type: 'laser_accuracy', accuracy: accuracyPct });
          }
        }
      } else {
        state.pacifistSec += dt / 1000;
        const currentSec = Math.floor(state.pacifistSec);
        if (currentSec !== state.lastReportedPacifistSec && currentSec <= 15) {
          state.lastReportedPacifistSec = currentSec;
          onStatsEvent?.({ type: 'pacifist_sec', sec: currentSec });
        }
      }

      // 5. Draw Righteous Dual-Core Laser Beam (if firing)
      if (isFiringInternalRef.current) {
        ctx.save();

        const endX = beakStartX + laserDirX * beamLength;
        const endY = beakStartY + laserDirY * beamLength;

        // Outer Soft Glow
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
        ctx.lineWidth = laserWidth * 2.2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(beakStartX, beakStartY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Secondary Golden Aura
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.65)';
        ctx.lineWidth = laserWidth * 1.2;
        ctx.beginPath();
        ctx.moveTo(beakStartX, beakStartY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Intense White Core with slight electric jitter
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = Math.max(3, laserWidth * 0.45);
        ctx.beginPath();
        ctx.moveTo(beakStartX, beakStartY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Muzzle Beak Flare
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(beakStartX, beakStartY, 8 + Math.random() * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#38BDF8';
        ctx.beginPath();
        ctx.arc(beakStartX, beakStartY, 14 + Math.random() * 6, 0, Math.PI * 2);
        ctx.fill();

        // Laser spark particles along the beam
        if (Math.random() < 0.5) {
          const sparkDist = Math.random() * 400;
          state.particles.push({
            x: beakStartX + laserDirX * sparkDist + (Math.random() - 0.5) * 10,
            y: beakStartY + laserDirY * sparkDist + (Math.random() - 0.5) * 10,
            vx: (Math.random() - 0.5) * 2,
            vy: (Math.random() - 0.5) * 2,
            life: 15,
            maxLife: 15,
            color: '#FBBF24',
            size: 2 + Math.random() * 2,
            shape: 'spark',
          });
        }

        ctx.restore();
      }

      // 6. Draw Center Hero: 咕咕雞 Zanna!
      ctx.save();
      ctx.translate(cx, cy);

      // Zanna's Protective Sanctity Shield
      const shieldHealthPct = Math.max(0, state.health / 100);
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.4 + shieldHealthPct * 0.5})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(0, 0, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Rotate Zanna towards mouse angle
      ctx.rotate(state.chickenAngle);

      // Wings with recoil flapping
      const wingFlap = state.flappingRecoil;
      ctx.fillStyle = '#E2E8F0';
      // Left Wing
      ctx.beginPath();
      ctx.ellipse(-10, -26 - wingFlap, 16, 9, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#CBD5E1';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Right Wing
      ctx.beginPath();
      ctx.ellipse(-10, 26 + wingFlap, 16, 9, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Hero Plump Chicken Body
      const bodyGrad = ctx.createRadialGradient(-5, 0, 5, 0, 0, 28);
      bodyGrad.addColorStop(0, '#FFFFFF');
      bodyGrad.addColorStop(0.7, '#F8FAFC');
      bodyGrad.addColorStop(1, '#E2E8F0');

      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Golden Halo behind Head
      ctx.save();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(-18, 0, 6, 16, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Righteous Red Comb on top
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(-8, -4, 6, 0, Math.PI * 2);
      ctx.arc(0, -6, 7, 0, Math.PI * 2);
      ctx.arc(8, -4, 6, 0, Math.PI * 2);
      ctx.fill();

      // Futuristic Cyber Sunglasses / Visor
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(8, -10, 10, 20);
      ctx.fillStyle = '#38BDF8';
      ctx.fillRect(10, -8, 6, 16);
      // Glint
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(12, -6, 2, 4);

      // Sharp Golden Beak (Laser Cannon Beak)
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.moveTo(22, -7);
      ctx.lineTo(34, 0);
      ctx.lineTo(22, 7);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#D97706';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();

      // 7. Update & Render Particles
      for (let p = state.particles.length - 1; p >= 0; p--) {
        const pt = state.particles[p];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life--;

        const alpha = Math.max(0, pt.life / pt.maxLife);
        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = alpha;

        if (pt.shape === 'star') {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        } else if (pt.shape === 'coin') {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#D97706';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, pt.size * alpha, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        if (pt.life <= 0) {
          state.particles.splice(p, 1);
        }
      }

      // 8. Update & Render Floating Texts
      for (let t = state.floatingTexts.length - 1; t >= 0; t--) {
        const ft = state.floatingTexts[t];
        ft.y -= 0.6;
        ft.life--;

        const alpha = Math.min(1, ft.life / 20);
        ctx.save();
        ctx.font = `bold ${ft.fontSize || 12}px sans-serif`;
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = alpha;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 4;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();

        if (ft.life <= 0) {
          state.floatingTexts.splice(t, 1);
        }
      }

      ctx.restore();

      // 9. Check Wave Completion & Track Remaining Count
      const unpurifiedRemaining = state.enemies.filter((e) => !e.isPurified).length;
      const totalRemaining = state.waveSpawnRemaining + unpurifiedRemaining;

      if (state.waveActive && state.waveTotalToSpawn > 0) {
        setRemainingEnemies?.(totalRemaining);
      }

      if (
        state.waveActive &&
        totalRemaining === 0 &&
        state.waveTotalToSpawn > 0
      ) {
        state.waveActive = false;
        setRemainingEnemies?.(0);
        sound.stopLaser();
        isFiringInternalRef.current = false;
        setIsFiring(false);

        // Unlock next rule for wave completion (Wave 1->Rule 6, Wave 2->Rule 7, etc.)
        const waveUnlockRuleId = 5 + wave;
        if (waveUnlockRuleId <= 10) {
          setRules((prevRules) =>
            prevRules.map((r) => {
              if (r.id === waveUnlockRuleId && !r.unlocked) {
                return { ...r, unlocked: true };
              }
              return r;
            })
          );
        }

        sound.playRuleUnlockFanfare();
        confetti({ particleCount: 75, spread: 75, origin: { y: 0.55 } });

        state.floatingTexts.push({
          id: Math.random().toString(),
          x: cx,
          y: cy - 70,
          text: wave >= maxWave ? '👑 終極大勝！爆倉前社長查爾斯已徹底醒悟！' : `🎉 第 ${wave} 波侵蝕淨化完成！前往修煉工坊...`,
          color: '#34D399',
          life: 110,
          maxLife: 110,
          fontSize: 20,
        });

        onStatsEvent?.({ type: 'wave_clear_health', health: state.health });

        setTimeout(() => {
          if (wave >= maxWave) {
            onGameOver(true);
          } else {
            onWaveComplete();
          }
        }, 1250);
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousemove', handlePointerMove);
      canvas.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('mouseup', handlePointerUp);
      canvas.removeEventListener('touchmove', handlePointerMove);
      canvas.removeEventListener('touchstart', handlePointerDown);
      window.removeEventListener('touchend', handlePointerUp);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [
    wave,
    maxWave,
    setHealth,
    setFunds,
    setRage,
    setPurifiedCount,
    setCombo,
    setMaxCombo,
    setRules,
    onWaveComplete,
    onGameOver,
    triggerUltimate,
    onStatsEvent,
    gameState,
    setRemainingEnemies,
    setIsFiring,
  ]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center overflow-hidden cursor-crosshair select-none touch-none">
      <canvas
        ref={canvasRef}
        className="w-full h-full max-h-[650px] rounded-xl border border-slate-800 shadow-2xl bg-slate-950"
      />
    </div>
  );
};
