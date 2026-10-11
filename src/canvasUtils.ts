import { Unit, Shot, PlayerId, TerrainType, UnitType, UNIT_SPECS } from './types';

export const P1_COLOR = '#1d4ed8'; // Royal Ballpoint Blue
export const P2_COLOR = '#dc2626'; // Vivid Ballpoint Red

// Water zone is in the lower section of the canvas (yRatio >= 0.70)
export function isPointInWater(xRatio: number, yRatio: number): boolean {
  // Gentle wavy shoreline along yRatio ~ 0.70
  const shoreLine = 0.70 + Math.sin(xRatio * Math.PI * 4) * 0.03;
  return yRatio >= shoreLine;
}

// Bunkers / Obstacles that block shots
export const OBSTACLES = [
  // Player 1 side (Left)
  { xRatio: 0.22, yRatio: 0.32, radius: 0.065, name: 'سنگر کوهستانی الف' },
  { xRatio: 0.36, yRatio: 0.52, radius: 0.055, name: 'پناه‌گاه سنگی ب' },
  // Player 2 side (Right - symmetric)
  { xRatio: 0.78, yRatio: 0.32, radius: 0.065, name: 'سنگر کوهستانی ج' },
  { xRatio: 0.64, yRatio: 0.52, radius: 0.055, name: 'پناه‌گاه سنگی د' },
];

export function isPointInObstacle(xRatio: number, yRatio: number): boolean {
  return OBSTACLES.some((obs) => {
    const dx = obs.xRatio - xRatio;
    const dy = obs.yRatio - yRatio;
    return Math.sqrt(dx * dx + dy * dy) <= obs.radius;
  });
}

// Draw Pure Clean White Paper Canvas
export function drawCleanWhitePaper(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  terrain: TerrainType
) {
  // 1. Pure clean white paper background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle clean border
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.strokeRect(0, 0, width, height);

  // 2. Terrains
  if (terrain === 'river') {
    // Water zone in the lower section (بخش پایین برای استقرار قایق‌ها)
    ctx.save();
    ctx.beginPath();
    const steps = 60;
    // Draw wavy shoreline across width
    for (let i = 0; i <= steps; i++) {
      const xr = i / steps;
      const x = xr * width;
      const y = (0.70 + Math.sin(xr * Math.PI * 4) * 0.03) * height;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    // Complete rectangle to bottom
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    // Watercolor blue gradient
    const waterGrad = ctx.createLinearGradient(0, height * 0.7, 0, height);
    waterGrad.addColorStop(0, 'rgba(186, 230, 253, 0.45)');
    waterGrad.addColorStop(1, 'rgba(125, 211, 252, 0.65)');
    ctx.fillStyle = waterGrad;
    ctx.fill();

    // Shoreline dashed line
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Water ripple doodles
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.5)';
    ctx.lineWidth = 1;
    for (let rx = 0.08; rx <= 0.95; rx += 0.14) {
      const px = rx * width;
      const py = height * 0.84 + Math.sin(rx * 12) * 12;
      ctx.beginPath();
      ctx.moveTo(px - 14, py);
      ctx.quadraticCurveTo(px - 7, py - 3, px, py);
      ctx.quadraticCurveTo(px + 7, py + 3, px + 14, py);
      ctx.stroke();
    }

    // Water label
    ctx.font = '10px Vazirmatn, sans-serif';
    ctx.fillStyle = 'rgba(2, 132, 199, 0.7)';
    ctx.textAlign = 'left';
    ctx.fillText('🌊 پهنه آبی / رودخانه (مخصوص قایق‌ها)', 16, height - 12);
    ctx.restore();
  } else if (terrain === 'obstacles') {
    // Rocky obstacles / bunkers that block bullets
    ctx.save();
    OBSTACLES.forEach((obs) => {
      const ox = obs.xRatio * width;
      const oy = obs.yRatio * height;
      const or = obs.radius * width;

      // Heavy granite rock sketch
      ctx.fillStyle = '#f8fafc';
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 2;

      ctx.beginPath();
      const points = 8;
      for (let p = 0; p < points; p++) {
        const ang = (p * Math.PI * 2) / points;
        const rad = or * (0.8 + Math.sin(p * 2.7) * 0.2);
        const px = ox + Math.cos(ang) * rad;
        const py = oy + Math.sin(ang) * rad;
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Rock interior hatch marks
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let h = -or * 0.5; h <= or * 0.5; h += 9) {
        ctx.moveTo(ox + h - 8, oy - 10);
        ctx.lineTo(ox + h + 8, oy + 10);
      }
      ctx.stroke();

      // Shield label
      ctx.font = 'bold 10px Vazirmatn, sans-serif';
      ctx.fillStyle = '#475569';
      ctx.textAlign = 'center';
      ctx.fillText('🛡️ سنگر بتنی', ox, oy + or + 14);
    });
    ctx.restore();
  }

  // 3. Middle Fold Crease (خط تای وسط - خط عمودی نقطه‌چین باریک و ظریف در x = Width / 2)
  const midX = width / 2;

  // Delicate fold line (thin dotted)
  ctx.beginPath();
  ctx.setLineDash([4, 4]);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.75)';
  ctx.moveTo(midX, 0);
  ctx.lineTo(midX, height);
  ctx.stroke();
  ctx.setLineDash([]); // reset

  // Crease label
  ctx.font = '11px Vazirmatn, sans-serif';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.textAlign = 'center';
  ctx.fillText('✂ خط تا کردن کاغذ', midX, 18);
}

