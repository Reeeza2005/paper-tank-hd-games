import { Unit, Shot, PlayerId, TerrainType, FoldLineMode, ThemeMode, UNIT_SPECS } from './types';

export const P1_COLOR = '#00d2ff'; // Cyber Cyan / Tactical Blue
export const P2_COLOR = '#ff3b57'; // Neon Crimson / Tactical Red
export const P1_FILL = 'rgba(0, 210, 255, 0.2)';
export const P2_FILL = 'rgba(255, 59, 87, 0.2)';

export function getFoldAngle(mode: FoldLineMode): number {
  if (mode === 'slight_right') return (9 * Math.PI) / 180; // +9 deg
  if (mode === 'slight_left') return (-9 * Math.PI) / 180; // -9 deg
  return 0; // vertical center
}

export function getFoldLineParams(width: number, height: number, mode: FoldLineMode) {
  const p0x = width * 0.5;
  const p0y = height * 0.5;
  const angle = getFoldAngle(mode);
  const nx = Math.cos(angle);
  const ny = Math.sin(angle);
  return { p0x, p0y, nx, ny, angle };
}

export function getPlayerSideForPoint(
  px: number,
  py: number,
  width: number,
  height: number,
  mode: FoldLineMode
): PlayerId {
  const { p0x, p0y, nx, ny } = getFoldLineParams(width, height, mode);
  const dot = (px - p0x) * nx + (py - p0y) * ny;
  return dot < 0 ? 1 : 2;
}

export function reflectAcrossFoldLine(
  px: number,
  py: number,
  width: number,
  height: number,
  mode: FoldLineMode
): { rx: number; ry: number } {
  const { p0x, p0y, nx, ny } = getFoldLineParams(width, height, mode);
  const dot = (px - p0x) * nx + (py - p0y) * ny;
  const rx = px - 2 * dot * nx;
  const ry = py - 2 * dot * ny;
  return { rx, ry };
}

// Check if point is inside water in River terrain (yRatio >= 0.70)
export function isPointInWater(xRatio: number, yRatio: number): boolean {
  const shoreLine = 0.70 + Math.sin(xRatio * Math.PI * 4) * 0.03;
  return yRatio >= shoreLine;
}

// Check if an allied unit is shielded by an active friendly bunker
export function getBunkerProtectingUnit(
  unit: Unit,
  allUnits: Unit[],
  width: number,
  height: number,
  unitScale: number
): Unit | null {
  if (unit.type === 'bunker') return null; // A bunker doesn't protect another bunker

  const ux = unit.xRatio * width;
  const uy = unit.yRatio * height;

  const friendlyBunkers = allUnits.filter(
    (u) => u.player === unit.player && u.type === 'bunker' && !u.isDestroyed
  );

  for (const bunker of friendlyBunkers) {
    const bx = bunker.xRatio * width;
    const by = bunker.yRatio * height;
    const dist = Math.hypot(ux - bx, uy - by);
    const auraR = (UNIT_SPECS.bunker.bunkerAuraRadius || 55) * unitScale;
    if (dist <= auraR) {
      return bunker;
    }
  }

  return null;
}

