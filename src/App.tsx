/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Users,
  Bot,
  Globe,
  Eye,
  EyeOff,
  HelpCircle,
  Download,
  Copy,
  Check,
  Sparkles,
  Wind as WindIcon,
  Coins,
  Shield,
  Layers,
  Send,
  Crosshair,
  Sliders,
  ArrowUpCircle,
  Heart,
  Zap,
} from 'lucide-react';
import {
  GameMode,
  GamePhase,
  PlayerId,
  Unit,
  Shot,
  AIDifficulty,
  TerrainType,
  BoardSizePreset,
  UnitType,
  UNIT_SPECS,
  Wind,
  PeerMessage,
} from './types';
import { NotebookBoard } from './components/NotebookBoard';
import { sounds } from './audio';
import { generateAISquad, computeAIShot } from './aiBot';
import { PeerGameSession } from './peerManager';
import { isPointInObstacle } from './canvasUtils';

export default function App() {
  // Board Configuration & Dimension Presets
  const [boardPreset, setBoardPreset] = useState<BoardSizePreset>('standard');
  const [customWidth, setCustomWidth] = useState<number>(880);
  const [terrain, setTerrain] = useState<TerrainType>('plain');
  const [unitScale, setUnitScale] = useState<number>(1.0); // اسلایدر ابعاد ادوات

  // Wind System
  const [windActive, setWindActive] = useState<boolean>(true);
  const [wind, setWind] = useState<Wind>({
    active: true,
    speed: 4,
    xOffsetPx: 8,
    yOffsetPx: -4,
  });

  // Game Mode & Flow
  const [mode, setMode] = useState<GameMode>('local');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');
  const [phase, setPhase] = useState<GamePhase>('deployment');
  const [currentPlayer, setCurrentPlayer] = useState<PlayerId>(1);
  const [myPlayerId, setMyPlayerId] = useState<PlayerId>(1);

  // Economy & Units
  const [p1Coins, setP1Coins] = useState<number>(1000);
  const [p2Coins, setP2Coins] = useState<number>(1000);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitToBuy, setSelectedUnitToBuy] = useState<UnitType | null>('tank');
  const [selectedFiringUnitId, setSelectedFiringUnitId] = useState<string | null>(null);

  // Upgrades Modal
  const [upgradingUnit, setUpgradingUnit] = useState<Unit | null>(null);

  // Shots & Animations
  const [shots, setShots] = useState<Shot[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(sounds.getMuted());
  const [showMirrorHint, setShowMirrorHint] = useState<boolean>(false);
  const [hideOpponentUnits, setHideOpponentUnits] = useState<boolean>(false);
  const [isFoldAnimating, setIsFoldAnimating] = useState<boolean>(false);
  const [foldingPlayer, setFoldingPlayer] = useState<PlayerId | null>(null);
  const [lastShotOutcome, setLastShotOutcome] = useState<{ isHit: boolean; text: string } | null>(null);
  const [winner, setWinner] = useState<PlayerId | null>(null);

  // Online PeerJS
  const [isOnlineModalOpen, setIsOnlineModalOpen] = useState<boolean>(false);
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputJoinCode, setInputJoinCode] = useState<string>('');
  const [peerStatus, setPeerStatus] = useState<string>('');
  const [isPeerConnected, setIsPeerConnected] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [chatMessages, setChatMessages] = useState<Array<{ sender: string; text: string }>>([]);
  const [chatInput, setChatInput] = useState<string>('');
  const [isHelpModalOpen, setIsHelpModalOpen] = useState<boolean>(false);

  const peerSessionRef = useRef<PeerGameSession | null>(null);

  // Target Dimensions based on preset or slider
  const getCanvasDimensions = () => {
    if (boardPreset === 'wide') return { width: 1040, height: 520 };
    if (boardPreset === 'custom') return { width: customWidth, height: Math.round(customWidth * 0.56) };
    return { width: 880, height: 500 }; // standard
  };
  const dimensions = getCanvasDimensions();

  // PeerSession lifecycle
  useEffect(() => {
    peerSessionRef.current = new PeerGameSession();
    return () => {
      peerSessionRef.current?.destroy();
    };
  }, []);

  // Randomize wind
  const randomizeWind = () => {
    if (!windActive) {
      setWind({ active: false, speed: 0, xOffsetPx: 0, yOffsetPx: 0 });
      return;
    }
    const speed = Math.floor(2 + Math.random() * 8); // 2 to 10 m/s
    const angle = Math.random() * Math.PI * 2;
    const maxOffset = speed * 2.2;
    setWind({
      active: true,
      speed,
      xOffsetPx: Math.round(Math.cos(angle) * maxOffset),
      yOffsetPx: Math.round(Math.sin(angle) * maxOffset),
    });
  };

  useEffect(() => {
    randomizeWind();
  }, [windActive]);

  const handleToggleSound = () => {
    const muted = sounds.toggleMute();
    setIsMuted(muted);
  };

  const resetGame = (newMode: GameMode = mode, newTerrain: TerrainType = terrain) => {
    setUnits([]);
    setShots([]);
    setP1Coins(1000);
    setP2Coins(1000);
    setPhase('deployment');
    setCurrentPlayer(1);
    setFoldingPlayer(null);
    setIsFoldAnimating(false);
    setLastShotOutcome(null);
    setWinner(null);
    setSelectedFiringUnitId(null);
    setUpgradingUnit(null);
    randomizeWind();

    if (newMode !== 'online') {
      setMyPlayerId(1);
    }
  };

  const handleSelectMode = (newMode: GameMode) => {
    if (newMode === 'online') {
      setIsOnlineModalOpen(true);
      return;
    }
    setMode(newMode);
    resetGame(newMode);
  };

  // --- Deployment Phase: Buying Units ---
  const handlePlaceUnit = (xRatio: number, yRatio: number) => {
    if (phase !== 'deployment' || !selectedUnitToBuy) return;

    const activePlayer = mode === 'online' ? myPlayerId : currentPlayer;
    const currentCoins = activePlayer === 1 ? p1Coins : p2Coins;
    const spec = UNIT_SPECS[selectedUnitToBuy];

    if (currentCoins < spec.cost) {
      setLastShotOutcome({ isHit: false, text: 'سکه کافی برای خرید این نیرو ندارید!' });
      setTimeout(() => setLastShotOutcome(null), 2000);
      return;
    }

    const newUnit: Unit = {
      id: `unit-${activePlayer}-${Date.now()}-${Math.random()}`,
      type: selectedUnitToBuy,
      xRatio,
      yRatio,
      player: activePlayer,
      hp: spec.baseHp,
      maxHp: spec.baseHp,
      isDestroyed: false,
      angle: (Math.random() - 0.5) * 0.25,
      upgrades: { extraHp: 0, inkRadiusBoost: 0, windResistance: false },
    };

    sounds.playTankPlace();
    setUnits((prev) => [...prev, newUnit]);

    if (activePlayer === 1) {
      setP1Coins((c) => c - spec.cost);
    } else {
      setP2Coins((c) => c - spec.cost);
    }
  };

  const handleFinishDeployment = () => {
    const activePlayer = mode === 'online' ? myPlayerId : currentPlayer;
    const playerUnits = units.filter((u) => u.player === activePlayer);

    if (playerUnits.length === 0) {
      alert('حداقل یک نیرو در زمین مستقر کنید!');
      return;
    }

    if (mode === 'local') {
      if (currentPlayer === 1) {
        setCurrentPlayer(2);
        setMyPlayerId(2);
      } else {
        setPhase('battle');
        setCurrentPlayer(1);
        setMyPlayerId(1);
        sounds.playPenScratch();
        const firstAlive = units.find((u) => u.player === 1 && !u.isDestroyed);
        if (firstAlive) setSelectedFiringUnitId(firstAlive.id);
      }
    } else if (mode === 'ai') {
      const aiSquad = generateAISquad(terrain);
      setUnits((prev) => [...prev, ...aiSquad]);
      setPhase('battle');
      setCurrentPlayer(1);
      sounds.playPenScratch();
      const firstAlive = units.find((u) => u.player === 1 && !u.isDestroyed);
      if (firstAlive) setSelectedFiringUnitId(firstAlive.id);
    } else if (mode === 'online') {
      peerSessionRef.current?.send({
        type: 'DEPLOY_DONE',
        payload: { units: playerUnits },
      });
      setPeerStatus('چیدمان ارسال شد. منتظر تایید حریف...');
    }
  };

  // --- Upgrades System ---
  const handleUpgradeUnit = (type: 'hp' | 'radius' | 'wind') => {
    if (!upgradingUnit) return;
    const activePlayer = upgradingUnit.player;
    const currentCoins = activePlayer === 1 ? p1Coins : p2Coins;

    let cost = 100;
    if (type === 'hp') cost = 120;
    if (type === 'radius') cost = 90;
    if (type === 'wind') cost = 100;

    if (currentCoins < cost) {
      alert('سکه کافی برای این ارتقا ندارید!');
      return;
    }

    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== upgradingUnit.id) return u;
        const newUpgrades = { ...u.upgrades };
        let newHp = u.hp;
        let newMaxHp = u.maxHp;

        if (type === 'hp') {
          newUpgrades.extraHp += 1;
          newHp += 1;
          newMaxHp += 1;
        } else if (type === 'radius') {
          newUpgrades.inkRadiusBoost += 1;
        } else if (type === 'wind') {
          newUpgrades.windResistance = true;
        }

        const updated = { ...u, hp: newHp, maxHp: newMaxHp, upgrades: newUpgrades };
        setUpgradingUnit(updated);
        return updated;
      })
    );

    if (activePlayer === 1) setP1Coins((c) => c - cost);
    else setP2Coins((c) => c - cost);

    sounds.playTankPlace();
  };

  // Auto select active firing unit when turn changes
  useEffect(() => {
    if (phase === 'battle') {
      const aliveUnits = units.filter((u) => u.player === currentPlayer && !u.isDestroyed);
      if (aliveUnits.length > 0 && (!selectedFiringUnitId || !aliveUnits.some((u) => u.id === selectedFiringUnitId))) {
        setSelectedFiringUnitId(aliveUnits[0].id);
      }
    }
  }, [currentPlayer, phase, units]);

  // --- Shooting Phase ---
  const executeShot = (sourceXRatio: number, sourceYRatio: number, shooter: PlayerId, firingUnit: Unit) => {
    if (isFoldAnimating || phase === 'gameover') return;

    setIsFoldAnimating(true);
    setFoldingPlayer(shooter);
    sounds.playPenDot();
    sounds.playPaperFold();

    const spec = UNIT_SPECS[firingUnit.type];
    const inkRadius = (spec.baseInkRadius + firingUnit.upgrades.inkRadiusBoost * 2.5) * unitScale;

    // Wind calculation (account for wind resistance upgrade)
    const effectiveWindX = firingUnit.upgrades.windResistance ? wind.xOffsetPx * 0.5 : wind.xOffsetPx;
    const effectiveWindY = firingUnit.upgrades.windResistance ? wind.yOffsetPx * 0.5 : wind.yOffsetPx;

    const windNormX = wind.active ? effectiveWindX / dimensions.width : 0;
    const windNormY = wind.active ? effectiveWindY / dimensions.height : 0;

    // Mirrored formula:
    const targetXRatio = 1 - sourceXRatio + windNormX;
    const targetYRatio = sourceYRatio + windNormY;

    setTimeout(() => {
      const opponentPlayer = shooter === 1 ? 2 : 1;
      let hitUnit: Unit | null = null;
      let isBlockedByObstacle = false;

      // 1. Check if shot hits rock bunker/obstacle
      if (terrain === 'obstacles' && isPointInObstacle(targetXRatio, targetYRatio)) {
        isBlockedByObstacle = true;
      }

      // 2. Check hit on units if not blocked
      if (!isBlockedByObstacle) {
        let minDistance = Infinity;
        units.forEach((u) => {
          if (u.player === opponentPlayer && !u.isDestroyed) {
            const dx = (u.xRatio - targetXRatio) * dimensions.width;
            const dy = (u.yRatio - targetYRatio) * dimensions.height;
            const dist = Math.hypot(dx, dy);

            const hitThreshold = (UNIT_SPECS[u.type].baseHitRadius + spec.baseInkRadius) * unitScale;
            if (dist <= hitThreshold && dist < minDistance) {
              minDistance = dist;
              hitUnit = u;
            }
          }
        });
      }

      const isHit = !!hitUnit;
      let unitDestroyed = false;
      let bountyEarned = 0;
      let updatedUnits = units;

      if (isBlockedByObstacle) {
        sounds.playMiss();
        setLastShotOutcome({ isHit: false, text: '🛡️ تیر به سنگر بتنی برخورد کرد و دفع شد!' });
      } else if (hitUnit) {
        sounds.playHit();
        const target = hitUnit as Unit;
        const remainingHp = target.hp - 1;

        if (remainingHp <= 0) {
          // Unit Destroyed!
          unitDestroyed = true;
          bountyEarned = UNIT_SPECS[target.type].bounty;
          setLastShotOutcome({
            isHit: true,
            text: `💥 ${UNIT_SPECS[target.type].name} کاملاً منهدم شد! (+${bountyEarned}🪙 پاداش ۱/۳)`,
          });

          if (shooter === 1) setP1Coins((c) => c + bountyEarned);
          else setP2Coins((c) => c + bountyEarned);

          updatedUnits = units.map((u) =>
            u.id === target.id ? { ...u, hp: 0, isDestroyed: true } : u
          );
        } else {
          // Unit Damaged!
          setLastShotOutcome({
            isHit: true,
            text: `🎯 به ${UNIT_SPECS[target.type].name} اصابت کرد! (۱ آسیب وارد شد، جان باقی‌مانده: ${remainingHp})`,
          });
          updatedUnits = units.map((u) =>
            u.id === target.id ? { ...u, hp: remainingHp } : u
          );
        }
        setUnits(updatedUnits);
      } else {
        sounds.playMiss();
        setLastShotOutcome({
          isHit: false,
          text: wind.active ? '💨 خطا رفت! (باد اثر جوهر را منحرف ساخت)' : '💨 خطا رفت! اثر جوهر باقی ماند.',
        });
      }

      // Record shot
      const newShot: Shot = {
        id: `shot-${Date.now()}`,
        sourceXRatio,
        sourceYRatio,
        targetXRatio,
        targetYRatio,
        player: shooter,
        firingUnitType: firingUnit.type,
        inkRadius,
        isHit,
        isBlockedByObstacle,
        hitUnitId: hitUnit ? (hitUnit as Unit).id : undefined,
        hitUnitType: hitUnit ? (hitUnit as Unit).type : undefined,
        unitDestroyed,
        bountyEarned,
        windApplied: wind.active ? { xOffsetPx: effectiveWindX, yOffsetPx: effectiveWindY } : undefined,
        timestamp: Date.now(),
      };
      setShots((prev) => [...prev, newShot]);

      setIsFoldAnimating(false);
      setFoldingPlayer(null);

      // Check GameOver
      const p1Alive = updatedUnits.filter((u) => u.player === 1 && !u.isDestroyed).length;
      const p2Alive = updatedUnits.filter((u) => u.player === 2 && !u.isDestroyed).length;

      if (p2Alive === 0) {
        setWinner(1);
        setPhase('gameover');
        sounds.playVictory();
        confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
        return;
      }
      if (p1Alive === 0) {
        setWinner(2);
        setPhase('gameover');
        sounds.playVictory();
        confetti({ particleCount: 140, spread: 85, origin: { y: 0.6 } });
        return;
      }

      // Turn transition
      randomizeWind();
      const nextPlayer = shooter === 1 ? 2 : 1;
      setCurrentPlayer(nextPlayer);

      if (mode === 'local') setMyPlayerId(nextPlayer);

      // Trigger AI
      if (mode === 'ai' && nextPlayer === 2) {
        setTimeout(() => triggerAITurn(updatedUnits), 900);
      }
    }, 1400);
  };

  const handleShoot = (xRatio: number, yRatio: number) => {
    if (phase !== 'battle' || isFoldAnimating) return;
    if (currentPlayer !== myPlayerId) return;

    const firingUnit = units.find((u) => u.id === selectedFiringUnitId);
    if (!firingUnit || firingUnit.isDestroyed) {
      alert('لطفاً ابتدا یکی از ادوات زنده را برای شلیک انتخاب کنید!');
      return;
    }

    executeShot(xRatio, yRatio, currentPlayer, firingUnit);

    if (mode === 'online') {
      peerSessionRef.current?.send({
        type: 'SHOOT',
        payload: { xRatio, yRatio, player: currentPlayer, firingUnit },
      });
    }
  };

  const triggerAITurn = (currentUnits: Unit[]) => {
    const aiData = computeAIShot(
      currentUnits.filter((u) => u.player === 1),
      currentUnits.filter((u) => u.player === 2),
      shots,
      aiDifficulty,
      dimensions.width,
      dimensions.height,
      wind
    );
    executeShot(aiData.xRatio, aiData.yRatio, 2, aiData.firingUnit);
  };

  // PeerJS Online Multiplayer
  const handleHostRoom = () => {
    if (!peerSessionRef.current) return;
    setPeerStatus('در حال ثبت اتاق در شبکه همتا...');
    peerSessionRef.current.initHost(
      (code) => {
        setRoomCode(code);
        setPeerStatus('اتاق ساخته شد! کد را برای دوستتان بفرستید.');
      },
      () => {
        setIsPeerConnected(true);
        setMode('online');
        setMyPlayerId(1);
        resetGame('online');
        setTimeout(() => setIsOnlineModalOpen(false), 800);
      },
      handlePeerMessage,
      (status, connected) => {
        setPeerStatus(status);
        setIsPeerConnected(connected);
      }
    );
  };

  const handleJoinRoom = () => {
    if (!peerSessionRef.current || !inputJoinCode.trim()) return;
    setPeerStatus('در حال اتصال به اتاق...');
    peerSessionRef.current.joinRoom(
      inputJoinCode.trim(),
      () => {
        setIsPeerConnected(true);
        setMode('online');
        setMyPlayerId(2);
        resetGame('online');
        setTimeout(() => setIsOnlineModalOpen(false), 800);
      },
      handlePeerMessage,
      (status, connected) => {
        setPeerStatus(status);
        setIsPeerConnected(connected);
      }
    );
  };

  const handlePeerMessage = (msg: PeerMessage) => {
    if (msg.type === 'DEPLOY_DONE') {
      const opponentUnits: Unit[] = msg.payload.units;
      setUnits((prev) => {
        const combined = [...prev.filter((u) => u.player === myPlayerId), ...opponentUnits];
        setPhase('battle');
        setCurrentPlayer(1);
        setLastShotOutcome({ isHit: false, text: 'نبرد آغاز شد! نوبت شلیک بازیکن ۱.' });
        return combined;
      });
    } else if (msg.type === 'SHOOT') {
      const { xRatio, yRatio, player, firingUnit } = msg.payload;
      executeShot(xRatio, yRatio, player, firingUnit);
    } else if (msg.type === 'CHAT') {
      setChatMessages((prev) => [...prev, { sender: 'حریف', text: msg.payload.text }]);
    }
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !peerSessionRef.current) return;
    const text = chatInput.trim();
    peerSessionRef.current.send({ type: 'CHAT', payload: { text } });
    setChatMessages((prev) => [...prev, { sender: 'من', text }]);
    setChatInput('');
  };

  const downloadSingleFileHtml = () => {
    const link = document.createElement('a');
    link.href = '/paper-war-advanced.html';
    link.download = 'paper-war-advanced-standalone.html';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentCoins = currentPlayer === 1 ? p1Coins : p2Coins;
  const aliveUnitsOfCurrentPlayer = units.filter((u) => u.player === currentPlayer && !u.isDestroyed);

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0f172a] flex flex-col items-center py-4 px-3 sm:px-6 font-['Vazirmatn'] selection:bg-blue-100">
      {/* Top Header */}
      <header className="w-full max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white border border-slate-300 shadow-sm flex items-center justify-center text-2xl">
            📄
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 flex items-center gap-2">
              جنگ کاغذی پیشرفته
              <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-bold border border-blue-200">
                کاغذ سفید و سیستم ارتقا
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              بوم سفید تمیز، جان (HP)، اسلایدر ابعاد، باد تصادفی و پاداش ۱/۳ غنائم
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={handleToggleSound}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-700 shadow-sm transition"
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-500" /> : <Volume2 className="w-4 h-4 text-emerald-600" />}
            <span>{isMuted ? 'صامت' : 'صدا'}</span>
          </button>

          <button
            onClick={() => setIsHelpModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-xs font-bold text-slate-700 shadow-sm transition"
          >
            <HelpCircle className="w-4 h-4 text-blue-600" />
            <span>راهنمای بازی</span>
          </button>

          <button
            onClick={downloadSingleFileHtml}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 border border-blue-300 text-xs font-bold text-blue-900 shadow-sm transition"
            title="دانلود نسخه تک‌فایلی مستقل HTML بدون نیاز به سرور"
          >
            <Download className="w-4 h-4 text-blue-700" />
            <span>دانلود نسخه تک‌فایلی (HTML)</span>
          </button>
        </div>
      </header>

      {/* Main Configuration & Slider Bar */}
      <div className="w-full max-w-5xl bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-200 shadow-sm mb-3 flex flex-wrap items-center justify-between gap-3">
        {/* Game Mode */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => handleSelectMode('local')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              mode === 'local' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>دونفره (Pass & Play)</span>
          </button>

          <button
            onClick={() => handleSelectMode('ai')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              mode === 'ai' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            <span>بازی با کامپیوتر</span>
          </button>

          <button
            onClick={() => handleSelectMode('online')}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              mode === 'online' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 hover:bg-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>آنلاین PeerJS</span>
          </button>
        </div>

        {/* Board Dimension & Scale Sliders */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 font-semibold">ابعاد کاغذ:</span>
            <select
              value={boardPreset}
              onChange={(e) => setBoardPreset(e.target.value as BoardSizePreset)}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="standard">استاندارد (۸۸۰×۵۰۰)</option>
              <option value="wide">عریض (۱۰۴۰×۵۲۰)</option>
              <option value="custom">سفارشی با اسلایدر</option>
            </select>
          </div>

          {boardPreset === 'custom' && (
            <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
              <span className="text-slate-500 font-semibold">عرض: {customWidth}px</span>
              <input
                type="range"
                min="740"
                max="1120"
                step="20"
                value={customWidth}
                onChange={(e) => setCustomWidth(Number(e.target.value))}
                className="w-20 cursor-pointer accent-blue-600"
              />
            </div>
          )}

          {/* Unit Scale Slider */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <Sliders className="w-3 h-3 text-slate-500" />
            <span className="text-slate-500 font-semibold">مقیاس ادوات: {Math.round(unitScale * 100)}%</span>
            <input
              type="range"
              min="0.75"
              max="1.45"
              step="0.05"
              value={unitScale}
              onChange={(e) => setUnitScale(Number(e.target.value))}
              className="w-20 cursor-pointer accent-blue-600"
            />
          </div>

          {/* Terrain Select */}
          <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 rounded-lg border border-slate-200 text-xs">
            <span className="text-slate-500 font-semibold">زمین:</span>
            <select
              value={terrain}
              onChange={(e) => {
                setTerrain(e.target.value as TerrainType);
                resetGame(mode, e.target.value as TerrainType);
              }}
              className="bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="plain">📄 سفید ساده</option>
              <option value="river">🌊 پهنه آبی پایین (قایق)</option>
              <option value="obstacles">⛰️ سنگرهای بتنی</option>
            </select>
          </div>

          {/* Wind Toggle */}
          <button
            onClick={() => setWindActive(!windActive)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
              windActive ? 'bg-sky-50 border-sky-300 text-sky-800' : 'bg-slate-50 border-slate-200 text-slate-500'
            }`}
          >
            <WindIcon className="w-3.5 h-3.5 text-sky-600" />
            <span>{windActive ? 'باد فعال' : 'بدون باد'}</span>
          </button>

          {mode === 'local' && (
            <button
              onClick={() => setHideOpponentUnits(!hideOpponentUnits)}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-bold border transition ${
                hideOpponentUnits
                  ? 'bg-amber-50 border-amber-300 text-amber-800'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-white'
              }`}
            >
              {hideOpponentUnits ? <EyeOff className="w-3.5 h-3.5 text-amber-700" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{hideOpponentUnits ? 'مخفی' : 'پوشش'}</span>
            </button>
          )}

          <button
            onClick={() => resetGame()}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>از نو</span>
          </button>
        </div>
      </div>

      {/* Deployment Shop Bar */}
      {phase === 'deployment' && (
        <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-2xl p-3 shadow-sm mb-3">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-800">
                🛒 خرید ادوات (نوبت {currentPlayer === 1 ? 'بازیکن ۱ 🔵' : 'بازیکن ۲ 🔴'})
              </span>
              <div className="flex items-center gap-1 bg-amber-50 border border-amber-300 text-amber-900 px-3 py-0.5 rounded-full text-xs font-black">
                <Coins className="w-3.5 h-3.5 text-amber-600" />
                <span>بودجه: {currentCoins} سکه</span>
              </div>
              <span className="text-xs text-slate-500 mr-2">
                (نکته: برای ارتقا می‌توانید روی نیروهای چیده شده کلیک کنید!)
              </span>
            </div>

            <button
              onClick={handleFinishDeployment}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-xl text-xs transition shadow-sm"
            >
              تکمیل چیدمان و شروع نبرد ⚔️
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(UNIT_SPECS) as UnitType[]).map((type) => {
              const spec = UNIT_SPECS[type];
              const isSelected = selectedUnitToBuy === type;
              const canAfford = currentCoins >= spec.cost;
              const isBoatDisabled = type === 'boat' && terrain !== 'river';

              return (
                <button
                  key={type}
                  disabled={!canAfford || isBoatDisabled}
                  onClick={() => setSelectedUnitToBuy(type)}
                  className={`p-2.5 rounded-xl border text-right transition flex flex-col justify-between ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50/70 shadow-sm ring-2 ring-blue-300'
                      : canAfford && !isBoatDisabled
                      ? 'border-slate-200 bg-white hover:border-slate-300'
                      : 'border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-1">
                    <span className="text-xl">{spec.icon}</span>
                    <span className="text-xs font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      {spec.cost} سکه
                    </span>
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-800 flex items-center justify-between">
                      <span>{spec.name}</span>
                      <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200">
                        جان: {spec.baseHp}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 leading-tight mt-0.5">{spec.description}</div>
                  </div>
                  <div className="text-[10px] text-emerald-700 font-semibold mt-1">
                    پاداش انهدام: +{spec.bounty} سکه (۱/۳)
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Battle Firing Bar */}
      {phase === 'battle' && (
        <div className="w-full max-w-5xl bg-white border border-slate-200 rounded-2xl p-2.5 shadow-sm mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Crosshair className="w-4 h-4 text-blue-600" />
              <span>انتخاب ادوات شلیک:</span>
            </span>

            <div className="flex items-center gap-1.5 flex-wrap">
              {aliveUnitsOfCurrentPlayer.map((unit, idx) => {
                const spec = UNIT_SPECS[unit.type];
                const isSelected = unit.id === selectedFiringUnitId;
                return (
                  <button
                    key={unit.id}
                    onClick={() => setSelectedFiringUnitId(unit.id)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border transition ${
                      isSelected
                        ? 'bg-amber-100 border-amber-400 text-amber-900 shadow-sm ring-1 ring-amber-300'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                    }`}
                  >
                    <span>{spec.icon}</span>
                    <span>
                      {spec.name} #{idx + 1}
                    </span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded">
                      HP: {unit.hp}/{unit.maxHp}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs font-bold">
            <div className="flex items-center gap-1 text-blue-700">
              <span>کیف پول ب۱:</span>
              <span className="font-mono bg-blue-50 px-2 py-0.5 rounded border border-blue-200">{p1Coins} 🪙</span>
            </div>
            <div className="flex items-center gap-1 text-red-700">
              <span>کیف پول ب۲:</span>
              <span className="font-mono bg-red-50 px-2 py-0.5 rounded border border-red-200">{p2Coins} 🪙</span>
            </div>
          </div>
        </div>
      )}

      {/* Canvas Board Component */}
      <NotebookBoard
        phase={phase}
        currentPlayer={currentPlayer}
        myPlayerId={mode === 'online' ? myPlayerId : currentPlayer}
        terrain={terrain}
        units={units}
        shots={shots}
        unitScale={unitScale}
        selectedUnitToBuy={selectedUnitToBuy}
        selectedFiringUnitId={selectedFiringUnitId}
        wind={wind}
        onPlaceUnit={handlePlaceUnit}
        onShoot={handleShoot}
        onSelectUnitForUpgrade={(unit) => setUpgradingUnit(unit)}
        onSelectFiringUnit={(id) => setSelectedFiringUnitId(id)}
        showMirrorHint={showMirrorHint}
        hideOpponentUnits={hideOpponentUnits}
        isFoldAnimating={isFoldAnimating}
        foldingPlayer={foldingPlayer}
        lastShotOutcome={lastShotOutcome}
        targetDimensions={dimensions}
      />

      {/* Unit Upgrades Modal Drawer */}
      {upgradingUnit && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-sm w-full p-5 shadow-2xl relative">
            <div className="flex items-center justify-between border-b pb-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{UNIT_SPECS[upgradingUnit.type].icon}</span>
                <div>
                  <h3 className="font-black text-sm text-slate-800">
                    ارتقای {UNIT_SPECS[upgradingUnit.type].name}
                  </h3>
                  <span className="text-xs text-slate-500">
                    جان فعلی: {upgradingUnit.hp} / {upgradingUnit.maxHp}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setUpgradingUnit(null)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2.5 mb-4">
              {/* Extra HP */}
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Heart className="w-4 h-4 text-red-500" />
                  <div>
                    <div className="text-xs font-bold text-slate-800">افزایش جان (+۱ HP)</div>
                    <div className="text-[10px] text-slate-500">مقاومت بیشتر در برابر گلوله‌ها</div>
                  </div>
                </div>
                <button
                  onClick={() => handleUpgradeUnit('hp')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded-lg text-xs"
                >
                  ۱۲۰ 🪙
                </button>
              </div>

              {/* Ink Shrapnel Radius Boost */}
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <div>
                    <div className="text-xs font-bold text-slate-800">شعاع ترکش جوهر (+۲.۵px)</div>
                    <div className="text-[10px] text-slate-500">افزایش محدوده لکه و تخریب</div>
                  </div>
                </div>
                <button
                  onClick={() => handleUpgradeUnit('radius')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded-lg text-xs"
                >
                  ۹۰ 🪙
                </button>
              </div>

              {/* Wind Resistance */}
              <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2">
                  <WindIcon className="w-4 h-4 text-sky-500" />
                  <div>
                    <div className="text-xs font-bold text-slate-800">تثبیت شلیک (مقاومت باد ۵۰٪)</div>
                    <div className="text-[10px] text-slate-500">کاهش انحراف شلیک در اثر باد</div>
                  </div>
                </div>
                <button
                  disabled={upgradingUnit.upgrades.windResistance}
                  onClick={() => handleUpgradeUnit('wind')}
                  className={`${
                    upgradingUnit.upgrades.windResistance
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  } font-bold px-3 py-1 rounded-lg text-xs`}
                >
                  {upgradingUnit.upgrades.windResistance ? 'فعال شد' : '۱۰۰ 🪙'}
                </button>
              </div>
            </div>

            <button
              onClick={() => setUpgradingUnit(null)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs transition"
            >
              بستن
            </button>
          </div>
        </div>
      )}

      {/* Online Modal */}
      {isOnlineModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-2">
              <Globe className="w-5 h-5 text-blue-600" />
              <span>بازی آنلاین مستقیم (WebRTC P2P)</span>
            </h2>
            <p className="text-xs text-slate-500 mb-4 leading-relaxed">
              اتصال مستقیم دو مرورگر بدون نیاز به سرور میانی با کتابخانه رایگان PeerJS.
            </p>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-3">
              <div className="text-xs font-bold text-slate-700 mb-1">روش ۱: ساخت اتاق جدید (شما بازیکن ۱)</div>
              {!roomCode ? (
                <button
                  onClick={handleHostRoom}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-xl text-xs transition shadow-sm"
                >
                  ایجاد اتاق اختصاصی 🎲
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between bg-white border border-blue-200 p-2 rounded-lg">
                    <span className="font-mono text-base font-bold text-blue-800">{roomCode}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(roomCode);
                        setCopiedCode(true);
                        setTimeout(() => setCopiedCode(false), 2000);
                      }}
                      className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'کپی شد' : 'کپی'}</span>
                    </button>
                  </div>
                  <div className="text-[11px] text-amber-700 font-semibold text-center animate-pulse">
                    منتظر ورود حریف به این اتاق...
                  </div>
                </div>
              )}
            </div>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 mb-3">
              <div className="text-xs font-bold text-slate-700 mb-1">روش ۲: ورود به اتاق دوست (شما بازیکن ۲)</div>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="کد اتاق دوستتان..."
                  value={inputJoinCode}
                  onChange={(e) => setInputJoinCode(e.target.value)}
                  className="flex-1 bg-white border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono outline-none focus:border-blue-500"
                />
                <button
                  onClick={handleJoinRoom}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-1.5 rounded-xl text-xs transition shadow-sm"
                >
                  اتصال
                </button>
              </div>
            </div>

            {peerStatus && (
              <div className="text-xs font-bold text-slate-600 bg-slate-100 p-2 rounded-lg text-center mb-3">
                {peerStatus}
              </div>
            )}

            <button
              onClick={() => setIsOnlineModalOpen(false)}
              className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs transition"
            >
              بستن
            </button>
          </div>
        </div>
      )}

      {/* Rules Modal */}
      {isHelpModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 mb-3">
              <span>📖 قوانین بازی جنگ کاغذی پیشرفته</span>
            </h2>

            <div className="space-y-3 text-xs leading-relaxed text-slate-600">
              <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl text-blue-900">
                <h4 className="font-bold mb-1">کاغذ سفید و سیستم سلامت (HP):</h4>
                <p>
                  هر بازیکن در ابتدا ۱۰۰۰ سکه بودجه دارد. ادوات دارای جان (HP) هستند؛ سرباز ۱ جان، تانک ۲ جان، قایق ۲ جان و هواپیما ۲ جان دارند.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">سیستم ارتقا (Upgrades):</h4>
                <p>
                  با کلیک روی ادوات مستقر در زمین خودی، می‌توانید جان آن‌ها را افزایش دهید (+1 HP)، شعاع ترکش جوهر را بزرگتر کنید یا مقاومت در برابر انحراف باد بخرید!
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">پاداش انهدام کامل (۱/۳ قیمت خرید):</h4>
                <p>
                  با صفر شدن جان هر یک از ادوات دشمن، دقیقاً یک‌سوم قیمت خرید اصلی آن به عنوان پاداش به حساب شما افزوده می‌شود.
                </p>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-1">فرمول تا خوردن برگه و انحراف باد:</h4>
                <div className="mt-1 font-mono text-[11px] bg-slate-100 p-2 rounded text-slate-800 text-center dir-ltr">
                  Target_X = (Canvas_Width - Click_X) + Wind_X &nbsp;|&nbsp; Target_Y = Click_Y + Wind_Y
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsHelpModalOpen(false)}
              className="mt-4 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl text-xs transition"
            >
              متوجه شدم، شروع بازی!
            </button>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="mt-3 text-center text-xs text-slate-400 font-medium">
        شبیه‌سازی کامل و دقیق بازی نوستالژیک جنگ کاغذی و تا کردن برگه ✏️🇮🇷
      </footer>
    </div>
  );
}
