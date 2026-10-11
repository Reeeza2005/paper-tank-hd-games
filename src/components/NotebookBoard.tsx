import React, { useRef, useEffect, useCallback } from 'react';
import {
  Unit,
  Shot,
  PlayerId,
  GamePhase,
  TerrainType,
  UnitType,
  Wind,
  FoldLineConfig,
  UNIT_SPECS,
  validateCombatTarget,
  KillcamData,
} from '../types';
import {
  drawTacticalBattlefield,
  drawTacticalUnit,
  drawTacticalShot,
  getPlayerSideForPoint,
  reflectAcrossFoldLine,
  isPointInWater,
  getBunkerProtectingUnit,
  P1_COLOR,
  P2_COLOR,
} from '../canvasUtils';
import { sounds } from '../audio';

interface NotebookBoardProps {
  phase: GamePhase;
  currentPlayer: PlayerId;
  myPlayerId: PlayerId;
  terrain: TerrainType;
  units: Unit[];
  shots: Shot[];
  unitScale: number;
  selectedUnitToBuy: UnitType | null;
  selectedFiringUnitId: string | null;
  wind: Wind;
  foldConfig: FoldLineConfig;
  onPlaceUnit: (xRatio: number, yRatio: number, unitType: UnitType) => void;
  onShoot: (shotData: {
    sourceXR: number;
    sourceYR: number;
    targetXR: number;
    targetYR: number;
    isHit: boolean;
    hitUnitId?: string;
    hitUnitType?: UnitType;
    absorbedByBunkerId?: string;
    unitDestroyed?: boolean;
    bountyEarned: number;
    killcam?: KillcamData;
  }) => void;
  onSelectUnitForUpgrade: (unit: Unit) => void;
  onSelectFiringUnit: (unitId: string) => void;
  onShowToast: (msg: string, icon?: string) => void;
  isFoldAnimating: boolean;
  foldingPlayer: PlayerId | null;
  targetDimensions: { width: number; height: number };
}