// Render Dark / Light Tactical HD Map Background (Clean Minimal Battlefield)
export function drawTacticalBattlefield(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  terrain: TerrainType,
  foldMode: FoldLineMode,
  timestamp: number,
  theme: ThemeMode = 'night'
) {
  const isDay = theme === 'day';

  // 1. High-Definition Clean Background (No Grid lines, No Aiming aids)
  if (isDay) {
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.2,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.75
    );
    bgGrad.addColorStop(0, '#f8fafc');
    bgGrad.addColorStop(1, '#e2e8f0');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(12, 12, width - 24, height - 24);

    const cornerSize = 14;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(12, 12 + cornerSize); ctx.lineTo(12, 12); ctx.lineTo(12 + cornerSize, 12); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - 12 - cornerSize, 12); ctx.lineTo(width - 12, 12); ctx.lineTo(width - 12, 12 + cornerSize); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, height - 12 - cornerSize); ctx.lineTo(12, height - 12); ctx.lineTo(12 + cornerSize, height - 12); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - 12 - cornerSize, height - 12); ctx.lineTo(width - 12, height - 12); ctx.lineTo(width - 12, height - 12 - cornerSize); ctx.stroke();
    ctx.restore();
  } else {
    const bgGrad = ctx.createRadialGradient(
      width * 0.5,
      height * 0.5,
      Math.min(width, height) * 0.2,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.75
    );
    bgGrad.addColorStop(0, '#0c1322');
    bgGrad.addColorStop(1, '#060a12');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(12, 12, width - 24, height - 24);

    const cornerSize = 14;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(12, 12 + cornerSize); ctx.lineTo(12, 12); ctx.lineTo(12 + cornerSize, 12); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - 12 - cornerSize, 12); ctx.lineTo(width - 12, 12); ctx.lineTo(width - 12, 12 + cornerSize); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12, height - 12 - cornerSize); ctx.lineTo(12, height - 12); ctx.lineTo(12 + cornerSize, height - 12); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width - 12 - cornerSize, height - 12); ctx.lineTo(width - 12, height - 12); ctx.lineTo(width - 12, height - 12 - cornerSize); ctx.stroke();
    ctx.restore();
  }

  // 2. Terrain: River & Coastal Waters
  if (terrain === 'river') {
    ctx.save();
    const waterGrad = ctx.createLinearGradient(0, height * 0.7, 0, height);
    if (isDay) {
      waterGrad.addColorStop(0, 'rgba(14, 165, 233, 0.35)');
      waterGrad.addColorStop(1, 'rgba(3, 105, 161, 0.65)');
    } else {
      waterGrad.addColorStop(0, 'rgba(14, 116, 144, 0.45)');
      waterGrad.addColorStop(1, 'rgba(6, 78, 59, 0.65)');
    }

    const wavePhase = timestamp * 0.003;
    ctx.beginPath();
    const steps = 80;
    for (let i = 0; i <= steps; i++) {
      const xr = i / steps;
      const x = xr * width;
      const wave = Math.sin(xr * Math.PI * 6 + wavePhase) * 4;
      const y = (0.7 + Math.sin(xr * Math.PI * 4) * 0.03) * height + wave;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fillStyle = waterGrad;
    ctx.fill();

    // Shoreline Wave Edge
    ctx.strokeStyle = isDay ? '#0284c7' : '#06b6d4';
    ctx.lineWidth = 2.4;
    ctx.shadowColor = isDay ? '#0284c7' : '#06b6d4';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // 3. Dynamic Laser Fold Line
  ctx.save();
  const { p0x, p0y, nx, ny } = getFoldLineParams(width, height, foldMode);

  // Line points intersecting canvas top and bottom
  const topY = 0;
  const topX = p0x - (topY - p0y) * (ny / nx);
  const botY = height;
  const botX = p0x - (botY - p0y) * (ny / nx);

  // Glowing laser seam
  ctx.strokeStyle = isDay ? 'rgba(147, 51, 234, 0.25)' : 'rgba(168, 85, 247, 0.35)';
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(topX, topY);
  ctx.lineTo(botX, botY);
  ctx.stroke();

  ctx.strokeStyle = isDay ? '#9333ea' : '#c084fc';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.shadowColor = isDay ? '#9333ea' : '#c084fc';
  ctx.shadowBlur = isDay ? 6 : 10;
  ctx.beginPath();
  ctx.moveTo(topX, topY);
  ctx.lineTo(botX, botY);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);

  // Laser Fold Center Badge
  const midX = (topX + botX) / 2;
  const midY = height * 0.07;
  ctx.font = 'bold 11px Vazirmatn, sans-serif';
  ctx.fillStyle = isDay ? '#6b21a8' : '#e9d5ff';
  ctx.textAlign = 'center';
  const modeLabel =
    foldMode === 'slight_right'
      ? '📐 خط تا: مورب راست (+۹°)'
      : foldMode === 'slight_left'
      ? '📐 خط تا: مورب چپ (-۹°)'
      : '✂ خط تا: عمودی مرکز (۰°)';
  ctx.fillText(modeLabel, midX, midY);
  ctx.restore();
}

