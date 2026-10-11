export type GameMode = 'local' | 'ai' | 'online';
export type GamePhase = 'deployment' | 'battle' | 'gameover';
export type PlayerId = 1 | 2;
export type AIDifficulty = 'easy' | 'medium' | 'hard';

export type TerrainType = 'plain' | 'river';
export type FoldLineMode = 'center' | 'slight_right' | 'slight_left';
export type ThemeMode = 'night' | 'day';

export type UnitType = 'soldier' | 'tank' | 'plane' | 'boat' | 'bunker' | 'factory';

export interface UnitDefinition {
  type: UnitType;
  name: string;
  cost: number;
  baseHitRadius: number;
  baseInkRadius: number;
  baseHp: number;
  baseDamage: number;
  bounty: number; // floor(cost / 3)
  icon: string;
  description: string;
  canShoot: boolean;
  bunkerAuraRadius?: number; // Protection radius in pixels
  incomePerTurn?: number; // Factory passive income
}

export const UNIT_SPECS: Record<UnitType, UnitDefinition> = {
  soldier: {
    type: 'soldier',
    name: 'سرباز تک‌تیرانداز',
    cost: 100,
    baseHitRadius: 13,
    baseInkRadius: 6,
    baseHp: 1,
    baseDamage: 1,
    bounty: 33,
    icon: '🪖',
    description: 'پیاده‌نظام چابک با تفنگ ضدهوایی؛ قابلیت شلیک به تمام اهداف زمینی، دریایی و هوایی.',
    canShoot: true,
  },
  tank: {
    type: 'tank',
    name: 'تانک سنگین زره‌پوش',
    cost: 250,
    baseHitRadius: 21,
    baseInkRadius: 9,
    baseHp: 2,
    baseDamage: 1,
    bounty: 83,
    icon: '🛡️',
    description: 'توپخانه زرهی سنگین؛ شلیک به تمام اهداف زمینی، دریایی، سنگر و کارخانه (ممنوع به هواپیما).',
    canShoot: true,
  },
  plane: {
    type: 'plane',
    name: 'جنگنده بمب‌افکن هوایی',
    cost: 400,
    baseHitRadius: 28,
    baseInkRadius: 15,
    baseHp: 2,
    baseDamage: 1,
    bounty: 133,
    icon: '✈️',
    description: 'بمباران مهلک تانک، قایق، سنگر، کارخانه و هواپیما (پیاده‌نظام از بمباران مصون است).',
    canShoot: true,
  },
  boat: {
    type: 'boat',
    name: 'قایق گشتی موشک‌انداز',
    cost: 200,
    baseHitRadius: 23,
    baseInkRadius: 10,
    baseHp: 2,
    baseDamage: 1,
    bounty: 66,
    icon: '🛥️',
    description: 'استقرار در پهنه آبی رودخانه؛ شلیک به قایق، تانک، سرباز و استحکامات ساحلی.',
    canShoot: true,
  },
  bunker: {
    type: 'bunker',
    name: 'سنگر بتنی محافظ',
    cost: 80,
    baseHitRadius: 22,
    baseInkRadius: 0,
    baseHp: 4,
    baseDamage: 0,
    bounty: 26,
    icon: '🏰',
    description: 'استحکامات بتنی بدون شلیک با هاله محافظتی؛ دفع گلوله و جذب آسیب نیروهای خودی هم‌جوار.',
    canShoot: false,
    bunkerAuraRadius: 55,
  },
  factory: {
    type: 'factory',
    name: 'کارخانه تدارکات و تسلیحات',
    cost: 350,
    baseHitRadius: 25,
    baseInkRadius: 0,
    baseHp: 3,
    baseDamage: 0,
    bounty: 116,
    icon: '🏭',
    description: 'مجموعه صنعتی غیرمسلح؛ تولید ۵۰+ سکه درآمد پایدار در آغاز هر نوبت شما.',
    canShoot: false,
    incomePerTurn: 50,
  },
};