// Draw Unit with Scaling, HP Pips, and Upgrade Badges
export function drawUnit(
  ctx: CanvasRenderingContext2D,
  unit: Unit,
  canvasWidth: number,
  canvasHeight: number,
  unitScale: number = 1.0,
  isVisible: boolean = true,
  isSelected: boolean = false
) {
  if (!isVisible && !unit.isDestroyed) return;

  const x = unit.xRatio * canvasWidth;
  const y = unit.yRatio * canvasHeight;
  const color = unit.player === 1 ? P1_COLOR : P2_COLOR;
  const hitR = UNIT_SPECS[unit.type].baseHitRadius * unitScale;

  ctx.save();
  ctx.translate(x, y);

  if (unit.isDestroyed) {
    ctx.globalAlpha = 0.45;
  }

  // Selected highlight ring
  if (isSelected && !unit.isDestroyed) {
    ctx.beginPath();
    ctx.arc(0, 0, hitR + 8, 0, Math.PI * 2);
    ctx.strokeStyle = '#eab308'; // Gold highlight
    ctx.lineWidth = 2.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 10px Vazirmatn, sans-serif';
    ctx.fillStyle = '#ca8a04';
    ctx.textAlign = 'center';
    ctx.fillText('آماده شلیک 🎯', 0, -hitR - 12);
  }

  // HP Indicators & Upgrade Badges above unit
  if (!unit.isDestroyed) {
    ctx.save();
    // HP Pips
    const pipRadius = 3;
    const totalPips = unit.maxHp;
    const pipsStartX = -((totalPips - 1) * (pipRadius * 2 + 3)) / 2;
    const pipsY = -hitR - 5;

    for (let p = 0; p < totalPips; p++) {
      const px = pipsStartX + p * (pipRadius * 2 + 3);
      ctx.beginPath();
      ctx.arc(px, pipsY, pipRadius, 0, Math.PI * 2);
      if (p < unit.hp) {
        ctx.fillStyle = '#10b981'; // Green full HP
        ctx.fill();
        ctx.strokeStyle = '#059669';
      } else {
        ctx.fillStyle = '#e2e8f0'; // Empty lost HP
        ctx.fill();
        ctx.strokeStyle = '#94a3b8';
      }
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Upgrades badge (star)
    const upgradeLevel = unit.upgrades.extraHp + unit.upgrades.inkRadiusBoost + (unit.upgrades.windResistance ? 1 : 0);
    if (upgradeLevel > 0) {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#eab308';
      ctx.textAlign = 'center';
      ctx.fillText('★'.repeat(Math.min(3, upgradeLevel)), 0, hitR + 13);
    }
    ctx.restore();
  }

  ctx.rotate(unit.angle);
  ctx.scale(unitScale, unitScale);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (unit.type === 'soldier') {
    // 🪖 Soldier: Stick figure with helmet and rifle
    ctx.fillStyle = unit.player === 1 ? 'rgba(29, 78, 216, 0.15)' : 'rgba(220, 38, 38, 0.15)';
    ctx.beginPath();
    ctx.arc(0, -9, 5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6, -8); ctx.lineTo(6, -8); // Helmet brim
    ctx.moveTo(0, -4); ctx.lineTo(0, 6); // Spine
    ctx.moveTo(0, 6); ctx.lineTo(-5, 13); // Leg L
    ctx.moveTo(0, 6); ctx.lineTo(5, 13); // Leg R
    const dir = unit.player === 1 ? 1 : -1;
    ctx.moveTo(0, 0); ctx.lineTo(dir * 11, -3); // Arm & Rifle
    ctx.lineTo(dir * 16, -7); // Rifle barrel
    ctx.stroke();
  } else if (unit.type === 'tank') {
    // 🛡️ Tank: Body, treads, turret, cannon
    ctx.fillStyle = unit.player === 1 ? 'rgba(29, 78, 216, 0.12)' : 'rgba(220, 38, 38, 0.12)';
    ctx.fillRect(-15, -10, 30, 20);
    ctx.strokeRect(-15, -10, 30, 20);

    ctx.strokeRect(-16, -14, 32, 4);
    ctx.strokeRect(-16, 10, 32, 4);

    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    const dir = unit.player === 1 ? 1 : -1;
    ctx.beginPath();
    ctx.lineWidth = 3.2;
    ctx.moveTo(dir * 7, 0); ctx.lineTo(dir * 22, 0);
    ctx.stroke();
  } else if (unit.type === 'boat') {
    // 🛥️ Boat: Warship with hull, superstructure, gun turret
    ctx.fillStyle = unit.player === 1 ? 'rgba(29, 78, 216, 0.15)' : 'rgba(220, 38, 38, 0.15)';
    const dir = unit.player === 1 ? 1 : -1;

    ctx.beginPath();
    ctx.moveTo(dir * 22, 0);
    ctx.lineTo(dir * 14, -9);
    ctx.lineTo(-dir * 18, -9);
    ctx.lineTo(-dir * 18, 9);
    ctx.lineTo(dir * 14, 9);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    ctx.strokeRect(-dir * 6, -5, 12, 10);
    ctx.beginPath();
    ctx.lineWidth = 2.6;
    ctx.moveTo(dir * 8, 0); ctx.lineTo(dir * 19, -4);
    ctx.stroke();
  } else if (unit.type === 'plane') {
    // ✈️ Airplane: Swept wing fighter jet
    ctx.fillStyle = unit.player === 1 ? 'rgba(29, 78, 216, 0.14)' : 'rgba(220, 38, 38, 0.14)';
    const dir = unit.player === 1 ? 1 : -1;

    // Fuselage
    ctx.beginPath();
    ctx.moveTo(dir * 22, 0);
    ctx.lineTo(-dir * 14, -5);
    ctx.lineTo(-dir * 18, 0);
    ctx.lineTo(-dir * 14, 5);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // Wings
    ctx.beginPath();
    ctx.moveTo(dir * 4, 0);
    ctx.lineTo(-dir * 6, -18);
    ctx.lineTo(-dir * 12, -18);
    ctx.lineTo(-dir * 4, 0);
    ctx.lineTo(-dir * 12, 18);
    ctx.lineTo(-dir * 6, 18);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  ctx.restore();

  // Destroyed scratch scribble
  if (unit.isDestroyed) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-18 * unitScale, -16 * unitScale);
    ctx.lineTo(18 * unitScale, 16 * unitScale);
    ctx.moveTo(-18 * unitScale, 16 * unitScale);
    ctx.lineTo(18 * unitScale, -16 * unitScale);
    ctx.moveTo(-20 * unitScale, 0);
    ctx.lineTo(20 * unitScale, 0);
    ctx.stroke();

    ctx.font = 'bold 11px Vazirmatn, sans-serif';
    ctx.fillStyle = '#dc2626';
    ctx.textAlign = 'center';
    ctx.fillText('منهدم شد!', 0, -20 * unitScale);
    ctx.restore();
  }
}