// Render Dark Tactical Vector Units
export function drawTacticalUnit(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  canvasWidth: number,
  canvasHeight: number,
  unitScale: number,
  isSelected: boolean,
  timestamp: number
) {
  const ux = unit.xRatio * canvasWidth;
  const uy = unit.yRatio * canvasHeight;
  const col = unit.player === 1 ? P1_COLOR : P2_COLOR;
  const hitR = UNIT_SPECS[unit.type].baseHitRadius * unitScale;
  const dir = unit.player === 1 ? 1 : -1;

  ctx.save();
  ctx.translate(ux, uy);

  if (unit.isDestroyed) {
    ctx.globalAlpha = 0.45;
  }

  // 1. Bunker Forcefield Aura Rendering (if this unit is a bunker)
  if (unit.type === 'bunker' && !unit.isDestroyed) {
    ctx.save();
    const auraRadius = (UNIT_SPECS.bunker.bunkerAuraRadius || 55) * unitScale;
    const pulse = Math.sin(timestamp * 0.005) * 3;

    // Glowing shield field
    ctx.beginPath();
    ctx.arc(0, 0, auraRadius + pulse, 0, Math.PI * 2);
    ctx.fillStyle = unit.player === 1 ? 'rgba(0, 210, 255, 0.08)' : 'rgba(255, 59, 87, 0.08)';
    ctx.fill();

    ctx.strokeStyle = unit.player === 1 ? 'rgba(0, 210, 255, 0.5)' : 'rgba(255, 59, 87, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.stroke();

    // Shield Icon tag
    ctx.font = '10px Vazirmatn, sans-serif';
    ctx.fillStyle = col;
    ctx.textAlign = 'center';
    ctx.fillText('🛡️ هاله دفاعی', 0, auraRadius + 14);
    ctx.restore();
  }

  // 2. Selection Reticle
  if (isSelected && !unit.isDestroyed) {
    ctx.save();
    const pulse = (Math.sin(timestamp * 0.008) + 1) * 2;
    ctx.beginPath();
    ctx.arc(0, 0, hitR + 8 + pulse, 0, Math.PI * 2);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2.4;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Health Pips & Cooldown Badges
  if (!unit.isDestroyed) {
    const totalHp = unit.maxHp;
    const pipSpacing = 8;
    const startX = -((totalHp - 1) * pipSpacing) / 2;
    for (let p = 0; p < totalHp; p++) {
      ctx.beginPath();
      ctx.arc(startX + p * pipSpacing, -hitR - 8, 3, 0, Math.PI * 2);
      ctx.fillStyle = p < unit.hp ? '#10b981' : '#475569';
      ctx.fill();
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Cooldown Hourglass Badge
    if (unit.cooldownRemaining > 0) {
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(hitR + 4, -hitR - 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '8px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText('⏳', hitR + 4, -hitR - 1);
    }
  }

  // 4. Vector Sprite Drawing
  ctx.scale(unitScale, unitScale);

  if (unit.type === 'soldier') {
    // Ground tactical shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.beginPath();
    ctx.ellipse(0, 12, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-2, 4);
    ctx.lineTo(-4, 12);
    ctx.moveTo(2, 4);
    ctx.lineTo(4, 12);
    ctx.stroke();

    // Body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.roundRect(-5, -4, 10, 9, 2);
    ctx.fill();
    ctx.stroke();

    // Helmet & Visor
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(0, -9, 5.5, Math.PI, 0);
    ctx.fill();

    // Neon Cyber Visor
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(dir * -1, -8, 5.5, 2.5);

    // Sniper / AA Rifle
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-dir * 2, 0);
    ctx.lineTo(dir * 14, -3);
    ctx.stroke();
  } else if (unit.type === 'tank') {
    // Tracks
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-17, -13, 34, 5);
    ctx.strokeRect(-17, -13, 34, 5);
    ctx.fillRect(-17, 8, 34, 5);
    ctx.strokeRect(-17, 8, 34, 5);

    // Hull
    ctx.fillStyle = col;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-15, -8, 30, 16, 3);
    ctx.fill();
    ctx.stroke();

    // Turret
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(dir * -1, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.stroke();

    // Cannon Barrel
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3.6;
    ctx.beginPath();
    ctx.moveTo(dir * 5, 0);
    ctx.lineTo(dir * 23, 0);
    ctx.stroke();
  } else if (unit.type === 'plane') {
    const hoverY = Math.sin(timestamp * 0.004 + unit.xRatio * 10) * 3;
    // Projected ground shadow
    ctx.save();
    ctx.translate(0, 18 - hoverY);
    ctx.scale(1.1, 0.4);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.translate(0, hoverY);

    // Delta-Wing Stealth Jet
    ctx.fillStyle = col;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.moveTo(dir * 23, 0);
    ctx.lineTo(dir * 5, -5);
    ctx.lineTo(-dir * 8, -20);
    ctx.lineTo(-dir * 14, -18);
    ctx.lineTo(-dir * 8, -4);
    ctx.lineTo(-dir * 18, -10);
    ctx.lineTo(-dir * 20, 0);
    ctx.lineTo(-dir * 18, 10);
    ctx.lineTo(-dir * 8, 4);
    ctx.lineTo(-dir * 14, 18);
    ctx.lineTo(-dir * 8, 20);
    ctx.lineTo(dir * 5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing Cockpit Canopy
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.ellipse(dir * 6, 0, 7, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (unit.type === 'boat') {
    // Water wake waves
    ctx.strokeStyle = 'rgba(6, 182, 212, 0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(dir * 24, 0);
    ctx.quadraticCurveTo(dir * 14, -14, -dir * 18, -14);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(dir * 24, 0);
    ctx.quadraticCurveTo(dir * 14, 14, -dir * 18, 14);
    ctx.stroke();

    // Naval Stealth Hull
    ctx.fillStyle = col;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(dir * 23, 0);
    ctx.lineTo(dir * 14, -9);
    ctx.lineTo(-dir * 18, -9);
    ctx.lineTo(-dir * 18, 9);
    ctx.lineTo(dir * 14, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Deck Cabin & Radar
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(-dir * 4, -5, 11, 10);
    ctx.strokeStyle = '#38bdf8';
    ctx.strokeRect(-dir * 4, -5, 11, 10);

    // Gun Turret
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(dir * 11, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#cbd5e1';
    ctx.beginPath();
    ctx.moveTo(dir * 11, 0);
    ctx.lineTo(dir * 19, 0);
    ctx.stroke();
  } else if (unit.type === 'bunker') {
    // Reinforced Hexagonal Bunker
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.2;

    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const bAng = (i * Math.PI) / 3;
      const bx = Math.cos(bAng) * 16;
      const by = Math.sin(bAng) * 16;
      if (i === 0) ctx.moveTo(bx, by);
      else ctx.lineTo(bx, by);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Embrasures (Cross pattern)
    ctx.fillStyle = col;
    ctx.fillRect(-10, -2.5, 20, 5);
    ctx.fillRect(-2.5, -10, 5, 20);
  } else if (unit.type === 'factory') {
    // High-tech Munitions Factory
    ctx.fillStyle = col;
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(-17, -8, 34, 18);
    ctx.fill();
    ctx.stroke();

    // Industrial saw-tooth roof
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-17, -8);
    ctx.lineTo(-8, -17);
    ctx.lineTo(-8, -8);
    ctx.lineTo(1, -17);
    ctx.lineTo(1, -8);
    ctx.lineTo(10, -17);
    ctx.lineTo(10, -8);
    ctx.lineTo(17, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Twin Chimneys with Smoke
    ctx.fillStyle = '#334155';
    ctx.fillRect(-15, -22, 5, 14);
    ctx.fillRect(10, -22, 5, 14);

    if (!unit.isDestroyed) {
      const puff = (Math.sin(timestamp * 0.005 + unit.xRatio * 10) + 1) * 3;
      ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.beginPath();
      ctx.arc(-12.5, -28 - puff, 3.5 + puff * 0.5, 0, Math.PI * 2);
      ctx.arc(12.5, -27 - puff * 0.8, 3 + puff * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();

  // 5. Wrecked / Destroyed Cross
  if (unit.isDestroyed) {
    ctx.save();
    ctx.translate(ux, uy);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-14, -14);
    ctx.lineTo(14, 14);
    ctx.moveTo(-14, 14);
    ctx.lineTo(14, -14);
    ctx.stroke();
    ctx.font = 'bold 10px Vazirmatn, sans-serif';
    ctx.fillStyle = '#ef4444';
    ctx.textAlign = 'center';
    ctx.fillText('منهدم', 0, -hitR - 6);
    ctx.restore();
  }
}

// Draw Kinetic Laser / Impact Shots
export function drawTacticalShot(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  canvasWidth: number,
  canvasHeight: number
) {
  const sx = shot.sourceXRatio * canvasWidth;
  const sy = shot.sourceYRatio * canvasHeight;
  const tx = shot.targetXRatio * canvasWidth;
  const ty = shot.targetYRatio * canvasHeight;
  const col = shot.player === 1 ? P1_COLOR : P2_COLOR;
  const r = shot.inkRadius;

  // Source Firing Point
  ctx.save();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Target Impact Blast Ring
  ctx.beginPath();
  ctx.arc(tx, ty, r, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Direct Hit Indicator
  if (shot.isHit) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.arc(tx, ty, r * 1.8, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Absorbed by Bunker Shield Indicator
  if (shot.absorbedByBunkerId) {
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(tx, ty, r * 2.2, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
