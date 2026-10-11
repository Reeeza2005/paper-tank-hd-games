import {
  Unit,
  Shot,
  AIDifficulty,
  TerrainType,
  UnitType,
  UNIT_SPECS,
  Wind,
  FoldLineMode,
  validateCombatTarget,
} from './types';
import { isPointInWater, reflectAcrossFoldLine } from './canvasUtils';

export function generateAISquad(terrain: TerrainType, budget: number = 1000): Unit[] {
  const units: Unit[] = [];
  let remainingBudget = budget;

  // Strategic AI composition
  const desireList: UnitType[] =
    terrain === 'river'
      ? ['plane', 'factory', 'bunker', 'tank', 'boat', 'soldier', 'tank']
      : ['plane', 'factory', 'bunker', 'tank', 'tank', 'soldier', 'soldier'];

  for (const type of desireList) {
    const spec = UNIT_SPECS[type];
    if (remainingBudget < spec.cost) continue;

    let placed = false;
    let attempts = 0;

    while (!placed && attempts < 120) {
      attempts++;
      const xRatio = 0.55 + Math.random() * 0.38;
      let yRatio = 0.12 + Math.random() * 0.78;

      if (type === 'boat') {
        if (terrain !== 'river') continue;
        yRatio = 0.74 + Math.random() * 0.2;
        if (!isPointInWater(xRatio, yRatio)) continue;
      } else {
        if (terrain === 'river' && isPointInWater(xRatio, yRatio)) {
          yRatio = 0.12 + Math.random() * 0.54; // Keep on land
        }
      }

      // Avoid clumping too close to existing units
      const tooClose = units.some((u) => {
        const dx = u.xRatio - xRatio;
        const dy = u.yRatio - yRatio;
        return Math.sqrt(dx * dx + dy * dy) < 0.1;
      });

      if (!tooClose) {
        units.push({
          id: `ai-unit-${units.length + 1}-${Date.now()}-${Math.random()}`,
          type,
          xRatio,
          yRatio,
          player: 2,
          hp: spec.baseHp,
          maxHp: spec.baseHp,
          isDestroyed: false,
          angle: (Math.random() - 0.5) * 0.3,
          cooldownRemaining: 0,
          upgrades: { extraHp: 0, inkRadiusBoost: 0, damageBoost: 0, windResistance: false },
        });
        remainingBudget -= spec.cost;
        placed = true;
      }
    }
  }

  return units;
}

export function computeAIShot(
  player1Units: Unit[],
  aiUnits: Unit[],
  _previousShots: Shot[],
  difficulty: AIDifficulty,
  canvasWidth: number,
  canvasHeight: number,
  wind: Wind,
  foldMode: FoldLineMode
): { xRatio: number; yRatio: number; firingUnit: Unit } | null {
  const aliveP1 = player1Units.filter((u) => !u.isDestroyed);
  const eligibleShooters = aiUnits.filter(
    (u) => !u.isDestroyed && UNIT_SPECS[u.type].canShoot && u.cooldownRemaining === 0
  );

  if (eligibleShooters.length === 0 || aliveP1.length === 0) {
    return null;
  }

  // Pick a shooter that has at least one valid target in P1's army
  let selectedShooter: Unit | null = null;
  let validTargets: Unit[] = [];

  for (const shooter of eligibleShooters) {
    const targets = aliveP1.filter((t) => validateCombatTarget(shooter.type, t.type).allowed);
    if (targets.length > 0) {
      selectedShooter = shooter;
      validTargets = targets;
      break;
    }
  }

  if (!selectedShooter || validTargets.length === 0) {
    selectedShooter = eligibleShooters[0];
    validTargets = aliveP1;
  }

  const target = validTargets[Math.floor(Math.random() * validTargets.length)];

  // Calculate target position in pixels
  let targetPixelX = target.xRatio * canvasWidth;
  let targetPixelY = target.yRatio * canvasHeight;

  // Add difficulty-based targeting jitter
  let jitterPx = 30;
  if (difficulty === 'easy') {
    jitterPx = 45;
  } else if (difficulty === 'medium') {
    jitterPx = 22;
  } else {
    jitterPx = 8;
  }

  const jitterAng = Math.random() * Math.PI * 2;
  const jitterDist = (Math.random() * 0.7 + 0.3) * jitterPx;
  targetPixelX += Math.cos(jitterAng) * jitterDist;
  targetPixelY += Math.sin(jitterAng) * jitterDist;

  // Wind compensation
  if (wind.active) {
    targetPixelX -= wind.xOffsetPx;
    targetPixelY -= wind.yOffsetPx;
  }

  // Compute the click position on AI's side that reflects to the target point
  const reflectedBack = reflectAcrossFoldLine(
    targetPixelX,
    targetPixelY,
    canvasWidth,
    canvasHeight,
    foldMode
  );

  let shotXR = reflectedBack.rx / canvasWidth;
  let shotYR = reflectedBack.ry / canvasHeight;

  // Clamp to AI's side (right side)
  shotXR = Math.max(0.53, Math.min(0.96, shotXR));
  shotYR = Math.max(0.06, Math.min(0.94, shotYR));

  return { xRatio: shotXR, yRatio: shotYR, firingUnit: selectedShooter };
}