// Draw Shots (Source pen dot and mirrored landing imprint)
export function drawShot(
  ctx: CanvasRenderingContext2D,
  shot: Shot,
  canvasWidth: number,
  canvasHeight: number,
  index: number
) {
  const sx = shot.sourceXRatio * canvasWidth;
  const sy = shot.sourceYRatio * canvasHeight;
  const tx = shot.targetXRatio * canvasWidth;
  const ty = shot.targetYRatio * canvasHeight;
  const col = shot.player === 1 ? P1_COLOR : P2_COLOR;
  const r = shot.inkRadius;

  // Source ink dot
  ctx.save();
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(sx, sy, r * 0.85, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = shot.player === 1 ? 'rgba(29, 78, 216, 0.22)' : 'rgba(220, 38, 38, 0.22)';
  ctx.beginPath();
  ctx.arc(sx, sy, r * 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = '10px Vazirmatn, sans-serif';
  ctx.fillStyle = 'rgba(100, 116, 139, 0.8)';
  ctx.textAlign = 'center';
  ctx.fillText(`#${index + 1}`, sx, sy - r - 4);

  // Mirrored imprint on opponent side
  ctx.fillStyle = col;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(tx, ty, r, 0, Math.PI * 2);
  ctx.fill();

  // Imprint pressure ring
  ctx.strokeStyle = col;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(tx, ty, r * 1.4, 0, Math.PI * 2);
  ctx.stroke();

  if (shot.isHit) {
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(tx, ty, r * 2.2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = 'bold 11px Vazirmatn, sans-serif';
    ctx.fillStyle = '#dc2626';
    ctx.textAlign = 'center';
    const bonusText = shot.unitDestroyed ? ` (+${shot.bountyEarned}🪙 غنیمت)` : ' (-۱ HP)';
    ctx.fillText(`اصابت! 🎯${bonusText}`, tx, ty - r - 8);
  } else if (shot.isBlockedByObstacle) {
    ctx.font = 'bold 10px Vazirmatn, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('برخورد به سنگر! 🛡️', tx, ty - r - 6);
  } else {
    // Miss marker
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(tx, ty, r * 1.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

// Aim Preview
export function drawAimPreview(
  ctx: CanvasRenderingContext2D,
  hoverX: number,
  hoverY: number,
  player: PlayerId,
  selectedUnit: Unit | null,
  canvasWidth: number,
  unitScale: number,
  showMirrorHint: boolean,
  windOffsetPx: { x: number; y: number }
) {
  const isP1 = player === 1;
  const midX = canvasWidth / 2;

  // Validate hover on own half
  const isValidSide = isP1 ? hoverX < midX - 10 : hoverX > midX + 10;
  if (!isValidSide) return;

  const mirrorX = canvasWidth - hoverX + windOffsetPx.x;
  const mirrorY = hoverY + windOffsetPx.y;
  const color = isP1 ? P1_COLOR : P2_COLOR;

  const inkR = (selectedUnit
    ? UNIT_SPECS[selectedUnit.type].baseInkRadius + selectedUnit.upgrades.inkRadiusBoost * 2.5
    : 8) * unitScale;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(hoverX, hoverY, inkR, 0, Math.PI * 2);
  ctx.stroke();

  // Crosshair
  ctx.beginPath();
  ctx.moveTo(hoverX - inkR - 4, hoverY);
  ctx.lineTo(hoverX + inkR + 4, hoverY);
  ctx.moveTo(hoverX, hoverY - inkR - 4);
  ctx.lineTo(hoverX, hoverY + inkR + 4);
  ctx.stroke();

  if (showMirrorHint) {
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hoverX, hoverY);
    ctx.lineTo(mirrorX, mirrorY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(mirrorX, mirrorY, inkR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.font = '10px Vazirmatn, sans-serif';
    ctx.fillStyle = 'rgba(234, 88, 12, 0.9)';
    ctx.textAlign = 'center';
    ctx.fillText('نقطه فرود جوهر', mirrorX, mirrorY - inkR - 5);
  }
  ctx.restore();
}