/**
 * Combat Targeting Matrix Validation
 * - Soldier: hits everything (ground, water, air, bunker, factory)
 * - Tank: hits everything except planes (cannot aim high into the sky)
 * - Plane: hits tank, boat, plane, bunker, factory. CANNOT hit soldier (infantry too scattered for airstrikes)
 * - Boat: hits naval and coastal targets (boat, tank, soldier, bunker, factory). CANNOT hit planes.
 * - Bunker & Factory: cannot shoot
 */
export function validateCombatTarget(
  attackerType: UnitType,
  targetType: UnitType
): { allowed: boolean; reason?: string } {
  if (!UNIT_SPECS[attackerType].canShoot) {
    return { allowed: false, reason: 'این واحد غیرمسلح است و توانایی شلیک ندارد!' };
  }

  if (attackerType === 'tank' && targetType === 'plane') {
    return {
      allowed: false,
      reason: 'تانک زاویه شلیک عمودی برای هدف‌گیری جنگنده هوایی ندارد! 🚫',
    };
  }

  if (attackerType === 'plane' && targetType === 'soldier') {
    return {
      allowed: false,
      reason: 'پیاده‌نظام پراکنده در سنگر از بمباران هوایی جنگنده مصون است! 🚫',
    };
  }

  if (attackerType === 'boat' && targetType === 'plane') {
    return {
      allowed: false,
      reason: 'توپخانه قایق جنگی قادر به رهگیری و شلیک به هواپیما نیست! 🚫',
    };
  }

  return { allowed: true };
}

export interface UnitUpgrades {
  extraHp: number; // Level 0-2 (+1 HP per level)
  inkRadiusBoost: number; // Level 0-2 (+2.5px radius per level)
  damageBoost: number; // Level 0-2 (+1 Damage per level)
  windResistance: boolean; // Immune to 50% wind drift
}

export interface Unit {
  id: string;
  type: UnitType;
  xRatio: number; // 0 to 1
  yRatio: number; // 0 to 1
  player: PlayerId;
  hp: number;
  maxHp: number;
  isDestroyed: boolean;
  angle: number;
  cooldownRemaining: number; // 0 = ready, 1 = resting
  upgrades: UnitUpgrades;
}

export interface Wind {
  active: boolean;
  speed: number; // m/s
  xOffsetPx: number;
  yOffsetPx: number;
  angle: number;
}

export interface FoldLineConfig {
  dynamicEnabled: boolean; // if true, changes randomly or dynamically
  currentMode: FoldLineMode; // 'center' | 'slight_right' | 'slight_left'
}

export interface Shot {
  id: string;
  sourceXRatio: number;
  sourceYRatio: number;
  targetXRatio: number;
  targetYRatio: number;
  player: PlayerId;
  firingUnitType: UnitType;
  firingUnitId: string;
  inkRadius: number;
  damageDealt?: number;
  isHit: boolean;
  hitUnitId?: string;
  hitUnitType?: UnitType;
  absorbedByBunkerId?: string;
  unitDestroyed?: boolean;
  bountyEarned: number;
  windApplied?: { xOffsetPx: number; yOffsetPx: number };
  timestamp: number;
}

export interface KillcamData {
  attackerPlayer: PlayerId;
  attackerType: UnitType;
  victimPlayer: PlayerId;
  victimType: UnitType;
  damageDealt?: number;
  bounty: number;
  timestamp: number;
}

export interface PeerMessage {
  type:
    | 'INIT_ACK'
    | 'READY_STATE'
    | 'DEPLOY_DONE'
    | 'REINFORCE_UNIT'
    | 'SHOOT'
    | 'UPGRADE_UNIT'
    | 'TURN_CHANGE'
    | 'REMATCH'
    | 'SETTINGS_SYNC'
    | 'NAME_UPDATE';
  payload?: any;
}
