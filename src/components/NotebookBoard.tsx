import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Unit, Shot, PlayerId, GamePhase, TerrainType, UnitType, Wind, UNIT_SPECS } from '../types';
import {
  drawCleanWhitePaper,
  drawUnit,
  drawShot,
  drawAimPreview,
  isPointInWater,
  isPointInObstacle,
  P1_COLOR,
  P2_COLOR,
} from '../canvasUtils';

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
  onPlaceUnit: (xRatio: number, yRatio: number) => void;
  onShoot: (xRatio: number, yRatio: number) => void;
  onSelectUnitForUpgrade: (unit: Unit) => void;
  onSelectFiringUnit: (unitId: string) => void;
  showMirrorHint: boolean;
  hideOpponentUnits: boolean;
  isFoldAnimating: boolean;
  foldingPlayer: PlayerId | null;
  lastShotOutcome: { isHit: boolean; text: string } | null;
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
  onPlaceUnit,
  onShoot,
  onSelectUnitForUpgrade,
  onSelectFiringUnit,
  showMirrorHint,
  hideOpponentUnits,
  isFoldAnimating,
  foldingPlayer,
  lastShotOutcome,
  targetDimensions,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [placementError, setPlacementError] = useState<string | null>(null);

  const { width, height } = targetDimensions;

  // Currently selected firing unit
  const selectedFiringUnit = units.find((u) => u.id === selectedFiringUnitId) || null;

  // Render loop
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.resetTransform();
    ctx.scale(dpr, dpr);

    // 1. Draw Clean White Paper with middle dashed fold crease
    drawCleanWhitePaper(ctx, width, height, terrain);

    // 2. Draw units with HP pips and scale
    units.forEach((unit) => {
      const isOpponent = unit.player !== myPlayerId;
      const shouldHide = hideOpponentUnits && isOpponent && !unit.isDestroyed;
      const isSelected = unit.id === selectedFiringUnitId;
      drawUnit(ctx, unit, width, height, unitScale, !shouldHide, isSelected);
    });

    // 3. Draw past ink shots
    shots.forEach((shot, idx) => {
      drawShot(ctx, shot, width, height, idx);
    });

    // 4. Hover preview
    if (hoverPos && !isFoldAnimating && phase !== 'gameover') {
      const isMyTurn = currentPlayer === myPlayerId;
      if (isMyTurn && phase === 'battle') {
        const windOffset = wind.active
          ? selectedFiringUnit?.upgrades.windResistance
            ? { x: wind.xOffsetPx * 0.5, y: wind.yOffsetPx * 0.5 }
            : { x: wind.xOffsetPx, y: wind.yOffsetPx }
          : { x: 0, y: 0 };

        drawAimPreview(
          ctx,
          hoverPos.x,
          hoverPos.y,
          currentPlayer,
          selectedFiringUnit,
          width,
          unitScale,
          showMirrorHint,
          windOffset
        );
      } else if (isMyTurn && phase === 'deployment' && selectedUnitToBuy) {
        const midX = width / 2;
        const validX = myPlayerId === 1 ? hoverPos.x < midX - 20 && hoverPos.x > 30 : hoverPos.x > midX + 20 && hoverPos.x < width - 30;
        const xR = hoverPos.x / width;
        const yR = hoverPos.y / height;

        let validTerrain = true;
        if (selectedUnitToBuy === 'boat') {
          validTerrain = terrain === 'river' && isPointInWater(xR, yR);
        } else if (terrain === 'river' && isPointInWater(xR, yR)) {
          validTerrain = false;
        }
        if (terrain === 'obstacles' && isPointInObstacle(xR, yR)) {
          validTerrain = false;
        }

        ctx.save();
        ctx.beginPath();
        const r = UNIT_SPECS[selectedUnitToBuy].baseHitRadius * unitScale;
        ctx.arc(hoverPos.x, hoverPos.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = validX && validTerrain ? (myPlayerId === 1 ? P1_COLOR : P2_COLOR) : '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        ctx.font = '11px Vazirmatn, sans-serif';
        ctx.fillStyle = validX && validTerrain ? '#1e293b' : '#ef4444';
        ctx.textAlign = 'center';
        ctx.fillText(
          validX && validTerrain ? `محل استقرار ${UNIT_SPECS[selectedUnitToBuy].name}` : 'موقعیت نامعتبر!',
          hoverPos.x,
          hoverPos.y - r - 6
        );
        ctx.restore();
      }
    }
  }, [
    width,
    height,
    terrain,
    units,
    shots,
    unitScale,
    hoverPos,
    isFoldAnimating,
    phase,
    currentPlayer,
    myPlayerId,
    hideOpponentUnits,
    showMirrorHint,
    selectedUnitToBuy,
    selectedFiringUnitId,
    selectedFiringUnit,
    wind,
  ]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Click handler
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isFoldAnimating || phase === 'gameover') return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const midX = width / 2;

    const xRatio = clickX / width;
    const yRatio = clickY / height;

    // Check if clicked directly on an existing friendly unit
    const clickedFriendlyUnit = units.find((u) => {
      if (u.player !== myPlayerId || u.isDestroyed) return false;
      const ux = u.xRatio * width;
      const uy = u.yRatio * height;
      const hitRadius = UNIT_SPECS[u.type].baseHitRadius * unitScale + 6;
      return Math.hypot(ux - clickX, uy - clickY) <= hitRadius;
    });

    if (clickedFriendlyUnit) {
      if (phase === 'deployment') {
        // Open upgrade modal for this unit!
        onSelectUnitForUpgrade(clickedFriendlyUnit);
        return;
      } else if (phase === 'battle') {
        // Select this unit as active shooter, or click for upgrade
        onSelectFiringUnit(clickedFriendlyUnit.id);
        onSelectUnitForUpgrade(clickedFriendlyUnit);
        return;
      }
    }

    if (phase === 'deployment') {
      const isP1 = myPlayerId === 1;
      const validSide = isP1 ? clickX < midX - 20 && clickX > 30 : clickX > midX + 20 && clickX < width - 30;
      if (!validSide) {
        setPlacementError('تنها در نیمه زمین خود می‌توانید نیرو مستقر کنید!');
        setTimeout(() => setPlacementError(null), 2500);
        return;
      }

      if (!selectedUnitToBuy) {
        setPlacementError('لطفاً ابتدا یک نوع نیرو از نوار خرید انتخاب کنید.');
        setTimeout(() => setPlacementError(null), 2500);
        return;
      }

      // Check boat water requirement
      if (selectedUnitToBuy === 'boat') {
        if (terrain !== 'river' || !isPointInWater(xRatio, yRatio)) {
          setPlacementError('قایق جنگی فقط و فقط در پهنه آبی/رودخانه پایین صفحه قابل استقرار است!');
          setTimeout(() => setPlacementError(null), 2500);
          return;
        }
      } else {
        if (terrain === 'river' && isPointInWater(xRatio, yRatio)) {
          setPlacementError('نیروهای زمینی و هوایی نمی‌توانند داخل آب مستقر شوند!');
          setTimeout(() => setPlacementError(null), 2500);
          return;
        }
      }

      if (terrain === 'obstacles' && isPointInObstacle(xRatio, yRatio)) {
        setPlacementError('امکان استقرار بر روی سنگرهای بتنی وجود ندارد!');
        setTimeout(() => setPlacementError(null), 2500);
        return;
      }

      onPlaceUnit(xRatio, yRatio);
    } else if (phase === 'battle') {
      if (currentPlayer !== myPlayerId) return;

      const isP1 = currentPlayer === 1;
      const validSide = isP1 ? clickX < midX - 10 && clickX > 15 : clickX > midX + 10 && clickX < width - 15;
      if (!validSide) {
        setPlacementError('برای شلیک باید در نیمه زمین خودتان یک نقطه جوهر بگذارید!');
        setTimeout(() => setPlacementError(null), 2500);
        return;
      }

      onShoot(xRatio, yRatio);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isFoldAnimating) {
      setHoverPos(null);
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setHoverPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  const handleMouseLeave = () => {
    setHoverPos(null);
  };

  const p1Alive = units.filter((u) => u.player === 1 && !u.isDestroyed).length;
  const p2Alive = units.filter((u) => u.player === 2 && !u.isDestroyed).length;

  return (
    <div className="relative w-full flex flex-col items-center">
      {/* Territory Indicators */}
      <div className="w-full flex justify-between items-center px-4 py-1.5 text-xs sm:text-sm font-bold">
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition ${
            currentPlayer === 1
              ? 'bg-blue-50 border-blue-400 text-blue-900 shadow-sm ring-2 ring-blue-200'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block"></span>
          <span>زمین بازیکن ۱ (آبی)</span>
          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded font-mono">
            نیروها: {p1Alive}
          </span>
        </div>

        {/* Wind Status */}
        {wind.active && (
          <div className="flex items-center gap-1.5 bg-sky-50 text-sky-900 border border-sky-300 px-3 py-1 rounded-full text-xs font-bold shadow-sm">
            <span>💨 باد:</span>
            <span>{wind.speed} م/ث</span>
            <span
              className="inline-block transform font-black"
              style={{
                transform: `rotate(${Math.atan2(wind.yOffsetPx, wind.xOffsetPx)}rad)`,
              }}
            >
              ➔
            </span>
          </div>
        )}

        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition ${
            currentPlayer === 2
              ? 'bg-red-50 border-red-400 text-red-900 shadow-sm ring-2 ring-red-200'
              : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-red-600 inline-block"></span>
          <span>زمین بازیکن ۲ (قرمز)</span>
          <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded font-mono">
            نیروها: {p2Alive}
          </span>
        </div>
      </div>

      {/* Main Canvas Container with Clean White Paper Aesthetic */}
      <div
        ref={containerRef}
        className="relative rounded-2xl shadow-xl overflow-hidden border-2 border-slate-300 bg-white perspective-1000 transition-all duration-300"
        style={{
          width: `${width}px`,
          height: `${height}px`,
          maxWidth: '100%',
        }}
      >
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{
            width: '100%',
            height: '100%',
            cursor:
              isFoldAnimating || phase === 'gameover'
                ? 'default'
                : 'crosshair',
          }}
          className="block touch-none select-none"
        />

        {/* 3D Paper Fold Simulation */}
        {isFoldAnimating && (
          <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
            {foldingPlayer === 1 && (
              <div
                className="absolute top-0 bottom-0 left-0 w-1/2 bg-white border-r-2 border-slate-300 shadow-2xl transition-transform duration-700 ease-in-out"
                style={{
                  transformOrigin: 'right center',
                  animation: 'foldFlipP1 1.4s ease-in-out forwards',
                }}
              >
                <div className="absolute inset-0 bg-slate-50 opacity-95 border-r border-slate-300 flex items-center justify-center">
                  <div className="text-slate-700 font-bold text-xs bg-white/90 px-3 py-1 rounded shadow transform rotate-90 border">
                    📄 تا کردن و انتقال جوهر
                  </div>
                </div>
              </div>
            )}

            {foldingPlayer === 2 && (
              <div
                className="absolute top-0 bottom-0 right-0 w-1/2 bg-white border-l-2 border-slate-300 shadow-2xl transition-transform duration-700 ease-in-out"
                style={{
                  transformOrigin: 'left center',
                  animation: 'foldFlipP2 1.4s ease-in-out forwards',
                }}
              >
                <div className="absolute inset-0 bg-slate-50 opacity-95 border-l border-slate-300 flex items-center justify-center">
                  <div className="text-slate-700 font-bold text-xs bg-white/90 px-3 py-1 rounded shadow transform -rotate-90 border">
                    📄 تا کردن و انتقال جوهر
                  </div>
                </div>
              </div>
            )}

            <div className="z-40 bg-slate-900/90 text-amber-300 px-5 py-2.5 rounded-full shadow-2xl border border-amber-400/40 font-bold text-xs sm:text-sm flex items-center gap-2 animate-bounce">
              <span>✍️ برگه کاغذ تا شد و جوهر فشرده گردید...</span>
            </div>
          </div>
        )}

        {/* Error Notification */}
        {placementError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-red-600 text-white rounded-xl shadow-lg text-xs font-bold z-30 animate-pulse">
            ⚠️ {placementError}
          </div>
        )}

        {/* Shot Outcome Toast */}
        {lastShotOutcome && !isFoldAnimating && (
          <div
            className={`absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl shadow-lg border text-xs sm:text-sm font-black z-20 flex items-center gap-2 animate-pulse ${
              lastShotOutcome.isHit
                ? 'bg-red-500 text-white border-red-600 shadow-red-200'
                : 'bg-slate-800 text-slate-100 border-slate-700'
            }`}
          >
            <span>{lastShotOutcome.isHit ? '💥' : '💨'}</span>
            <span>{lastShotOutcome.text}</span>
          </div>
        )}
      </div>

      <style>{`
        @keyframes foldFlipP1 {
          0% { transform: rotateY(0deg); }
          45% { transform: rotateY(176deg); box-shadow: 20px 0 35px rgba(0,0,0,0.3); }
          65% { transform: rotateY(176deg); }
          100% { transform: rotateY(0deg); }
        }
        @keyframes foldFlipP2 {
          0% { transform: rotateY(0deg); }
          45% { transform: rotateY(-176deg); box-shadow: -20px 0 35px rgba(0,0,0,0.3); }
          65% { transform: rotateY(-176deg); }
          100% { transform: rotateY(0deg); }
        }
      `}</style>
    </div>
  );
};
