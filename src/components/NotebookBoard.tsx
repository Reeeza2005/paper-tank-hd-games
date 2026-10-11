import React, { useRef, useEffect, useCallback, useState } from 'react';
import {
  Unit,
  Shot,
  PlayerId,
  GamePhase,
  TerrainType,
  UnitType,
  Wind,
  FoldLineConfig,
  ThemeMode,
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
} from '../canvasUtils';
import { sounds } from '../audio';

interface NotebookBoardProps {
  phase: GamePhase;
  currentPlayer: PlayerId;
  myPlayerId: PlayerId;
  terrain: TerrainType;
  theme: ThemeMode;
  units: Unit[];
  shots: Shot[];
  unitScale: number;
  selectedUnitToBuy: UnitType | null;
  selectedFiringUnitId: string | null;
  selectedUnitToModifyId: string | null;
  wind: Wind;
  foldConfig: FoldLineConfig;
  onPlaceUnit: (xRatio: number, yRatio: number, unitType: UnitType) => void;
  onMoveUnit: (unitId: string, newXRatio: number, newYRatio: number) => void;
  onDeleteUnit: (unitId: string) => void;
  onSelectUnitToModify: (unit: Unit | null) => void;
  onShoot: (shotData: {
    sourceXR: number;
    sourceYR: number;
    targetXR: number;
    targetYR: number;
    firingUnitType?: UnitType;
    isHit: boolean;
    hitUnitId?: string;
    hitUnitType?: UnitType;
    absorbedByBunkerId?: string;
    unitDestroyed?: boolean;
    bountyEarned: number;
    damageDealt?: number;
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
  theme,
  units,
  shots,
  unitScale,
  selectedUnitToBuy,
  selectedFiringUnitId,
  selectedUnitToModifyId,
  wind,
  foldConfig,
  onPlaceUnit,
  onMoveUnit,
  onDeleteUnit,
  onSelectUnitToModify,
  onShoot,
  onSelectUnitForUpgrade,
  onShowToast,
  isFoldAnimating,
  foldingPlayer,
  targetDimensions,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Drag state
  const [draggingUnitId, setDraggingUnitId] = useState<string | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hasDraggedRef = useRef<boolean>(false);
  const justFinishedDragRef = useRef<boolean>(false);

  // Reliable double-tap tracker for touch and mouse
  const lastTapInfoRef = useRef<{ time: number; unitId: string } | null>(null);

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

      // 1. Draw Battlefield Map (Clean tactical without grid)
      drawTacticalBattlefield(ctx, w, h, terrain, foldConfig.currentMode, timestamp, theme);

      // 2. Draw Units
      units.forEach((u) => {
        const isSelected = u.id === selectedFiringUnitId;
        drawTacticalUnit(ctx, u, w, h, unitScale, isSelected, timestamp);

        // Highlight unit selected for repositioning or deletion in deployment
        if (phase === 'deployment' && u.id === selectedUnitToModifyId) {
          ctx.save();
          const ux = u.xRatio * w;
          const uy = u.yRatio * h;
          const hitR = UNIT_SPECS[u.type].baseHitRadius * unitScale + 9;
          ctx.strokeStyle = '#f59e0b'; // Amber pulse ring
          ctx.lineWidth = 2.5;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(ux, uy, hitR + Math.sin(timestamp * 0.008) * 3, 0, Math.PI * 2);
          ctx.stroke();

          // Small tag above unit
          ctx.font = 'bold 10px Tahoma, sans-serif';
          ctx.fillStyle = '#f59e0b';
          ctx.textAlign = 'center';
          ctx.fillText('انتخاب‌شده ✥', ux, uy - hitR - 6);
          ctx.restore();
        }
      });

      // 3. Draw Shots
      shots.forEach((s) => {
        drawTacticalShot(ctx, s, w, h);
      });

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [
    units,
    shots,
    terrain,
    theme,
    foldConfig,
    unitScale,
    selectedFiringUnitId,
    selectedUnitToModifyId,
    phase,
  ]);

  // Pointer Down for Drag & Relocate in Deployment
  const handlePointerDown = (clientX: number, clientY: number) => {
    if (phase !== 'deployment') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    const touchedFriendlyUnit = units.find((u) => {
      if (u.player !== myPlayerId || u.isDestroyed) return false;
      const ux = u.xRatio * canvas.width;
      const uy = u.yRatio * canvas.height;
      const hitR = UNIT_SPECS[u.type].baseHitRadius * unitScale + 12;
      return Math.hypot(ux - clickX, uy - clickY) <= hitR;
    });

    if (touchedFriendlyUnit) {
      setDraggingUnitId(touchedFriendlyUnit.id);
      dragStartPosRef.current = { x: clickX, y: clickY };
      hasDraggedRef.current = false;
    }
  };

  // Pointer Move for Dragging
  const handlePointerMove = (clientX: number, clientY: number) => {
    if (!draggingUnitId || phase !== 'deployment') return;
    const canvas = canvasRef.current;
    if (!canvas || !dragStartPosRef.current) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;

    if (
      Math.hypot(clickX - dragStartPosRef.current.x, clickY - dragStartPosRef.current.y) > 14
    ) {
      hasDraggedRef.current = true;
    }
  };

  // Pointer Up to Finalize Drag Move
  const handlePointerUp = (clientX: number, clientY: number) => {
    if (!draggingUnitId || phase !== 'deployment') return;
    const canvas = canvasRef.current;
    if (!canvas) {
      setDraggingUnitId(null);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    const xr = clickX / canvas.width;
    const yr = clickY / canvas.height;

    const unit = units.find((u) => u.id === draggingUnitId);
    if (hasDraggedRef.current && unit) {
      justFinishedDragRef.current = true;
      setTimeout(() => {
        justFinishedDragRef.current = false;
      }, 100);

      // Validate drag target territory
      const territory = getPlayerSideForPoint(
        clickX,
        clickY,
        canvas.width,
        canvas.height,
        foldConfig.currentMode
      );
      if (territory !== myPlayerId) {
        onShowToast('نمی‌توانید واحد را خارج از نیمه قلمرو خود قرار دهید!', '⚠️');
      } else if (unit.type === 'boat' && (terrain !== 'river' || !isPointInWater(xr, yr))) {
        onShowToast('قایق جنگی تنها در پهنه آبی رودخانه مستقر می‌شود!', '⚠️');
      } else if (terrain === 'river' && isPointInWater(xr, yr) && unit.type !== 'plane' && unit.type !== 'boat') {
        onShowToast('ادوات زمینی نمی‌توانند درون آب قرار گیرند!', '⚠️');
      } else {
        onMoveUnit(unit.id, xr, yr);
        onShowToast(`واحد ${UNIT_SPECS[unit.type].name} با کشیدن و رها کردن جابجا شد ✥`, '✨');
        sounds.playTankPlace();
      }
    }

    setDraggingUnitId(null);
    dragStartPosRef.current = null;
    hasDraggedRef.current = false;
  };

  // Direct Mouse Double-Click Event on Canvas for immediate unit deletion
  const handleCanvasDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (phase !== 'deployment') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const touchedFriendlyUnit = units.find((u) => {
      if (u.player !== myPlayerId || u.isDestroyed) return false;
      const ux = u.xRatio * canvas.width;
      const uy = u.yRatio * canvas.height;
      const hitR = UNIT_SPECS[u.type].baseHitRadius * unitScale + 16;
      return Math.hypot(ux - clickX, uy - clickY) <= hitR;
    });

    if (touchedFriendlyUnit) {
      lastTapInfoRef.current = null;
      onDeleteUnit(touchedFriendlyUnit.id);
      onSelectUnitToModify(null);
      sounds.playCoinEarn();
      onShowToast(`واحد ${UNIT_SPECS[touchedFriendlyUnit.type].name} با دبل‌کلیک حذف شد و ${UNIT_SPECS[touchedFriendlyUnit.type].cost} 🪙 بازگشت 🗑️`, '💰');
    }
  };

  // Click & Touch Interaction Handler
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
      if (isFoldAnimating || phase === 'gameover') return;
      if (justFinishedDragRef.current) return; // Drag already handled
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

      // ==========================================
      // PHASE: DEPLOYMENT
      // ==========================================
      if (phase === 'deployment') {
        // 1. Check if user clicked on an existing friendly unit
        const touchedFriendlyUnit = units.find((u) => {
          if (u.player !== myPlayerId || u.isDestroyed) return false;
          const ux = u.xRatio * canvas.width;
          const uy = u.yRatio * canvas.height;
          const hitR = UNIT_SPECS[u.type].baseHitRadius * unitScale + 14;
          return Math.hypot(ux - clickX, uy - clickY) <= hitR;
        });

        if (touchedFriendlyUnit) {
          const now = Date.now();
          // Check for rapid double tap / double click
          if (
            lastTapInfoRef.current &&
            lastTapInfoRef.current.unitId === touchedFriendlyUnit.id &&
            now - lastTapInfoRef.current.time < 500
          ) {
            // DOUBLE CLICK DELETE ACTION!
            lastTapInfoRef.current = null;
            onDeleteUnit(touchedFriendlyUnit.id);
            onSelectUnitToModify(null);
            sounds.playCoinEarn();
            onShowToast(
              `واحد ${UNIT_SPECS[touchedFriendlyUnit.type].name} با دبل‌کلیک حذف شد و ${UNIT_SPECS[touchedFriendlyUnit.type].cost} 🪙 به بودجه بازگشت 🗑️`,
              '💰'
            );
            return;
          }

          // Single Click: Select unit for repositioning / deletion
          lastTapInfoRef.current = { time: now, unitId: touchedFriendlyUnit.id };
          if (selectedUnitToModifyId === touchedFriendlyUnit.id) {
            onSelectUnitToModify(null);
          } else {
            onSelectUnitToModify(touchedFriendlyUnit);
            onShowToast(
              `واحد ${UNIT_SPECS[touchedFriendlyUnit.type].name} انتخاب شد (دبل‌کلیک برای حذف، یا کلیک روی نقطه جدید برای جابجایی).`,
              '✥'
            );
          }
          return;
        }

        // Reset double tap if clicked elsewhere
        lastTapInfoRef.current = null;

        // 2. Clicked on EMPTY ground while a unit was already selected -> REPOSITION TO NEW POINT
        if (selectedUnitToModifyId) {
          const modifyingUnit = units.find((u) => u.id === selectedUnitToModifyId);
          if (modifyingUnit) {
            const territory = getPlayerSideForPoint(
              clickX,
              clickY,
              canvas.width,
              canvas.height,
              foldConfig.currentMode
            );

            if (territory !== myPlayerId) {
              onShowToast('تنها در نیمه قلمرو خودتان مجاز به انتقال نیرو هستید!', '⚠️');
              return;
            }

            if (modifyingUnit.type === 'boat' && (terrain !== 'river' || !isPointInWater(xr, yr))) {
              onShowToast('قایق جنگی تنها در پهنه آبی رودخانه مستقر می‌شود!', '⚠️');
              return;
            } else if (
              terrain === 'river' &&
              isPointInWater(xr, yr) &&
              modifyingUnit.type !== 'plane' &&
              modifyingUnit.type !== 'boat'
            ) {
              onShowToast('نیروهای زمینی، سنگر و کارخانه نمی‌توانند درون آب قرار گیرند!', '⚠️');
              return;
            }

            onMoveUnit(modifyingUnit.id, xr, yr);
            onSelectUnitToModify(null);
            onShowToast(`مکان ${UNIT_SPECS[modifyingUnit.type].name} تغییر یافت ✥`, '✨');
            sounds.playTankPlace();
            return;
          }
        }

        // 3. Clicked on EMPTY ground with Store Unit Selected -> PLACE NEW UNIT
        if (selectedUnitToBuy) {
          const territory = getPlayerSideForPoint(
            clickX,
            clickY,
            canvas.width,
            canvas.height,
            foldConfig.currentMode
          );

          if (territory !== myPlayerId) {
            onShowToast('تنها در نیمه قلمرو خودتان مجاز به استقرار هستید!', '⚠️');
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

          const directlyOnOtherUnit = units.some((u) => {
            if (u.isDestroyed) return false;
            const ux = u.xRatio * canvas.width;
            const uy = u.yRatio * canvas.height;
            return Math.hypot(ux - clickX, uy - clickY) < 18;
          });

          if (directlyOnOtherUnit) {
            onShowToast('این نقطه اشغال شده است، اندکی آن‌طرف‌تر کلیک کنید!', '⚠️');
            return;
          }

          onPlaceUnit(xr, yr, selectedUnitToBuy);
          return;
        }

        // Otherwise deselect
        onSelectUnitToModify(null);
        return;
      }

      // ==========================================
      // PHASE: BATTLE
      // ==========================================
      // 1. UNIT PLACEMENT PRIORITY (Mid-Battle Reinforcement)
      if (selectedUnitToBuy) {
        if (currentPlayer !== myPlayerId) {
          onShowToast('نوبت حریف است، منتظر بمانید!', '⏳');
          return;
        }

        const territory = getPlayerSideForPoint(
          clickX,
          clickY,
          canvas.width,
          canvas.height,
          foldConfig.currentMode
        );

        if (territory !== currentPlayer) {
          onShowToast('تنها در نیمه قلمرو خودتان مجاز به استقرار نیروی کمکی هستید!', '⚠️');
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

        const directlyOnCenter = units.some((u) => {
          if (u.isDestroyed) return false;
          const ux = u.xRatio * canvas.width;
          const uy = u.yRatio * canvas.height;
          return Math.hypot(ux - clickX, uy - clickY) < 16;
        });

        if (directlyOnCenter) {
          onShowToast('این نقطه اشغال شده است، اندکی آن‌طرف‌تر کلیک کنید!', '⚠️');
          return;
        }

        onPlaceUnit(xr, yr, selectedUnitToBuy);
        return;
      }

      // 2. CHECK UPGRADE CLICK (In Battle Phase when clicking on friendly unit)
      const clickedFriendlyUnit = units.find((u) => {
        if (u.player !== myPlayerId || u.isDestroyed) return false;
        const ux = u.xRatio * canvas.width;
        const uy = u.yRatio * canvas.height;
        const hitR = UNIT_SPECS[u.type].baseHitRadius * unitScale + 6;
        return Math.hypot(ux - clickX, uy - clickY) <= hitR;
      });

      if (clickedFriendlyUnit) {
        onSelectUnitForUpgrade(clickedFriendlyUnit);
        return;
      }

      // 3. FIRING IN BATTLE PHASE
      if (currentPlayer !== myPlayerId) {
        onShowToast('نوبت حریف است، منتظر بمانید! (کنترل شلیک قفل است)', '⏳');
        return;
      }

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

      const finalImpactX = reflected.rx + (wind.active ? windEffX : 0);
      const finalImpactY = reflected.ry + (wind.active ? windEffY : 0);

      // Ink blast radius calculation
      const baseInkR = UNIT_SPECS[firingUnit.type].baseInkRadius;
      const boostR = firingUnit.upgrades?.inkRadiusBoost ? firingUnit.upgrades.inkRadiusBoost * 2.5 : 0;
      const totalInkRadius = baseInkR + boostR;

      // Check hits on enemy units
      const enemyPlayer = currentPlayer === 1 ? 2 : 1;
      let hitEnemyUnit: Unit | null = null;

      for (const u of units) {
        if (u.player === enemyPlayer && !u.isDestroyed) {
          const ux = u.xRatio * canvas.width;
          const uy = u.yRatio * canvas.height;
          const hitRadius = UNIT_SPECS[u.type].baseHitRadius * unitScale;

          const dist = Math.hypot(ux - finalImpactX, uy - finalImpactY);
          if (dist <= hitRadius + totalInkRadius) {
            hitEnemyUnit = u;
            break;
          }
        }
      }

      const isHit = !!hitEnemyUnit;
      let unitDestroyed = false;
      let bountyEarned = 0;
      let killcam: KillcamData | undefined = undefined;

      // Calculate attacker damage
      const baseDmg = UNIT_SPECS[firingUnit.type].baseDamage;
      const dmgBonus = firingUnit.upgrades?.damageBoost || 0;
      const attackerDamage = Math.max(1, baseDmg + dmgBonus);

      let absorbedByBunker: Unit | null = null;

      if (isHit && hitEnemyUnit) {
        // Validate combat rules matrix
        const targetCheck = validateCombatTarget(firingUnit.type, hitEnemyUnit.type);
        if (!targetCheck.allowed) {
          sounds.playWarningBeep();
          onShowToast(targetCheck.reason || 'شلیک به این نوع هدف مجاز نیست!', '🚫');
          onShoot({
            sourceXR: xr,
            sourceYR: yr,
            targetXR: finalImpactX / canvas.width,
            targetYR: finalImpactY / canvas.height,
            isHit: false,
            bountyEarned: 0,
            damageDealt: 0,
          });
          return;
        }

        // Check Bunker Aura Absorption
        absorbedByBunker = getBunkerProtectingUnit(
          hitEnemyUnit,
          units,
          canvas.width,
          canvas.height,
          unitScale
        );

        if (absorbedByBunker) {
          // Damage absorbed by bunker
          const bunkerDamage = attackerDamage;
          const remainingBunkerHp = absorbedByBunker.hp - bunkerDamage;
          if (remainingBunkerHp <= 0) {
            bountyEarned = UNIT_SPECS.bunker.bounty;
          }
        } else {
          // Direct hit on target
          const remainingHp = hitEnemyUnit.hp - attackerDamage;
          if (remainingHp <= 0) {
            unitDestroyed = true;
            bountyEarned = UNIT_SPECS[hitEnemyUnit.type].bounty;

            killcam = {
              attackerPlayer: currentPlayer,
              attackerType: firingUnit.type,
              victimPlayer: enemyPlayer,
              victimType: hitEnemyUnit.type,
              damageDealt: attackerDamage,
              bounty: bountyEarned,
              timestamp: Date.now(),
            };
          }
        }
      }

      onShoot({
        sourceXR: xr,
        sourceYR: yr,
        targetXR: finalImpactX / canvas.width,
        targetYR: finalImpactY / canvas.height,
        firingUnitType: firingUnit.type,
        isHit,
        hitUnitId: hitEnemyUnit?.id,
        hitUnitType: hitEnemyUnit?.type,
        absorbedByBunkerId: absorbedByBunker?.id,
        unitDestroyed,
        bountyEarned,
        damageDealt: attackerDamage,
        killcam,
      });
    },
    [
      isFoldAnimating,
      phase,
      selectedUnitToModifyId,
      myPlayerId,
      units,
      selectedUnitToBuy,
      currentPlayer,
      foldConfig.currentMode,
      terrain,
      onPlaceUnit,
      onShowToast,
      onMoveUnit,
      onDeleteUnit,
      onSelectUnitToModify,
      unitScale,
      onSelectUnitForUpgrade,
      selectedFiringUnitId,
      wind,
      onShoot,
    ]
  );

  const isMyTurnInBattle = phase === 'battle' && currentPlayer === myPlayerId;
  const isTurnLocked = phase === 'battle' && currentPlayer !== myPlayerId;

  return (
    <div
      className={`relative rounded-2xl overflow-hidden shadow-2xl border transition-all duration-300 ${
        theme === 'day'
          ? isTurnLocked
            ? 'border-slate-300 opacity-95 bg-slate-100'
            : isMyTurnInBattle
            ? 'border-cyan-600 shadow-[0_0_25px_rgba(2,132,199,0.25)] bg-slate-100'
            : 'border-slate-300 bg-slate-100'
          : isTurnLocked
          ? 'border-slate-800 opacity-95 bg-[#060a12]'
          : isMyTurnInBattle
          ? 'border-cyan-500/80 shadow-[0_0_25px_rgba(6,182,212,0.25)] bg-[#060a12]'
          : 'border-slate-700/80 bg-[#060a12]'
      }`}
      style={{
        width: `${targetDimensions.width}px`,
        height: `${targetDimensions.height}px`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={targetDimensions.width}
        height={targetDimensions.height}
        onMouseDown={(e) => handlePointerDown(e.clientX, e.clientY)}
        onMouseMove={(e) => handlePointerMove(e.clientX, e.clientY)}
        onMouseUp={(e) => handlePointerUp(e.clientX, e.clientY)}
        onTouchStart={(e) => {
          if (e.touches.length > 0) handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchMove={(e) => {
          if (e.touches.length > 0) handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }}
        onTouchEnd={(e) => {
          if (e.changedTouches.length > 0)
            handlePointerUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
        }}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDoubleClick}
        className={`block w-full h-full select-none ${
          isTurnLocked ? 'cursor-not-allowed' : 'cursor-crosshair'
        }`}
      />

      {/* 3D Fold Holographic Sheet Transition */}
      {isFoldAnimating && (
        <div
          className={`absolute inset-0 pointer-events-none z-30 transition-all duration-700 ${
            foldingPlayer === 1
              ? 'bg-gradient-to-r from-cyan-500/25 to-transparent'
              : 'bg-gradient-to-l from-rose-500/25 to-transparent'
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
