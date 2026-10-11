export type GameMode = 'local' | 'ai' | 'online';
export type GamePhase = 'deployment' | 'battle' | 'gameover';
export type PlayerId = 1 | 2;
export type AIDifficulty = 'easy' | 'medium' | 'hard';

export type TerrainType = 'plain' | 'river' | 'obstacles';
export type BoardSizePreset = 'standard' | 'wide' | 'custom';

export type UnitType = 'soldier' | 'tank' | 'boat' | 'plane';

export interface UnitDefinition {
  type: UnitType;
  name: string;
  cost: number;
  baseHitRadius: number;
  baseInkRadius: number;
  baseHp: number;
  bounty: number; // floor(cost / 3)
  icon: string;
  description: string;
}

export const UNIT_SPECS: Record<UnitType, UnitDefinition> = {
  soldier: {
    type: 'soldier',
    name: 'سرباز',
    cost: 100,
    baseHitRadius: 13,
    baseInkRadius: 5,
    baseHp: 1,
    bounty: Math.floor(100 / 3), // 33
    icon: '🪖',
    description: 'هدف بسیار کوچک و ارزان، جان ۱، شلیک سوزنی دقیق',
  },
  tank: {
    type: 'tank',
    name: 'تانک',
    cost: 250,
    baseHitRadius: 21,
    baseInkRadius: 8,
    baseHp: 2,
    bounty: Math.floor(250 / 3), // 83
    icon: '🛡️',
    description: 'تعادل عالی در قدرت، جان ۲، شلیک با جوهر متوسط',
  },
  boat: {
    type: 'boat',
    name: 'قایق جنگی',
    cost: 200,
    baseHitRadius: 23,
    baseInkRadius: 9,
    baseHp: 2,
    bounty: Math.floor(200 / 3), // 66
    icon: '🛥️',
    description: 'استقرار در پهنه آبی/رودخانه، جان ۲، توپخانه دریایی',
  },
  plane: {
    type: 'plane',
    name: 'هواپیما',
    cost: 400,
    baseHitRadius: 28,
    baseInkRadius: 14,
    baseHp: 2,
    bounty: Math.floor(400 / 3), // 133
    icon: '✈️',
    description: 'هدف وسیع، آسیب ترکش و جوهر گسترده، جان ۲',
  },
};

export interface UnitUpgrades {
  extraHp: number;        // Level 0-2 (+1 HP per level)
  inkRadiusBoost: number; // Level 0-2 (+2.5px radius per level)
  windResistance: boolean; // Immune to 50% wind drift
}

export interface Unit {
  id: string;
  type: UnitType;
  xRatio: number; // 0 to 1 relative to canvas width
  yRatio: number; // 0 to 1 relative to canvas height
  player: PlayerId;
  hp: number;
  maxHp: number;
  isDestroyed: boolean;
  angle: number;
  upgrades: UnitUpgrades;
}

export interface Wind {
  active: boolean;
  speed: number; // m/s
  xOffsetPx: number;
  yOffsetPx: number;
}

export interface Shot {
  id: string;
  sourceXRatio: number;
  sourceYRatio: number;
  targetXRatio: number;
  targetYRatio: number;
  player: PlayerId;
  firingUnitType: UnitType;
  inkRadius: number;
  isHit: boolean;
  isBlockedByObstacle?: boolean;
  hitUnitId?: string;
  hitUnitType?: UnitType;
  unitDestroyed?: boolean;
  bountyEarned: number;
  windApplied?: { xOffsetPx: number; yOffsetPx: number };
  timestamp: number;
}

export interface PeerMessage {
  type: 'INIT_ACK' | 'DEPLOY_DONE' | 'SHOOT' | 'UPGRADE_UNIT' | 'REMATCH' | 'CHAT' | 'SETTINGS_SYNC';
  payload?: any;
}
