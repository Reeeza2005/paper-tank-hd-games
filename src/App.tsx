import React, { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  Volume2,
  VolumeX,
  RotateCcw,
  Users,
  Bot,
  Globe,
  HelpCircle,
  Wind as WindIcon,
  Shield,
  Factory as FactoryIcon,
  Crosshair,
  Sliders,
  DollarSign,
  Maximize2,
  Compass,
} from 'lucide-react';
import {
  GameMode,
  GamePhase,
  PlayerId,
  Unit,
  Shot,
  AIDifficulty,
  TerrainType,
  UnitType,
  UNIT_SPECS,
  Wind,
  FoldLineMode,
  FoldLineConfig,
  KillcamData,
  PeerMessage,
} from './types';
import { NotebookBoard } from './components/NotebookBoard';
import { sounds } from './audio';
import { generateAISquad, computeAIShot } from './aiBot';
import { PeerGameSession } from './peerManager';

export default function App() {
  // Game Setup & Dimensions
  const [boardWidth, setBoardWidth] = useState<number>(920);
  const [terrain, setTerrain] = useState<TerrainType>('plain');
  const [unitScale, setUnitScale] = useState<number>(1.0);
  const [startingBudget, setStartingBudget] = useState<number>(1000);

  // Dynamic Fold Line System
  const [foldConfig, setFoldConfig] = useState<FoldLineConfig>({
    dynamicEnabled: true,
    currentMode: 'center',
  });

  // Wind System
  const [windActive, setWindActive] = useState<boolean>(true);
  const [wind, setWind] = useState<Wind>({
    active: true,
    speed: 4,
    xOffsetPx: 8,
    yOffsetPx: -4,
    angle: 0,
  });

  // Game Mode & Flow
  const [mode, setMode] = useState<GameMode>('local');
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('medium');
  const [phase, setPhase] = useState<GamePhase>('deployment');
  const [currentPlayer, setCurrentPlayer] = useState<PlayerId>(1);
  const [myPlayerId, setMyPlayerId] = useState<PlayerId>(1);

  // Economy & Armies
  const [p1Coins, setP1Coins] = useState<number>(1000);
  const [p2Coins, setP2Coins] = useState<number>(1000);
  const [units, setUnits] = useState<Unit[]>([]);
  const [selectedUnitToBuy, setSelectedUnitToBuy] = useState<UnitType | null>('tank');
  const [selectedFiringUnitId, setSelectedFiringUnitId] = useState<string | null>(null);

  // Upgrades & Modals
  const [upgradingUnit, setUpgradingUnit] = useState<Unit | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [shots, setShots] = useState<Shot[]>([]);
  const [isMuted, setIsMuted] = useState<boolean>(sounds.getMuted());
  const [isFoldAnimating, setIsFoldAnimating] = useState<boolean>(false);
  const [foldingPlayer, setFoldingPlayer] = useState<PlayerId | null>(null);
  const [winner, setWinner] = useState<PlayerId | null>(null);

  // Killcam Cinematic Popup
  const [killcam, setKillcam] = useState<KillcamData | null>(null);

  // Toast Notification
  const [toast, setToast] = useState<{ msg: string; icon: string } | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string, icon: string = '🎯') => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ msg, icon });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  // PeerJS Online Multiplayer
  const [isOnlineModalOpen, setIsOnlineModalOpen] = useState<boolean>(false);
  const [roomCode, setRoomCode] = useState<string>('');
  const [inputJoinCode, setInputJoinCode] = useState<string>('');
  const [peerStatus, setPeerStatus] = useState<string>('');
  const peerSessionRef = useRef<PeerGameSession | null>(null);

  // Calculate proportional height from width (16:9 approx)
  const targetDimensions = {
    width: boardWidth,
    height: Math.round(boardWidth * 0.554),
  };

  // Randomize wind
  const randomizeWind = useCallback(() => {
    if (!windActive) {
      setWind({ active: false, speed: 0, xOffsetPx: 0, yOffsetPx: 0, angle: 0 });
      return;
    }
    const speed = Math.floor(2 + Math.random() * 8);
    const angle = Math.random() * Math.PI * 2;
    const xOffsetPx = Math.round(Math.cos(angle) * speed * 2.2);
    const yOffsetPx = Math.round(Math.sin(angle) * speed * 2.2);
    setWind({ active: true, speed, xOffsetPx, yOffsetPx, angle });
  }, [windActive]);

  // Turn Progression: Decrease cooldown, generate factory income, roll dynamic fold
  const proceedToNextTurn = useCallback(
    (nextPlayer: PlayerId) => {
      setCurrentPlayer(nextPlayer);
      if (mode === 'local') setMyPlayerId(nextPlayer);

      // 1. Cool down units for next player
      setUnits((prev) =>
        prev.map((u) => {
          if (u.player === nextPlayer && u.cooldownRemaining > 0) {
            return { ...u, cooldownRemaining: u.cooldownRemaining - 1 };
          }
          return u;
        })
      );

      // 2. Factory Income (+50 coins per alive factory)
      setUnits((currentUnits) => {
        const factories = currentUnits.filter(
          (u) => u.player === nextPlayer && u.type === 'factory' && !u.isDestroyed
        );
        if (factories.length > 0) {
          const income = factories.length * 50;
          if (nextPlayer === 1) setP1Coins((c) => c + income);
          else setP2Coins((c) => c + income);
          sounds.playCoinEarn();
          showToast(`🏭 کارخانه‌های بازیکن ${nextPlayer} درآمد تولید کردند: +${income} 🪙`, '💰');
        }
        return currentUnits;
      });

      // 3. Dynamic Fold Line Randomization (if enabled)
      if (foldConfig.dynamicEnabled) {
        const modes: FoldLineMode[] = ['center', 'slight_right', 'slight_left'];
        const randomMode = modes[Math.floor(Math.random() * modes.length)];
        setFoldConfig((prev) => ({ ...prev, currentMode: randomMode }));
      }

      randomizeWind();
    },
    [mode, foldConfig.dynamicEnabled, randomizeWind, showToast]
  );

  // SMART WIN CONDITION CHECK:
  // If player has 0 combat units AND coins < 100 (cannot buy soldier) -> Opponent wins!
  const checkSmartWinCondition = useCallback(
    (currentUnits: Unit[], p1C: number, p2C: number) => {
      if (phase === 'deployment' || winner) return;

      const p1CombatUnits = currentUnits.filter(
        (u) => u.player === 1 && !u.isDestroyed && UNIT_SPECS[u.type].canShoot
      );
      const p2CombatUnits = currentUnits.filter(
        (u) => u.player === 2 && !u.isDestroyed && UNIT_SPECS[u.type].canShoot
      );

      const p1TotalAlive = currentUnits.filter((u) => u.player === 1 && !u.isDestroyed);
      const p2TotalAlive = currentUnits.filter((u) => u.player === 2 && !u.isDestroyed);

      // Player 2 wins if Player 1 cannot fight
      if (
        (p1TotalAlive.length === 0 || (p1CombatUnits.length === 0 && p1C < 100)) &&
        p2TotalAlive.length > 0
      ) {
        setWinner(2);
        setPhase('gameover');
        sounds.playVictory();
        confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
        return;
      }

      // Player 1 wins if Player 2 cannot fight
      if (
        (p2TotalAlive.length === 0 || (p2CombatUnits.length === 0 && p2C < 100)) &&
        p1TotalAlive.length > 0
      ) {
        setWinner(1);
        setPhase('gameover');
        sounds.playVictory();
        confetti({ particleCount: 140, spread: 90, origin: { y: 0.6 } });
        return;
      }
    },
    [phase, winner]
  );

  // Place unit (Deployment OR Mid-Battle Reinforcement)
  const handlePlaceUnit = useCallback(
    (xRatio: number, yRatio: number, unitType: UnitType) => {
      const spec = UNIT_SPECS[unitType];
      const currentCoins = currentPlayer === 1 ? p1Coins : p2Coins;

      if (currentCoins < spec.cost) {
        showToast('سکه کافی برای خرید این نیرو ندارید!', '💰');
        return;
      }

      const newUnit: Unit = {
        id: `unit-${Date.now()}-${Math.random()}`,
        type: unitType,
        xRatio,
        yRatio,
        player: currentPlayer,
        hp: spec.baseHp,
        maxHp: spec.baseHp,
        isDestroyed: false,
        angle: (Math.random() - 0.5) * 0.2,
        cooldownRemaining: 0,
        upgrades: { extraHp: 0, inkRadiusBoost: 0, windResistance: false },
      };

      if (currentPlayer === 1) {
        setP1Coins((c) => c - spec.cost);
      } else {
        setP2Coins((c) => c - spec.cost);
      }

      setUnits((prev) => [...prev, newUnit]);
      sounds.playPenDot();
      sounds.playTankPlace();

      if (phase === 'battle') {
        showToast(`واحد کمکی ${spec.name} مستقر شد!`, '🛡️');
        // Unselect buy mode after placing reinforcement
        setSelectedUnitToBuy(null);

        // Sync via PeerJS if online
        if (mode === 'online' && peerSessionRef.current) {
          peerSessionRef.current.send({
            type: 'REINFORCE_UNIT',
            payload: { unit: newUnit, remainingCoins: currentCoins - spec.cost },
          });
        }
      }
    },
    [currentPlayer, p1Coins, p2Coins, phase, showToast, mode]
  );

  // Complete initial deployment
  const finishDeployment = useCallback(() => {
    const myUnits = units.filter((u) => u.player === currentPlayer);
    if (myUnits.length === 0) {
      showToast('حداقل یک واحد رزمی در زمین مستقر کنید!', '⚠️');
      return;
    }

    if (mode === 'local') {
      if (currentPlayer === 1) {
        setCurrentPlayer(2);
        setMyPlayerId(2);
        showToast('نوبت استقرار ارتش بازیکن ۲ 🔴', '🚩');
      } else {
        setPhase('battle');
        proceedToNextTurn(1);
        showToast('نبرد آتشین آغاز شد! شلیک کنید ⚔️', '🔥');
      }
    } else if (mode === 'ai') {
      const aiSquad = generateAISquad(terrain, startingBudget);
      setUnits((prev) => [...prev, ...aiSquad]);
      setP2Coins(0);
      setPhase('battle');
      proceedToNextTurn(1);
      showToast('نبرد با ارتش هوش مصنوعی آغاز شد! ⚔️', '🤖');
    }
  }, [units, currentPlayer, mode, terrain, startingBudget, proceedToNextTurn, showToast]);

  // Execute shot
  const handleShoot = useCallback(
    (shotData: {
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
    }) => {
      setIsFoldAnimating(true);
      setFoldingPlayer(currentPlayer);
      sounds.playPenDot();
      sounds.playFoldSweep();

      // Put firing unit on 1-turn Cooldown
      if (selectedFiringUnitId) {
        setUnits((prev) =>
          prev.map((u) => (u.id === selectedFiringUnitId ? { ...u, cooldownRemaining: 1 } : u))
        );
      }

      setTimeout(() => {
        setIsFoldAnimating(false);

        // Process Damage & Bounty
        if (shotData.absorbedByBunkerId) {
          // Bunker took hit!
          sounds.playShieldAbsorb();
          setUnits((prev) =>
            prev.map((u) => {
              if (u.id === shotData.absorbedByBunkerId) {
                const nextHp = u.hp - 1;
                return { ...u, hp: nextHp, isDestroyed: nextHp <= 0 };
              }
              return u;
            })
          );

          if (shotData.unitDestroyed) {
            if (currentPlayer === 1) setP1Coins((c) => c + shotData.bountyEarned);
            else setP2Coins((c) => c + shotData.bountyEarned);
            sounds.playCinematicBoom();
            if (shotData.killcam) setKillcam(shotData.killcam);
            showToast(`💥 سنگر بتنی منهدم شد! (+${shotData.bountyEarned}🪙 غنیمت)`, '🔥');
          } else {
            showToast('🛡️ سنگر بتنی ضربه را مهار کرد!', '🏰');
          }
        } else if (shotData.hitUnitId) {
          sounds.playHitExplosion();
          setUnits((prev) =>
            prev.map((u) => {
              if (u.id === shotData.hitUnitId) {
                const nextHp = u.hp - 1;
                return { ...u, hp: nextHp, isDestroyed: nextHp <= 0 };
              }
              return u;
            })
          );

          if (shotData.unitDestroyed) {
            if (currentPlayer === 1) setP1Coins((c) => c + shotData.bountyEarned);
            else setP2Coins((c) => c + shotData.bountyEarned);
            sounds.playCinematicBoom();
            if (shotData.killcam) setKillcam(shotData.killcam);
            showToast(`💥 واحد دشمن منهدم شد! (+${shotData.bountyEarned}🪙 غنیمت)`, '🔥');
          } else {
            showToast('🎯 اصابت مستقیم به هدف!', '💥');
          }
        } else {
          sounds.playMiss();
          showToast('💨 تیر خطا رفت!', '💨');
        }

        const newShot: Shot = {
          id: `shot-${Date.now()}`,
          sourceXRatio: shotData.sourceXR,
          sourceYRatio: shotData.sourceYR,
          targetXRatio: shotData.targetXR,
          targetYRatio: shotData.targetYR,
          player: currentPlayer,
          firingUnitType: (units.find((u) => u.id === selectedFiringUnitId)?.type || 'tank') as UnitType,
          firingUnitId: selectedFiringUnitId || '',
          inkRadius: 10,
          isHit: shotData.isHit,
          hitUnitId: shotData.hitUnitId,
          hitUnitType: shotData.hitUnitType,
          absorbedByBunkerId: shotData.absorbedByBunkerId,
          unitDestroyed: shotData.unitDestroyed,
          bountyEarned: shotData.bountyEarned,
          timestamp: Date.now(),
        };

        setShots((prev) => [...prev, newShot]);

        // Online sync
        if (mode === 'online' && peerSessionRef.current) {
          peerSessionRef.current.send({
            type: 'SHOOT',
            payload: shotData,
          });
        }

        // Check Smart Win Condition
        setTimeout(() => {
          setUnits((currUnits) => {
            checkSmartWinCondition(currUnits, p1Coins, p2Coins);
            return currUnits;
          });

          if (!winner) {
            const nextP = currentPlayer === 1 ? 2 : 1;
            proceedToNextTurn(nextP);
          }
        }, 300);
      }, 1200);
    },
    [
      currentPlayer,
      selectedFiringUnitId,
      units,
      p1Coins,
      p2Coins,
      mode,
      checkSmartWinCondition,
      winner,
      proceedToNextTurn,
      showToast,
    ]
  );

  // AI Turn Execution
  useEffect(() => {
    if (phase !== 'battle' || mode !== 'ai' || currentPlayer !== 2 || isFoldAnimating || winner) {
      return;
    }

    const timer = setTimeout(() => {
      const p1Alive = units.filter((u) => u.player === 1 && !u.isDestroyed);
      const aiUnits = units.filter((u) => u.player === 2);

      // AI mid-battle reinforcement check: if AI has >= 250 coins and fewer combat units
      const aiCombatCount = aiUnits.filter(
        (u) => !u.isDestroyed && UNIT_SPECS[u.type].canShoot
      ).length;
      if (p2Coins >= 250 && aiCombatCount < 2) {
        handlePlaceUnit(0.65 + Math.random() * 0.25, 0.25 + Math.random() * 0.45, 'tank');
      }

      const aiShot = computeAIShot(
        p1Alive,
        aiUnits,
        shots,
        aiDifficulty,
        targetDimensions.width,
        targetDimensions.height,
        wind,
        foldConfig.currentMode
      );

      if (aiShot) {
        setSelectedFiringUnitId(aiShot.firingUnit.id);
        // Trigger AI shot via virtual click
        const clickX = aiShot.xRatio * targetDimensions.width;
        const clickY = aiShot.yRatio * targetDimensions.height;

        // Simulate click
        const simulatedEvent = {
          clientX: clickX,
          clientY: clickY,
        } as any;
        // In this architecture, we can call handleShoot directly
        const reflected = {
          rx: (1 - aiShot.xRatio) * targetDimensions.width,
          ry: aiShot.yRatio * targetDimensions.height,
        };
        const targetXR = reflected.rx / targetDimensions.width;
        const targetYR = reflected.ry / targetDimensions.height;

        // Find if target lands on P1
        let hit: Unit | null = null;
        for (const u of p1Alive) {
          const dist = Math.hypot(
            u.xRatio * targetDimensions.width - reflected.rx,
            u.yRatio * targetDimensions.height - reflected.ry
          );
          if (dist <= 30) {
            hit = u;
            break;
          }
        }

        handleShoot({
          sourceXR: aiShot.xRatio,
          sourceYR: aiShot.yRatio,
          targetXR,
          targetYR,
          isHit: !!hit,
          hitUnitId: hit?.id,
          hitUnitType: hit?.type,
          unitDestroyed: hit ? hit.hp - 1 <= 0 : false,
          bountyEarned: hit && hit.hp - 1 <= 0 ? UNIT_SPECS[hit.type].bounty : 0,
        });
      } else {
        // AI has no shooters; pass turn
        proceedToNextTurn(1);
      }
    }, 1400);

    return () => clearTimeout(timer);
  }, [
    phase,
    mode,
    currentPlayer,
    isFoldAnimating,
    winner,
    units,
    p2Coins,
    shots,
    aiDifficulty,
    targetDimensions,
    wind,
    foldConfig,
    handlePlaceUnit,
    handleShoot,
    proceedToNextTurn,
  ]);

  // Restart Game
  const resetGame = useCallback(() => {
    setPhase('deployment');
    setCurrentPlayer(1);
    setMyPlayerId(1);
    setP1Coins(startingBudget);
    setP2Coins(startingBudget);
    setUnits([]);
    setShots([]);
    setSelectedFiringUnitId(null);
    setSelectedUnitToBuy('tank');
    setWinner(null);
    setKillcam(null);
    randomizeWind();
    showToast('میدان نبرد پاکسازی و مجدداً آماده شد 🔄', '✨');
  }, [startingBudget, randomizeWind, showToast]);

  // PeerJS Session Setup
  const openOnlineModal = () => {
    setIsOnlineModalOpen(true);
  };

  const createOnlineRoom = () => {
    if (!peerSessionRef.current) peerSessionRef.current = new PeerGameSession();
    peerSessionRef.current.initHost(
      (code) => {
        setRoomCode(code);
        setMyPlayerId(1);
        setMode('online');
      },
      () => {
        setPeerStatus('✅ حریف متصل شد! نبرد آنلاین آغاز گردید.');
        setTimeout(() => setIsOnlineModalOpen(false), 1200);
        resetGame();
      },
      (msg) => {
        if (msg.type === 'SHOOT') handleShoot(msg.payload);
        else if (msg.type === 'REINFORCE_UNIT') {
          setUnits((prev) => [...prev, msg.payload.unit]);
          setP2Coins(msg.payload.remainingCoins);
        }
      },
      (st) => setPeerStatus(st)
    );
  };

  const joinOnlineRoom = () => {
    if (!inputJoinCode) return alert('کد اتاق را وارد کنید');
    if (!peerSessionRef.current) peerSessionRef.current = new PeerGameSession();
    peerSessionRef.current.joinRoom(
      inputJoinCode.trim(),
      () => {
        setMyPlayerId(2);
        setMode('online');
        setPeerStatus('✅ به اتاق بازی وصل شدید!');
        setTimeout(() => setIsOnlineModalOpen(false), 1000);
        resetGame();
      },
      (msg: PeerMessage) => {
        if (msg.type === 'SHOOT') handleShoot(msg.payload);
        else if (msg.type === 'REINFORCE_UNIT') {
          setUnits((prev) => [...prev, msg.payload.unit]);
          setP1Coins(msg.payload.remainingCoins);
        }
      },
      (st: string) => setPeerStatus(st)
    );
  };

  // Upgrades
  const handleApplyUpgrade = (type: 'hp' | 'radius' | 'wind') => {
    if (!upgradingUnit) return;
    const cost = type === 'hp' ? 120 : type === 'radius' ? 90 : 100;
    const currentCoins = upgradingUnit.player === 1 ? p1Coins : p2Coins;

    if (currentCoins < cost) {
      showToast('سکه کافی برای خرید این ارتقا ندارید!', '💰');
      return;
    }

    if (upgradingUnit.player === 1) setP1Coins((c) => c - cost);
    else setP2Coins((c) => c - cost);

    setUnits((prev) =>
      prev.map((u) => {
        if (u.id === upgradingUnit.id) {
          if (type === 'hp') return { ...u, hp: u.hp + 1, maxHp: u.maxHp + 1 };
          if (type === 'radius')
            return {
              ...u,
              upgrades: { ...u.upgrades, inkRadiusBoost: u.upgrades.inkRadiusBoost + 1 },
            };
          if (type === 'wind')
            return { ...u, upgrades: { ...u.upgrades, windResistance: true } };
        }
        return u;
      })
    );

    sounds.playVictory();
    showToast('ارتقای رزمی با موفقیت اعمال گردید! ⚡', '🛡️');
    setUpgradingUnit(null);
  };

  const p1AliveUnits = units.filter((u) => u.player === 1 && !u.isDestroyed);
  const p2AliveUnits = units.filter((u) => u.player === 2 && !u.isDestroyed);
  const p1Factories = p1AliveUnits.filter((u) => u.type === 'factory').length;
  const p2Factories = p2AliveUnits.filter((u) => u.type === 'factory').length;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col items-center p-3 select-none font-['Vazirmatn',sans-serif]">
      {/* Top Header */}
      <header className="w-full max-w-[1220px] bg-slate-900/85 backdrop-blur-md border border-slate-800 rounded-2xl px-5 py-3 mb-2 flex flex-wrap justify-between items-center shadow-lg gap-2">
        <div>
          <h1 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
            <span>⚔️ جنگ کاغذی تاکتیکی HD</span>
            <span className="text-[11px] font-bold bg-cyan-950 text-cyan-400 border border-cyan-800/80 px-2.5 py-0.5 rounded-full">
              Dark Tactical
            </span>
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            میدان نبرد مدرن، خط تای متغیر، سنگر بتنی محافظ و تقویت نیروها حین نبرد
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const muted = sounds.toggleMute();
              setIsMuted(muted);
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span>{isMuted ? 'صدا: خاموش' : 'صدا: روشن'}</span>
          </button>

          <button
            onClick={() => setIsHelpOpen(true)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 border border-slate-700 flex items-center gap-1.5 transition"
          >
            <HelpCircle size={15} />
            <span>راهنمای نبرد</span>
          </button>
        </div>
      </header>

      {/* Control Bar: Mode, Budget, Map, Fold Line */}
      <div className="w-full max-w-[1220px] flex flex-col gap-2 mb-2">
        <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-xl px-4 py-2 flex flex-wrap justify-between items-center gap-3 text-xs">
          {/* Mode switch */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setMode('local');
                resetGame();
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                mode === 'local'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Users size={14} /> <span>دو نفره (یک سیستم)</span>
            </button>

            <button
              onClick={() => {
                setMode('ai');
                resetGame();
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                mode === 'ai'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Bot size={14} /> <span>نبرد هوش مصنوعی</span>
            </button>

            <button
              onClick={openOnlineModal}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                mode === 'online'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Globe size={14} /> <span>آنلاین P2P</span>
            </button>
          </div>

          {/* Setup controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-bold">💰 بودجه:</span>
              <select
                value={startingBudget}
                disabled={phase === 'battle'}
                onChange={(e) => {
                  setStartingBudget(Number(e.target.value));
                  setP1Coins(Number(e.target.value));
                  setP2Coins(Number(e.target.value));
                }}
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1 font-bold outline-none cursor-pointer"
              >
                <option value={500}>۵۰۰ 🪙 (تاکتیکی)</option>
                <option value={1000}>۱۰۰۰ 🪙 (استاندارد)</option>
                <option value={2000}>۲۰۰۰ 🪙 (لشکرکشی)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-bold">🗺️ نقشه:</span>
              <select
                value={terrain}
                disabled={phase === 'battle'}
                onChange={(e) => {
                  setTerrain(e.target.value as TerrainType);
                  resetGame();
                }}
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded-lg px-2 py-1 font-bold outline-none cursor-pointer"
              >
                <option value="plain">⛰️ زمین ساده تاکتیکی</option>
                <option value="river">🌊 پهنه ساحلی و رودخانه</option>
              </select>
            </div>

            {/* Dynamic Fold Toggle */}
            <div className="flex items-center gap-1.5 bg-slate-800/60 border border-slate-700 px-2.5 py-1 rounded-lg">
              <span className="text-slate-400 font-bold">📐 خط تا:</span>
              <button
                onClick={() =>
                  setFoldConfig((prev) => ({
                    ...prev,
                    dynamicEnabled: !prev.dynamicEnabled,
                    currentMode: !prev.dynamicEnabled ? prev.currentMode : 'center',
                  }))
                }
                className={`px-2 py-0.5 rounded text-[11px] font-black transition ${
                  foldConfig.dynamicEnabled
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
              >
                {foldConfig.dynamicEnabled ? 'پویا (متغیر)' : 'قفل در مرکز'}
              </button>
            </div>

            <button
              onClick={resetGame}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-slate-300 border border-slate-700 transition"
              title="شروع مجدد بازی"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        {/* Board Width Slider & Wind Status */}
        <div className="bg-slate-900/60 backdrop-blur-md border border-slate-800/60 rounded-xl px-4 py-1.5 flex flex-wrap justify-between items-center text-xs text-slate-400 gap-3">
          <div className="flex items-center gap-2">
            <span className="font-bold flex items-center gap-1">
              <Maximize2 size={13} /> اسلایدر ابعاد میدان نبرد:
            </span>
            <input
              type="range"
              min="760"
              max="1180"
              step="30"
              value={boardWidth}
              onChange={(e) => setBoardWidth(Number(e.target.value))}
              className="w-28 accent-cyan-500 cursor-pointer"
            />
            <span className="text-cyan-400 font-black">
              {targetDimensions.width} × {targetDimensions.height} px
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span>مقیاس ادوات:</span>
              <input
                type="range"
                min="0.8"
                max="1.3"
                step="0.05"
                value={unitScale}
                onChange={(e) => setUnitScale(Number(e.target.value))}
                className="w-16 accent-blue-500"
              />
            </div>

            <button
              onClick={() => {
                setWindActive(!windActive);
                randomizeWind();
              }}
              className={`px-2 py-0.5 rounded font-bold border transition ${
                windActive
                  ? 'bg-cyan-950/80 border-cyan-700 text-cyan-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              💨 باد: {windActive ? `${wind.speed} م/ث` : 'خاموش'}
            </button>
          </div>
        </div>
      </div>

      {/* Status Row */}
      <div className="w-full max-w-[1220px] grid grid-cols-1 md:grid-cols-3 items-center gap-2.5 mb-2">
        {/* P1 Badge */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
            currentPlayer === 1
              ? 'bg-cyan-950/60 border-cyan-500 shadow-[0_0_15px_rgba(0,210,255,0.25)] scale-[1.01]'
              : 'bg-slate-900/60 border-slate-800 opacity-80'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-cyan-400 font-black text-sm">🔵 بازیکن ۱</span>
            {p1Factories > 0 && (
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded font-black">
                +{p1Factories * 50}🪙/نوبت
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded">
              {p1Coins} 🪙
            </span>
            <span className="text-slate-400">{p1AliveUnits.length} نیرو</span>
          </div>
        </div>

        {/* Center Indicator */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2 flex items-center justify-center gap-4 text-xs font-bold shadow-md">
          <div className="flex items-center gap-1.5 text-purple-400">
            <Compass size={14} />
            <span>
              {foldConfig.currentMode === 'slight_right'
                ? 'مورب راست (+۹°)'
                : foldConfig.currentMode === 'slight_left'
                ? 'مورب چپ (-۹°)'
                : 'وسط عمودی (۰°)'}
            </span>
          </div>

          <div className="h-3 w-px bg-slate-700" />

          <div className="flex items-center gap-1.5 text-cyan-400">
            <WindIcon size={14} />
            <span>{wind.active ? `${wind.speed} م/ث` : 'بدون باد'}</span>
          </div>
        </div>

        {/* P2 Badge */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
            currentPlayer === 2
              ? 'bg-rose-950/60 border-rose-500 shadow-[0_0_15px_rgba(255,59,87,0.25)] scale-[1.01]'
              : 'bg-slate-900/60 border-slate-800 opacity-80'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-rose-400 font-black text-sm">🔴 بازیکن ۲</span>
            {p2Factories > 0 && (
              <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.5 rounded font-black">
                +{p2Factories * 50}🪙/نوبت
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="text-amber-400 bg-amber-950/60 border border-amber-800 px-2 py-0.5 rounded">
              {p2Coins} 🪙
            </span>
            <span className="text-slate-400">{p2AliveUnits.length} نیرو</span>
          </div>
        </div>
      </div>

      {/* Mid-Battle Reinforcements Shop & Deployment Arsenal */}
      <div className="w-full max-w-[1220px] bg-slate-900/90 border border-slate-800 rounded-2xl p-3 mb-2 shadow-xl">
        <div className="flex justify-between items-center mb-2 px-1">
          <div className="text-xs font-black text-slate-200 flex items-center gap-2">
            <span>🛒 انبار تسلیحات و تدارکات</span>
            <span className="text-[11px] font-bold text-slate-400">
              (خرید و استقرار نیروی کمکی در نوبت خودتان حتی حین نبرد فعال است)
            </span>
          </div>

          {phase === 'deployment' && (
            <button
              onClick={finishDeployment}
              className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-xs font-black text-white shadow-lg shadow-blue-500/20 transition"
            >
              تکمیل چینش و آغاز نبرد ⚔️
            </button>
          )}
        </div>

        {/* Shop Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
          {(['soldier', 'tank', 'plane', 'boat', 'bunker', 'factory'] as UnitType[]).map((type) => {
            const spec = UNIT_SPECS[type];
            const isSelected = selectedUnitToBuy === type;
            const currentCoins = currentPlayer === 1 ? p1Coins : p2Coins;
            const canAfford = currentCoins >= spec.cost;

            return (
              <div
                key={type}
                onClick={() => {
                  if (canAfford) {
                    setSelectedUnitToBuy(isSelected ? null : type);
                  } else {
                    showToast('سکه کافی برای این نیرو ندارید!', '💰');
                  }
                }}
                className={`p-2.5 rounded-xl border cursor-pointer transition flex flex-col justify-between text-right ${
                  isSelected
                    ? 'bg-blue-950/80 border-cyan-400 shadow-md ring-1 ring-cyan-400'
                    : canAfford
                    ? 'bg-slate-800/60 hover:bg-slate-800 border-slate-700'
                    : 'bg-slate-900/40 border-slate-800/80 opacity-50 cursor-not-allowed'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-black text-white flex items-center gap-1">
                      <span>{spec.icon}</span> <span>{spec.name}</span>
                    </span>
                    <span className="text-[11px] font-black text-amber-400 bg-amber-950/50 px-1.5 py-0.2 rounded border border-amber-800/80">
                      {spec.cost} 🪙
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
                    {spec.description}
                  </p>
                </div>

                <div className="mt-2 pt-1 border-t border-slate-700/60 flex justify-between items-center text-[10px] font-bold">
                  <span className="text-emerald-400">HP: {spec.baseHp}</span>
                  {isSelected && <span className="text-cyan-300 font-black">آماده استقرار 📍</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Firing Bar (In Battle Phase) */}
      {phase === 'battle' && (
        <div className="w-full max-w-[1220px] bg-slate-900/90 border border-slate-800 rounded-2xl px-4 py-2.5 mb-2 flex flex-wrap justify-between items-center gap-3 shadow-lg">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black text-slate-300 flex items-center gap-1.5">
              <Crosshair size={14} className="text-amber-400" /> واحد شلیک‌کننده:
            </span>

            <div className="flex items-center gap-1.5 flex-wrap">
              {units
                .filter(
                  (u) =>
                    u.player === currentPlayer && !u.isDestroyed && UNIT_SPECS[u.type].canShoot
                )
                .map((u, i) => {
                  const spec = UNIT_SPECS[u.type];
                  const isSelected = u.id === selectedFiringUnitId;
                  const isReady = u.cooldownRemaining === 0;

                  return (
                    <button
                      key={u.id}
                      disabled={!isReady}
                      onClick={() => setSelectedFiringUnitId(u.id)}
                      className={`px-3 py-1 rounded-xl text-xs font-black border transition flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md ring-1 ring-amber-300'
                          : isReady
                          ? 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                          : 'bg-slate-900/40 text-slate-500 border-slate-800 cursor-not-allowed'
                      }`}
                    >
                      <span>{spec.icon}</span>
                      <span>
                        {spec.name} #{i + 1} ({u.hp}❤️)
                      </span>
                      {!isReady && (
                        <span className="text-[10px] text-amber-500 bg-amber-950 px-1 py-0.2 rounded">
                          ⏳ استراحت
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>

          <div className="text-[11px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/80 px-3 py-1 rounded-lg">
            🎯 روی نیمه زمین خودت کلیک کن تا تیر با زاویه خط تا شلیک بشه!
          </div>
        </div>
      )}

      {/* Main Tactical Canvas Board */}
      <div className="w-full flex justify-center mb-2">
        <NotebookBoard
          phase={phase}
          currentPlayer={currentPlayer}
          myPlayerId={myPlayerId}
          terrain={terrain}
          units={units}
          shots={shots}
          unitScale={unitScale}
          selectedUnitToBuy={selectedUnitToBuy}
          selectedFiringUnitId={selectedFiringUnitId}
          wind={wind}
          foldConfig={foldConfig}
          onPlaceUnit={handlePlaceUnit}
          onShoot={handleShoot}
          onSelectUnitForUpgrade={(u) => setUpgradingUnit(u)}
          onSelectFiringUnit={(id) => setSelectedFiringUnitId(id)}
          onShowToast={showToast}
          isFoldAnimating={isFoldAnimating}
          foldingPlayer={foldingPlayer}
          targetDimensions={targetDimensions}
        />
      </div>

      {/* Killcam Cinematic Popup */}
      {killcam && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-rose-500/80 rounded-2xl p-6 max-w-sm w-full text-center shadow-2xl shadow-rose-950/50 animate-in zoom-in-95 duration-200">
            <span className="text-xs font-black tracking-widest text-rose-400 bg-rose-950 border border-rose-800 px-3 py-1 rounded-full uppercase">
              CRITICAL HIT • شکار موفق
            </span>

            <div className="text-6xl my-4 animate-bounce">
              {killcam.victimType === 'plane'
                ? '💥✈️'
                : killcam.victimType === 'tank'
                ? '💥🛡️'
                : killcam.victimType === 'bunker'
                ? '💥🏰'
                : killcam.victimType === 'factory'
                ? '💥🏭'
                : '💥🪖'}
            </div>

            <h3 className="text-xl font-black text-white mb-1">
              انهدام کامل {UNIT_SPECS[killcam.victimType].name}!
            </h3>

            <p className="text-xs text-slate-400 mb-4 font-bold">
              توسط {UNIT_SPECS[killcam.attackerType].name} بازیکن {killcam.attackerPlayer} • غنیمت: +
              {killcam.bounty} 🪙
            </p>

            <button
              onClick={() => setKillcam(null)}
              className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-xl transition"
            >
              تایید و ادامه نبرد
            </button>
          </div>
        </div>
      )}

      {/* Winner Modal */}
      {winner && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-lg flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-amber-500/80 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl shadow-amber-950/50">
            <div className="text-6xl mb-4">🏆</div>
            <h2 className="text-2xl font-black text-white mb-2">
              پیروزی مقتدرانه بازیکن {winner} {winner === 1 ? '🔵' : '🔴'}!
            </h2>
            <p className="text-xs text-slate-300 font-bold mb-6 leading-relaxed">
              تمامی نیروهای تهاجمی حریف متلاشی شدند و بودجه‌ای برای استخدام نیروی جدید باقی نماند!
            </p>
            <button
              onClick={resetGame}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-sm rounded-xl shadow-lg transition"
            >
              شروع نبرد جدید ⚔️
            </button>
          </div>
        </div>
      )}

      {/* Upgrades Modal */}
      {upgradingUnit && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-black text-white mb-1">
              🛠️ ارتقای رزمی {UNIT_SPECS[upgradingUnit.type].name} (جان: {upgradingUnit.hp}/
              {upgradingUnit.maxHp})
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              ارتقای قابلیت‌های این نیرو برای برتری در میدان نبرد:
            </p>

            <div className="flex flex-col gap-2 mb-4">
              <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-black text-white">❤️ زره تقویتی (+۱ جان)</h4>
                  <p className="text-[10px] text-slate-400">مقاومت در برابر یک اصابت مستقیم اضافی</p>
                </div>
                <button
                  onClick={() => handleApplyUpgrade('hp')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-lg transition"
                >
                  ۱۲۰ 🪙
                </button>
              </div>

              <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-black text-white">⚡ افزایش شعاع ترکش (+۲.۵px)</h4>
                  <p className="text-[10px] text-slate-400">گسترش محدوده انفجار هنگام برخورد</p>
                </div>
                <button
                  onClick={() => handleApplyUpgrade('radius')}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-lg transition"
                >
                  ۹۰ 🪙
                </button>
              </div>

              <div className="p-3 bg-slate-800/70 border border-slate-700 rounded-xl flex justify-between items-center">
                <div>
                  <h4 className="text-xs font-black text-white">💨 سیستم ناوبری پایدار (باد)</h4>
                  <p className="text-[10px] text-slate-400">کاهش ۵۰ درصدی انحراف شلیک در اثر باد</p>
                </div>
                <button
                  onClick={() => handleApplyUpgrade('wind')}
                  disabled={upgradingUnit.upgrades.windResistance}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs font-black rounded-lg transition"
                >
                  {upgradingUnit.upgrades.windResistance ? 'فعال است' : '۱۰۰ 🪙'}
                </button>
              </div>
            </div>

            <button
              onClick={() => setUpgradingUnit(null)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black rounded-xl transition"
            >
              بستن پنجره
            </button>
          </div>
        </div>
      )}

      {/* Online PeerJS Modal */}
      {isOnlineModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-purple-500/60 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-black text-white mb-2 flex items-center gap-2">
              <Globe size={18} className="text-purple-400" /> نبرد آنلاین P2P با WebRTC
            </h3>
            <p className="text-xs text-slate-400 mb-4 font-bold">
              اتصال بدون نیاز به سرور مرکزی با بالاترین سرعت و پینگ صفر:
            </p>

            <div className="bg-purple-950/40 border border-purple-800/80 p-3 rounded-xl mb-3">
              <span className="text-xs font-black text-purple-300 block mb-2">
                میزبان بازی (بازیکن ۱ 🔵):
              </span>
              <button
                onClick={createOnlineRoom}
                className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-black rounded-lg transition"
              >
                ساخت اتاق نبرد 🎲
              </button>
              {roomCode && (
                <div className="mt-2 text-center text-sm font-black text-purple-300 bg-purple-900/60 p-2 rounded-lg border border-purple-700 user-select-all">
                  کد اتاق شما: {roomCode}
                </div>
              )}
            </div>

            <div className="bg-slate-800/60 border border-slate-700 p-3 rounded-xl mb-3">
              <span className="text-xs font-black text-slate-300 block mb-2">
                پیوستن به دوست (بازیکن ۲ 🔴):
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="کد اتاق دوستتان..."
                  value={inputJoinCode}
                  onChange={(e) => setInputJoinCode(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white outline-none"
                />
                <button
                  onClick={joinOnlineRoom}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-lg transition"
                >
                  ورود 🔗
                </button>
              </div>
            </div>

            {peerStatus && (
              <div className="text-xs text-amber-400 text-center font-bold mb-3">{peerStatus}</div>
            )}

            <button
              onClick={() => setIsOnlineModalOpen(false)}
              className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-black rounded-xl transition"
            >
              انصراف و بستن
            </button>
          </div>
        </div>
      )}

      {/* Instructions / Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full shadow-2xl max-h-[85vh] overflow-y-auto">
            <h3 className="text-base font-black text-white mb-3">
              📖 راهنمای نبرد استراتژیک و قوانین تاکتیکی
            </h3>

            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              <div className="p-2.5 bg-slate-800/60 border border-slate-700 rounded-xl">
                <h4 className="font-black text-cyan-400 mb-1">🎯 ماتریس هدف‌گیری رزمی:</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                  <li>
                    <strong>سرباز:</strong> تفنگ ضدهوایی پیاده‌نظام؛ توانایی شلیک به همه اهداف
                    (زمینی، دریایی، هوایی).
                  </li>
                  <li>
                    <strong>تانک:</strong> شلیک به همه اهداف به جز هواپیما (تانک زاویه شلیک عمودی
                    ندارد).
                  </li>
                  <li>
                    <strong>هواپیما:</strong> بمباران تانک، قایق، سنگر و کارخانه (پیاده‌نظام پراکنده
                    از بمباران مصون است).
                  </li>
                  <li>
                    <strong>قایق جنگی:</strong> شلیک به ادوات دریایی، ساحلی، تانک و سرباز (به
                    هواپیما نمی‌زند).
                  </li>
                </ul>
              </div>

              <div className="p-2.5 bg-slate-800/60 border border-slate-700 rounded-xl">
                <h4 className="font-black text-amber-400 mb-1">🏰 سنگر بتنی و کارخانه:</h4>
                <ul className="list-disc list-inside space-y-1 text-slate-300 text-[11px]">
                  <li>
                    <strong>سنگر بتنی (۸۰🪙، ۴ جان):</strong> دارای هاله محافظتی؛ هر نیروی خودی درون
                    هاله را محافظت کرده و آسیب گلوله را تا قبل از انهدام کامل سنگر به خود جذب
                    می‌کند.
                  </li>
                  <li>
                    <strong>کارخانه (۳۵۰🪙، ۳ جان):</strong> در شروع هر نوبت ۵۰ سکه درآمد پایدار
                    تولید می‌کند.
                  </li>
                  <li>
                    <strong>غنیمت نبرد:</strong> انهدام هر هدف ۱/۳ قیمت خرید اولیه آن را برمی‌گرداند.
                  </li>
                </ul>
              </div>

              <div className="p-2.5 bg-slate-800/60 border border-slate-700 rounded-xl">
                <h4 className="font-black text-purple-400 mb-1">⏳ استراحت شلیک و نیروهای کمکی:</h4>
                <p className="text-[11px]">
                  هر واحد پس از شلیک ۱ نوبت استراحت می‌کند. شما می‌توانید در هر نوبت نبرد از فروشگاه
                  نیروی کمکی جدید خریده و مستقر نمایید.
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsHelpOpen(false)}
              className="w-full mt-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl transition"
            >
              متوجه شدم، آماده نبردم!
            </button>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 text-white border border-slate-700 px-5 py-2.5 rounded-full text-xs font-black shadow-2xl flex items-center gap-2 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span>{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
}
