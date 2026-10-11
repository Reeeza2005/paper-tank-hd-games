import { Unit, Shot, AIDifficulty, TerrainType, UnitType, UNIT_SPECS, Wind } from './types';
import { isPointInWater, isPointInObstacle } from './canvasUtils';

export function generateAISquad(terrain: TerrainType): Unit[] {
  const units: Unit[] = [];
  let remainingBudget = 1000;

  // AI purchases based on terrain
  const desireList: UnitType[] = [];
  if (terrain === 'river') {
    desireList.push('plane', 'boat', 'tank', 'soldier');
  } else {
    desireList.push('plane', 'tank', 'tank', 'soldier');
  }

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
        // Boat must be in water zone (bottom section yRatio >= 0.72)
        yRatio = 0.74 + Math.random() * 0.20;
        if (!isPointInWater(xRatio, yRatio)) continue;
      } else {
        // Land/Air units should not be in the water if river map
        if (terrain === 'river' && isPointInWater(xRatio, yRatio)) {
          yRatio = 0.12 + Math.random() * 0.54; // Keep on land
        }
      }

      // Avoid obstacles
      if (terrain === 'obstacles' && isPointInObstacle(xRatio, yRatio)) continue;

      // Avoid clumping
      const tooClose = units.some((u) => {
        const dx = u.xRatio - xRatio;
        const dy = u.yRatio - yRatio;
        return Math.sqrt(dx * dx + dy * dy) < 0.11;
      });

      if (!tooClose) {
        units.push({
          id: `ai-unit-${units.length + 1}-${Date.now()}`,
          type,
          xRatio,
          yRatio,
          player: 2,
          hp: spec.baseHp,
          maxHp: spec.baseHp,
          isDestroyed: false,
          angle: (Math.random() - 0.5) * 0.3,
          upgrades: { extraHp: 0, inkRadiusBoost: 0, windResistance: false },
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
  previousShots: Shot[],
  difficulty: AIDifficulty,
  canvasWidth: number,
  canvasHeight: number,
  wind: Wind
): { xRatio: number; yRatio: number; firingUnit: Unit } {
  const aliveP1 = player1Units.filter((u) => !u.isDestroyed);
  const aliveAI = aiUnits.filter((u) => !u.isDestroyed);

  const firingUnit = aliveAI[Math.floor(Math.random() * aliveAI.length)] || {
    id: 'ai-default',
    type: 'tank' as UnitType,
    xRatio: 0.75,
    yRatio: 0.5,
    player: 2,
    hp: 2,
    maxHp: 2,
    isDestroyed: false,
    angle: 0,
    upgrades: { extraHp: 0, inkRadiusBoost: 0, windResistance: false },
  };

  if (aliveP1.length === 0) {
    return { xRatio: 0.75, yRatio: 0.5, firingUnit };
  }

  let jitter = 0.05;
  const rand = Math.random();

  if (difficulty === 'easy') {
    if (rand < 0.65) {
      return {
        xRatio: 0.55 + Math.random() * 0.38,
        yRatio: 0.12 + Math.random() * 0.76,
        firingUnit,
      };
    }
    jitter = 0.085;
  } else if (difficulty === 'medium') {
    if (rand < 0.35) {
      return {
        xRatio: 0.55 + Math.random() * 0.38,
        yRatio: 0.12 + Math.random() * 0.76,
        firingUnit,
      };
    }
    jitter = 0.045;
  } else {
    // Hard: accurate aim
    jitter = 0.016;
  }

  const target = aliveP1[Math.floor(Math.random() * aliveP1.length)];

  // Wind offset
  const windOffsetRatioX = wind.active ? wind.xOffsetPx / canvasWidth : 0;
  const windOffsetRatioY = wind.active ? wind.yOffsetPx / canvasHeight : 0;

  const idealX = 1 - target.xRatio + windOffsetRatioX;
  const idealY = target.yRatio - windOffsetRatioY;

  const angle = Math.random() * Math.PI * 2;
  const dist = (Math.random() * 0.8 + 0.2) * jitter;

  let shotX = idealX + Math.cos(angle) * dist;
  let shotY = idealY + Math.sin(angle) * dist;

  shotX = Math.max(0.53, Math.min(0.95, shotX));
  shotY = Math.max(0.08, Math.min(0.92, shotY));

  return { xRatio: shotX, yRatio: shotY, firingUnit };
}