export const NotebookBoard: React.FC<NotebookBoardProps> = ({
  phase,
  currentPlayer,
  myPlayerId,
  terrain,
  units,
  shots,
  unitScale,
  selectedUnitToBuy,
  selectedFiringUnitId,
  wind,
  foldConfig,
  onPlaceUnit,
  onShoot,
  onSelectUnitForUpgrade,
  onShowToast,
  isFoldAnimating,
  foldingPlayer,
  targetDimensions,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 60 FPS Render Loop
  useEffect(() => {
    let animId: number;

    const render = (timestamp: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // 1. Draw Battlefield Map
      drawTacticalBattlefield(ctx, w, h, terrain, foldConfig.currentMode, timestamp);

      // 2. Draw Units
      units.forEach((u) => {
        const isSelected = u.id === selectedFiringUnitId;
        drawTacticalUnit(ctx, u, w, h, unitScale, isSelected, timestamp);
      });

      // 3. Draw Shots
      shots.forEach((s) => {
        drawTacticalShot(ctx, s, w, h);
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [units, shots, terrain, foldConfig, unitScale, selectedFiringUnitId]);

  // Click & Touch Interaction Handler
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (isFoldAnimating || phase === 'gameover') return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      let clientX = 0;
      let clientY = 0;

      if ('touches' in e) {
        if (e.touches.length === 0) return;
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }

      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;
      const xr = clickX / canvas.width;
      const yr = clickY / canvas.height;

      // 1. Check Upgrade Click on Friendly Unit
      const clickedFriendlyUnit = units.find((u) => {
        if (u.player !== myPlayerId || u.isDestroyed) return false;
        const ux = u.xRatio * canvas.width;
        const uy = u.yRatio * canvas.height;
        const hitR = UNIT_SPECS[u.type].baseHitRadius * unitScale + 12;
        return Math.hypot(ux - clickX, uy - clickY) <= hitR;
      });

      if (clickedFriendlyUnit) {
        onSelectUnitForUpgrade(clickedFriendlyUnit);
        return;
      }

      // 2. Unit Placement (Deployment OR Mid-Battle Reinforcement)
      if (selectedUnitToBuy) {
        const territory = getPlayerSideForPoint(
          clickX,
          clickY,
          canvas.width,
          canvas.height,
          foldConfig.currentMode
        );

        if (territory !== currentPlayer) {
          onShowToast('تنها در نیمه قلمرو خودتان (سمت خط تا) مجاز به استقرار هستید!', '⚠️');
          return;
        }

        if (selectedUnitToBuy === 'boat') {
          if (terrain !== 'river' || !isPointInWater(xr, yr)) {
            onShowToast('قایق جنگی تنها در پهنه آبی رودخانه مستقر می‌شود!', '⚠️');
            return;
          }
        } else if (terrain === 'river' && isPointInWater(xr, yr) && selectedUnitToBuy !== 'plane') {
          onShowToast('نیروهای زمینی، سنگر و کارخانه نمی‌توانند درون آب مستقر شوند!', '⚠️');
          return;
        }

        onPlaceUnit(xr, yr, selectedUnitToBuy);
        return;
      }

      // 3. Firing in Battle Phase
      if (phase === 'battle') {
        const territory = getPlayerSideForPoint(
          clickX,
          clickY,
          canvas.width,
          canvas.height,
          foldConfig.currentMode
        );

        if (territory !== currentPlayer) {
          onShowToast('باید در نیمه زمین خودتان نقطه شلیک را علامت بزنید!', '⚠️');
          return;
        }

        const firingUnit = units.find((u) => u.id === selectedFiringUnitId);
        if (!firingUnit || firingUnit.isDestroyed) {
          onShowToast('ابتدا یکی از ادوات زنده را جهت شلیک انتخاب کنید!', '🎯');
          return;
        }

        if (!UNIT_SPECS[firingUnit.type].canShoot) {
          onShowToast('این واحد غیرمسلح است و توانایی شلیک ندارد!', '🚫');
          return;
        }

        if (firingUnit.cooldownRemaining > 0) {
          onShowToast('این واحد در نوبت قبل شلیک کرده و در حال خنک‌شدن است (۱ نوبت استراحت)!', '⏳');
          return;
        }

        // Calculate Target Reflection across Fold Line
        const reflected = reflectAcrossFoldLine(
          clickX,
          clickY,
          canvas.width,
          canvas.height,
          foldConfig.currentMode
        );

        const windEffX = firingUnit.upgrades.windResistance ? wind.xOffsetPx * 0.5 : wind.xOffsetPx;
        const windEffY = firingUnit.upgrades.windResistance ? wind.yOffsetPx * 0.5 : wind.yOffsetPx;

        const targetPixelX = reflected.rx + (wind.active ? windEffX : 0);
        const targetPixelY = reflected.ry + (wind.active ? windEffY : 0);
        const tgtXR = targetPixelX / canvas.width;
        const tgtYR = targetPixelY / canvas.height;

        const targetPlayer = currentPlayer === 1 ? 2 : 1;
        const inkRadius =
          (UNIT_SPECS[firingUnit.type].baseInkRadius + firingUnit.upgrades.inkRadiusBoost * 2.5) *
          unitScale;

        // Check if any enemy unit was struck
        let hitEnemyUnit: Unit | null = null;
        for (const u of units) {
          if (u.player === targetPlayer && !u.isDestroyed) {
            const dist = Math.hypot(
              u.xRatio * canvas.width - targetPixelX,
              u.yRatio * canvas.height - targetPixelY
            );
            if (dist <= (UNIT_SPECS[u.type].baseHitRadius + UNIT_SPECS[firingUnit.type].baseInkRadius) * unitScale) {
              hitEnemyUnit = u;
              break;
            }
          }
        }

        // TARGETING COMBAT MATRIX VALIDATION:
        if (hitEnemyUnit) {
          const validation = validateCombatTarget(firingUnit.type, hitEnemyUnit.type);
          if (!validation.allowed) {
            sounds.playWarningBeep();
            onShowToast(validation.reason || 'هدف‌گیری غیرمجاز!', '🚫');
            return; // Does NOT waste shot or turn!
          }
        }

        // Check Bunker Protection Aura on the target unit
        let absorbedByBunker: Unit | null = null;
        if (hitEnemyUnit) {
          absorbedByBunker = getBunkerProtectingUnit(
            hitEnemyUnit,
            units,
            canvas.width,
            canvas.height,
            unitScale
          );
        }

        let unitDestroyed = false;
        let bountyEarned = 0;
        let killcam: KillcamData | undefined = undefined;

        if (absorbedByBunker) {
          // Bunker takes damage instead of hitEnemyUnit
          const newBunkerHp = absorbedByBunker.hp - 1;
          if (newBunkerHp <= 0) {
            unitDestroyed = true;
            bountyEarned = UNIT_SPECS.bunker.bounty;
            killcam = {
              attackerPlayer: currentPlayer,
              attackerType: firingUnit.type,
              victimPlayer: targetPlayer,
              victimType: 'bunker',
              bounty: bountyEarned,
              timestamp: Date.now(),
            };
          }
        } else if (hitEnemyUnit) {
          const newHp = hitEnemyUnit.hp - 1;
          if (newHp <= 0) {
            unitDestroyed = true;
            bountyEarned = UNIT_SPECS[hitEnemyUnit.type].bounty;
            killcam = {
              attackerPlayer: currentPlayer,
              attackerType: firingUnit.type,
              victimPlayer: targetPlayer,
              victimType: hitEnemyUnit.type,
              bounty: bountyEarned,
              timestamp: Date.now(),
            };
          }
        }

        onShoot({
          sourceXR: xr,
          sourceYR: yr,
          targetXR: tgtXR,
          targetYR: tgtYR,
          isHit: !!hitEnemyUnit,
          hitUnitId: hitEnemyUnit?.id,
          hitUnitType: hitEnemyUnit?.type,
          absorbedByBunkerId: absorbedByBunker?.id,
          unitDestroyed,
          bountyEarned,
          killcam,
        });
      }
    },
    [
      isFoldAnimating,
      phase,
      units,
      myPlayerId,
      unitScale,
      onSelectUnitForUpgrade,
      selectedUnitToBuy,
      foldConfig.currentMode,
      currentPlayer,
      terrain,
      onPlaceUnit,
      onShowToast,
      selectedFiringUnitId,
      wind,
      onShoot,
    ]
  );

  return (
    <div
      className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-700/80 bg-[#090d16] transition-all duration-300"
      style={{
        width: `${targetDimensions.width}px`,
        height: `${targetDimensions.height}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={targetDimensions.width}
        height={targetDimensions.height}
        onClick={handleCanvasClick}
        onTouchStart={handleCanvasClick}
        className="block w-full h-full cursor-crosshair select-none"
      />

      {/* 3D Fold Holographic Sheet Transition */}
      {isFoldAnimating && (
        <div
          className={`absolute inset-0 pointer-events-none z-30 transition-all duration-700 ${
            foldingPlayer === 1
              ? 'bg-gradient-to-r from-cyan-500/20 to-transparent'
              : 'bg-gradient-to-l from-rose-500/20 to-transparent'
          }`}
          style={{
            backdropFilter: 'blur(3px)',
            animation: 'foldFlash 1.2s ease-in-out forwards',
          }}
        />
      )}
    </div>
  );
};
