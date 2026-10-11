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
  Crosshair,
  Maximize2,
  Compass,
  CheckCircle2,
  Clock,
  Lock,
  Sun,
  Moon,
  Trash2,
  Move,
  X,
  Flame,
  User,
  Edit3,
  Wrench,
  Shield,
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
  UnitType,
  UNIT_SPECS,
  Wind,
  FoldLineMode,
  FoldLineConfig,
  ThemeMode,
  KillcamData,
  PeerMessage,
  MAX_UPGRADE_LEVELS,
} from './types';
import { NotebookBoard } from './components/NotebookBoard';
import { sounds } from './audio';
import { generateAISquad, computeAIShot } from './aiBot';
import { PeerGameSession } from './peerManager';

export default function App() {
  // Theme Mode (Day / Night)
  const [theme, setTheme] = useState<ThemeMode>('night');

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

  // Player Names (Customizable before battle start)
  const [p1Name, setP1Name] = useState<string>('فرمانده ۱');
  const [p2Name, setP2Name] = useState<string>('فرمانده ۲');

  // Deployment Unit Selection & Modification (Move / Delete)
  const [selectedUnitToModify, setSelectedUnitToModify] = useState<Unit | null>(null);

  // Ready States for Deployment
  const [p1Ready, setP1Ready] = useState<boolean>(false);
  const [p2Ready, setP2Ready] = useState<boolean>(false);

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

  // Host Only Check for Online Mode
  const isOnlineClient = mode === 'online' && myPlayerId === 2;

  // Sync Host Settings with Online Client
  const sendSettingsSync = useCallback(
    (overrides?: Partial<any>) => {
      if (mode === 'online' && myPlayerId === 1 && peerSessionRef.current) {
        peerSessionRef.current.send({
          type: 'SETTINGS_SYNC',
          payload: {
            boardWidth,
            unitScale,
            terrain,
            startingBudget,
            windActive,
            wind,
            foldConfig,
            p1Name,
            ...overrides,
          },
        });
      }
    },
    [mode, myPlayerId, boardWidth, unitScale, terrain, startingBudget, windActive, wind, foldConfig, p1Name]
  );

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
    const newWind = { active: true, speed, xOffsetPx, yOffsetPx, angle };
    setWind(newWind);
    return newWind;
  }, [windActive]);

  // Turn Progression
  const proceedToNextTurn = useCallback(
    (nextPlayer: PlayerId) => {
      setCurrentPlayer(nextPlayer);
      if (mode === 'local') setMyPlayerId(nextPlayer);

      // Automatically select the first ready shooter
      setTimeout(() => {
        setUnits((currentUnits) => {
          const readyShooter = currentUnits.find(
            (u) =>
              u.player === nextPlayer &&
              !u.isDestroyed &&
              UNIT_SPECS[u.type].canShoot &&
              u.cooldownRemaining <= 1
          );
          if (readyShooter) setSelectedFiringUnitId(readyShooter.id);
          return currentUnits;
        });
      }, 50);

      // 1. Cool down units for next player
      setUnits((prev) =>
        prev.map((u) => {
          if (u.player === nextPlayer && u.cooldownRemaining > 0) {
            return { ...u, cooldownRemaining: u.cooldownRemaining - 1 };
          }
          return u;
        })
      );

      // 2. Factory Income
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

  // SMART WIN CONDITION CHECK
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
        id: `unit-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        type: unitType,
        xRatio,
        yRatio,
        player: currentPlayer,
        hp: spec.baseHp,
        maxHp: spec.baseHp,
        isDestroyed: false,
        angle: (Math.random() - 0.5) * 0.2,
        cooldownRemaining: 0,
        upgrades: { extraHp: 0, inkRadiusBoost: 0, damageBoost: 0, windResistance: false },
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
        setSelectedUnitToBuy(null);

        if (mode === 'online' && peerSessionRef.current) {
          peerSessionRef.current.send({
            type: 'REINFORCE_UNIT',
            payload: { unit: newUnit, remainingCoins: currentCoins - spec.cost, player: currentPlayer },
          });
        }
      }
    },
    [currentPlayer, p1Coins, p2Coins, phase, showToast, mode]
  );

  // Move unit in deployment phase
  const handleMoveUnit = useCallback(
    (unitId: string, newXRatio: number, newYRatio: number) => {
      setUnits((prev) =>
        prev.map((u) => (u.id === unitId ? { ...u, xRatio: newXRatio, yRatio: newYRatio } : u))
      );

      if (mode === 'online' && peerSessionRef.current) {
        const updated = units.map((u) =>
          u.id === unitId ? { ...u, xRatio: newXRatio, yRatio: newYRatio } : u
        );
        peerSessionRef.current.send({
          type: 'READY_STATE',
          payload: {
            player: myPlayerId,
            units: updated.filter((u) => u.player === myPlayerId),
            coins: myPlayerId === 1 ? p1Coins : p2Coins,
          },
        });
      }
    },
    [units, mode, myPlayerId, p1Coins, p2Coins]
  );

  // Delete unit and refund coins in deployment phase
  const handleDeleteUnit = useCallback(
    (unitId: string) => {
      const unit = units.find((u) => u.id === unitId);
      if (!unit) return;
      const spec = UNIT_SPECS[unit.type];

      if (unit.player === 1) setP1Coins((c) => c + spec.cost);
      else setP2Coins((c) => c + spec.cost);

      setUnits((prev) => prev.filter((u) => u.id !== unitId));
      setSelectedUnitToModify(null);
      sounds.playCoinEarn();
      showToast(`واحد ${spec.name} حذف شد و ${spec.cost} 🪙 بازگردانده شد.`, '🗑️');

      if (mode === 'online' && peerSessionRef.current) {
        peerSessionRef.current.send({
          type: 'READY_STATE',
          payload: {
            player: myPlayerId,
            units: units.filter((u) => u.id !== unitId && u.player === myPlayerId),
            coins: (myPlayerId === 1 ? p1Coins : p2Coins) + spec.cost,
          },
        });
      }
    },
    [units, p1Coins, p2Coins, myPlayerId, mode, showToast]
  );

  // Complete deployment & Ready Button click handler
  const handleConfirmReadyDeployment = useCallback(() => {
    const myUnits = units.filter((u) => u.player === myPlayerId);
    if (myUnits.length === 0) {
      showToast('ابتدا حداقل یک واحد رزمی در زمین مستقر کنید!', '⚠️');
      return;
    }

    setSelectedUnitToModify(null);

    if (mode === 'local') {
      if (currentPlayer === 1) {
        setP1Ready(true);
        setCurrentPlayer(2);
        setMyPlayerId(2);
        setSelectedUnitToBuy('tank');
        showToast('چیدمان بازیکن ۱ ثبت شد. نوبت چیدمان بازیکن ۲ 🔴', '🚩');
      } else {
        setP2Ready(true);
        setPhase('battle');
        setSelectedUnitToBuy(null);
        proceedToNextTurn(1);
        showToast('نبرد آتشین آغاز شد! شلیک کنید ⚔️', '🔥');
      }
    } else if (mode === 'ai') {
      setP1Ready(true);
      setP2Ready(true);
      const aiSquad = generateAISquad(terrain, startingBudget);
      setUnits((prev) => [...prev, ...aiSquad]);
      setP2Coins(0);
      setPhase('battle');
      setSelectedUnitToBuy(null);
      proceedToNextTurn(1);
      showToast('نبرد با ارتش هوش مصنوعی آغاز شد! ⚔️', '🤖');
    } else if (mode === 'online') {
      if (myPlayerId === 1) {
        setP1Ready(true);
        showToast('چیدمان شما تأیید شد. در انتظار حریف... ⏳', '⏳');
        peerSessionRef.current?.send({
          type: 'READY_STATE',
          payload: {
            player: 1,
            name: p1Name,
            units: myUnits,
            coins: p1Coins,
          },
        });

        if (p2Ready) {
          setPhase('battle');
          setSelectedUnitToBuy(null);
          proceedToNextTurn(1);
          peerSessionRef.current?.send({
            type: 'DEPLOY_DONE',
            payload: {
              p1Units: myUnits,
              foldMode: foldConfig.currentMode,
            },
          });
          showToast('هر دو بازیکن آماده شدند! نبرد آغاز شد ⚔️', '🔥');
        }
      } else {
        setP2Ready(true);
        showToast('چیدمان شما تأیید شد. در انتظار حریف... ⏳', '⏳');
        peerSessionRef.current?.send({
          type: 'READY_STATE',
          payload: {
            player: 2,
            name: p2Name,
            units: myUnits,
            coins: p2Coins,
          },
        });

        if (p1Ready) {
          setPhase('battle');
          setSelectedUnitToBuy(null);
          proceedToNextTurn(1);
          showToast('هر دو بازیکن آماده شدند! نبرد آغاز شد ⚔️', '🔥');
        }
      }
    }
  }, [
    units,
    myPlayerId,
    mode,
    currentPlayer,
    terrain,
    startingBudget,
    p1Coins,
    p2Coins,
    p1Ready,
    p2Ready,
    foldConfig.currentMode,
    proceedToNextTurn,
    showToast,
  ]);

  // Execute shot
  const handleShoot = useCallback(
    (
      shotData: {
        sourceXR: number;
        sourceYR: number;
        targetXR: number;
        targetYR: number;
        isHit: boolean;
        hitUnitId?: string;
        hitUnitType?: UnitType;
        firingUnitType?: UnitType;
        absorbedByBunkerId?: string;
        unitDestroyed?: boolean;
        bountyEarned: number;
        damageDealt?: number;
        killcam?: KillcamData;
      },
      isRemote: boolean = false
    ) => {
      setIsFoldAnimating(true);
      const shooterPlayer = isRemote ? (currentPlayer === 1 ? 1 : 2) : currentPlayer;
      setFoldingPlayer(shooterPlayer);

      // Dedicated weapon firing sound effect for each unit type
      const firingType: UnitType =
        shotData.firingUnitType ||
        (selectedFiringUnitId ? units.find((u) => u.id === selectedFiringUnitId)?.type : undefined) ||
        'tank';
      sounds.playUnitShot(firingType);
      sounds.playFoldSweep();

      const damage = shotData.damageDealt || 1;

      // Put firing unit on 1-turn Cooldown
      if (selectedFiringUnitId && !isRemote) {
        setUnits((prev) =>
          prev.map((u) => (u.id === selectedFiringUnitId ? { ...u, cooldownRemaining: 1 } : u))
        );
      }

      setTimeout(() => {
        setIsFoldAnimating(false);

        // Process Damage & Bounty
        if (shotData.absorbedByBunkerId) {
          sounds.playShieldAbsorb();
          setUnits((prev) =>
            prev.map((u) => {
              if (u.id === shotData.absorbedByBunkerId) {
                const nextHp = u.hp - damage;
                return { ...u, hp: Math.max(0, nextHp), isDestroyed: nextHp <= 0 };
              }
              return u;
            })
          );

          if (shotData.unitDestroyed) {
            if (shooterPlayer === 1) setP1Coins((c) => c + shotData.bountyEarned);
            else setP2Coins((c) => c + shotData.bountyEarned);
            sounds.playCinematicBoom();
            if (shotData.killcam) setKillcam(shotData.killcam);
            showToast(`💥 سنگر بتنی با قدرت ${damage} منهدم شد! (+${shotData.bountyEarned}🪙)`, '🔥');
          } else {
            showToast(`🛡️ سنگر بتنی آسیب ${damage} را مهار کرد!`, '🏰');
          }
        } else if (shotData.hitUnitId) {
          sounds.playHitExplosion();
          setUnits((prev) =>
            prev.map((u) => {
              if (u.id === shotData.hitUnitId) {
                const nextHp = u.hp - damage;
                return { ...u, hp: Math.max(0, nextHp), isDestroyed: nextHp <= 0 };
              }
              return u;
            })
          );

          if (shotData.unitDestroyed) {
            if (shooterPlayer === 1) setP1Coins((c) => c + shotData.bountyEarned);
            else setP2Coins((c) => c + shotData.bountyEarned);
            sounds.playCinematicBoom();
            if (shotData.killcam) setKillcam(shotData.killcam);
            showToast(`💥 انهدام واحد دشمن با شلیک ویرانگر (+${shotData.bountyEarned}🪙)`, '🔥');
          } else {
            showToast(`🎯 اصابت مستقیم! (-${damage} جان)`, '💥');
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
          player: shooterPlayer,
          firingUnitType: firingType,
          firingUnitId: selectedFiringUnitId || '',
          inkRadius: 10,
          damageDealt: damage,
          isHit: shotData.isHit,
          hitUnitId: shotData.hitUnitId,
          hitUnitType: shotData.hitUnitType,
          absorbedByBunkerId: shotData.absorbedByBunkerId,
          unitDestroyed: shotData.unitDestroyed,
          bountyEarned: shotData.bountyEarned,
          timestamp: Date.now(),
        };

        setShots((prev) => [...prev, newShot]);

        // Online sync: ONLY send if triggered LOCALLY
        if (!isRemote && mode === 'online' && peerSessionRef.current) {
          peerSessionRef.current.send({
            type: 'SHOOT',
            payload: {
              ...shotData,
              firingUnitType: firingType,
            },
          });
        }

        // Check Smart Win Condition & Proceed turn
        setTimeout(() => {
          setUnits((currUnits) => {
            checkSmartWinCondition(currUnits, p1Coins, p2Coins);
            return currUnits;
          });

          if (!winner) {
            const nextP = shooterPlayer === 1 ? 2 : 1;
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

        const reflected = {
          rx: (1 - aiShot.xRatio) * targetDimensions.width,
          ry: aiShot.yRatio * targetDimensions.height,
        };
        const targetXR = reflected.rx / targetDimensions.width;
        const targetYR = reflected.ry / targetDimensions.height;

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

        const dmg = 1 + (aiShot.firingUnit.upgrades?.damageBoost || 0);

        handleShoot(
          {
            sourceXR: aiShot.xRatio,
            sourceYR: aiShot.yRatio,
            targetXR,
            targetYR,
            firingUnitType: aiShot.firingUnit.type,
            isHit: !!hit,
            hitUnitId: hit?.id,
            hitUnitType: hit?.type,
            damageDealt: dmg,
            unitDestroyed: hit ? hit.hp - dmg <= 0 : false,
            bountyEarned: hit && hit.hp - dmg <= 0 ? UNIT_SPECS[hit.type].bounty : 0,
          },
          false
        );
      } else {
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
    setP1Ready(false);
    setP2Ready(false);
    setP1Coins(startingBudget);
    setP2Coins(startingBudget);
    setUnits([]);
    setShots([]);
    setSelectedFiringUnitId(null);
    setSelectedUnitToModify(null);
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
        setPeerStatus('✅ حریف متصل شد! شما میزبان بازی هستید و تنظیمات را تعیین می‌کنید.');
        setTimeout(() => setIsOnlineModalOpen(false), 1200);
        resetGame();
        setMyPlayerId(1);
        sendSettingsSync();
      },
      (msg: PeerMessage) => {
        if (msg.type === 'READY_STATE') {
          setP2Ready(true);
          setP2Coins(msg.payload.coins);
          if (msg.payload.name) setP2Name(msg.payload.name);
          setUnits((prev) => [...prev.filter((u) => u.player === 1), ...msg.payload.units]);
          showToast(`حریف (${msg.payload.name || 'بازیکن ۲'}) چیدمان خود را تأیید کرد! 🚩`, '⚡');
        } else if (msg.type === 'NAME_UPDATE') {
          if (msg.payload.player === 2 && msg.payload.name) {
            setP2Name(msg.payload.name);
            showToast(`نام حریف: ${msg.payload.name} ✍️`, '👤');
          }
        } else if (msg.type === 'DEPLOY_DONE') {
          setPhase('battle');
          setCurrentPlayer(1);
          setSelectedUnitToBuy(null);
          showToast('نبرد آنلاین آغاز گردید! نوبت بازیکن ۱ است ⚔️', '🔥');
        } else if (msg.type === 'SHOOT') {
          handleShoot(msg.payload, true);
        } else if (msg.type === 'REINFORCE_UNIT') {
          setUnits((prev) => [...prev, msg.payload.unit]);
          if (msg.payload.player === 2) setP2Coins(msg.payload.remainingCoins);
          else setP1Coins(msg.payload.remainingCoins);
          sounds.playTankPlace();
        } else if (msg.type === 'UPGRADE_UNIT') {
          setUnits((prev) =>
            prev.map((u) => (u.id === msg.payload.unitId ? msg.payload.unit : u))
          );
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
        setPeerStatus('✅ اتصال به اتاق با موفقیت انجام شد!');
        setTimeout(() => setIsOnlineModalOpen(false), 1000);
        resetGame();
        setMyPlayerId(2);
        peerSessionRef.current?.send({
          type: 'NAME_UPDATE',
          payload: { player: 2, name: p2Name },
        });
      },
      (msg: PeerMessage) => {
        if (msg.type === 'SETTINGS_SYNC') {
          const p = msg.payload;
          if (p.p1Name) setP1Name(p.p1Name);
          if (p.boardWidth !== undefined) setBoardWidth(p.boardWidth);
          if (p.unitScale !== undefined) setUnitScale(p.unitScale);
          if (p.terrain !== undefined) setTerrain(p.terrain);
          if (p.startingBudget !== undefined) {
            setStartingBudget(p.startingBudget);
            setP1Coins(p.startingBudget);
            setP2Coins(p.startingBudget);
          }
          if (p.windActive !== undefined) setWindActive(p.windActive);
          if (p.wind !== undefined) setWind(p.wind);
          if (p.foldConfig !== undefined) setFoldConfig(p.foldConfig);
        } else if (msg.type === 'READY_STATE') {
          setP1Ready(true);
          setP1Coins(msg.payload.coins);
          if (msg.payload.name) setP1Name(msg.payload.name);
          setUnits((prev) => [...prev.filter((u) => u.player === 2), ...msg.payload.units]);
          showToast(`حریف (${msg.payload.name || 'بازیکن ۱'}) چیدمان خود را تأیید کرد! 🚩`, '⚡');
        } else if (msg.type === 'NAME_UPDATE') {
          if (msg.payload.player === 1 && msg.payload.name) {
            setP1Name(msg.payload.name);
            showToast(`نام میزبان: ${msg.payload.name} ✍️`, '👤');
          }
        } else if (msg.type === 'DEPLOY_DONE') {
          setPhase('battle');
          setCurrentPlayer(1);
          setSelectedUnitToBuy(null);
          showToast('نبرد آنلاین آغاز گردید! نوبت بازیکن ۱ است ⚔️', '🔥');
        } else if (msg.type === 'SHOOT') {
          handleShoot(msg.payload, true);
        } else if (msg.type === 'REINFORCE_UNIT') {
          setUnits((prev) => [...prev, msg.payload.unit]);
          if (msg.payload.player === 1) setP1Coins(msg.payload.remainingCoins);
          else setP2Coins(msg.payload.remainingCoins);
          sounds.playTankPlace();
        } else if (msg.type === 'UPGRADE_UNIT') {
          setUnits((prev) =>
            prev.map((u) => (u.id === msg.payload.unitId ? msg.payload.unit : u))
          );
        }
      },
      (st: string) => setPeerStatus(st)
    );
  };

  // Upgrades with strict per-item limits
  const handleApplyUpgrade = (type: 'hp' | 'radius' | 'wind' | 'damage') => {
    if (!upgradingUnit) return;

    const currentDamage = upgradingUnit.upgrades?.damageBoost || 0;
    const currentHpBonus = upgradingUnit.upgrades?.extraHp || 0;
    const currentRadius = upgradingUnit.upgrades?.inkRadiusBoost || 0;
    const hasWind = !!upgradingUnit.upgrades?.windResistance;

    // Enforce strict limits
    if (type === 'damage' && currentDamage >= MAX_UPGRADE_LEVELS.damage) {
      showToast(`قدرت تخریب به حداکثر سقف مجاز (${MAX_UPGRADE_LEVELS.damage} بار) رسیده است! 🔒`, '⚠️');
      return;
    }
    if (type === 'hp' && currentHpBonus >= MAX_UPGRADE_LEVELS.hp) {
      showToast(`زره تقویتی جان به حداکثر سقف مجاز (${MAX_UPGRADE_LEVELS.hp} بار) رسیده است! 🔒`, '⚠️');
      return;
    }
    if (type === 'radius' && currentRadius >= MAX_UPGRADE_LEVELS.radius) {
      showToast(`شعاع ترکش به حداکثر سقف مجاز (${MAX_UPGRADE_LEVELS.radius} بار) رسیده است! 🔒`, '⚠️');
      return;
    }
    if (type === 'wind' && hasWind) {
      showToast(`سیستم ناوبری ضد باد قبلاً فعال گردیده است (حداکثر ۱ بار)! 🔒`, '⚠️');
      return;
    }

    const cost = type === 'hp' ? 120 : type === 'radius' ? 90 : type === 'damage' ? 110 : 100;
    const currentCoins = upgradingUnit.player === 1 ? p1Coins : p2Coins;

    if (currentCoins < cost) {
      showToast('سکه کافی برای خرید این ارتقا ندارید!', '💰');
      return;
    }

    if (upgradingUnit.player === 1) setP1Coins((c) => c - cost);
    else setP2Coins((c) => c - cost);

    let updatedUnit: Unit | null = null;
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id === upgradingUnit.id) {
          let updated = { ...u };
          if (type === 'hp') {
            const nextHpBonus = (u.upgrades?.extraHp || 0) + 1;
            updated = {
              ...u,
              hp: u.hp + 1,
              maxHp: u.maxHp + 1,
              upgrades: { ...u.upgrades, extraHp: nextHpBonus },
            };
          }
          if (type === 'radius') {
            const nextRadius = (u.upgrades?.inkRadiusBoost || 0) + 1;
            updated = {
              ...u,
              upgrades: { ...u.upgrades, inkRadiusBoost: nextRadius },
            };
          }
          if (type === 'damage') {
            const nextDamage = (u.upgrades?.damageBoost || 0) + 1;
            updated = {
              ...u,
              upgrades: { ...u.upgrades, damageBoost: nextDamage },
            };
          }
          if (type === 'wind') {
            updated = { ...u, upgrades: { ...u.upgrades, windResistance: true } };
          }
          updatedUnit = updated;
          return updated;
        }
        return u;
      })
    );

    if (mode === 'online' && peerSessionRef.current && updatedUnit) {
      peerSessionRef.current.send({
        type: 'UPGRADE_UNIT',
        payload: { unitId: upgradingUnit.id, unit: updatedUnit },
      });
    }

    if (updatedUnit) {
      setUpgradingUnit(updatedUnit);
    }

    sounds.playVictory();
    const itemLabel =
      type === 'damage'
        ? `قدرت تخریب (سطح ${currentDamage + 1} از ${MAX_UPGRADE_LEVELS.damage})`
        : type === 'hp'
        ? `زره تقویتی جان (سطح ${currentHpBonus + 1} از ${MAX_UPGRADE_LEVELS.hp})`
        : type === 'radius'
        ? `شعاع ترکش (سطح ${currentRadius + 1} از ${MAX_UPGRADE_LEVELS.radius})`
        : `سیستم ضد باد (فعال شد)`;

    showToast(`ارتقای ${itemLabel} اعمال شد! ⚡`, '🛡️');
  };

  const p1AliveUnits = units.filter((u) => u.player === 1 && !u.isDestroyed);
  const p2AliveUnits = units.filter((u) => u.player === 2 && !u.isDestroyed);
  const p1Factories = p1AliveUnits.filter((u) => u.type === 'factory').length;
  const p2Factories = p2AliveUnits.filter((u) => u.type === 'factory').length;

  const isMyTurn = currentPlayer === myPlayerId;
  const isDay = theme === 'day';
  const isBattle = phase === 'battle';
  const waitingForOpponentReady =
    mode === 'online' &&
    phase === 'deployment' &&
    ((myPlayerId === 1 && p1Ready && !p2Ready) || (myPlayerId === 2 && p2Ready && !p1Ready));

  return (
    <div
      className={`min-h-screen transition-colors duration-300 flex flex-col items-center p-3 select-none font-['Vazirmatn',sans-serif] ${
        isDay ? 'bg-slate-100 text-slate-800' : 'bg-[#060a12] text-slate-100'
      }`}
    >
      {/* Top Header */}
      <header
        className={`w-full max-w-[1220px] backdrop-blur-md rounded-2xl px-5 py-3 mb-2 flex flex-wrap justify-between items-center shadow-lg gap-2 border ${
          isDay
            ? 'bg-white/90 border-slate-200 shadow-slate-200/50'
            : 'bg-slate-900/85 border-slate-800 shadow-slate-950/40'
        }`}
      >
        <div>
          <h1 className="text-lg font-black tracking-tight flex items-center gap-2">
            <span
              className={`font-black text-xl sm:text-2xl tracking-wide transition-all ${
                isDay
                  ? 'text-transparent bg-clip-text bg-gradient-to-r from-sky-900 via-blue-800 to-indigo-900 drop-shadow-sm'
                  : 'text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-300 drop-shadow-[0_2px_12px_rgba(34,211,238,0.35)]'
              }`}
            >
              ⚔️ جنگ های کاغذی HD
            </span>
            <span
              className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                isDay
                  ? 'bg-sky-50 text-sky-700 border-sky-300'
                  : 'bg-cyan-950 text-cyan-400 border-cyan-800/80'
              }`}
            >
              HD Warfare
            </span>
          </h1>
          <p className={`text-xs font-semibold ${isDay ? 'text-slate-600' : 'text-slate-300'}`}>
            میدان نبرد مدرن؛ تقابل استراتژیکی و تجربه‌ها، بازی حرفه‌ای‌ها
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Day / Night Mode Toggle */}
          <button
            onClick={() => setTheme((prev) => (prev === 'night' ? 'day' : 'night'))}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition ${
              isDay
                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300 shadow-sm'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
            }`}
            title="تغییر تم شب / روز"
          >
            {isDay ? <Sun size={15} className="text-amber-600" /> : <Moon size={15} className="text-cyan-400" />}
            <span>{isDay ? 'حالت روز ☀️' : 'حالت شب 🌙'}</span>
          </button>

          <button
            onClick={() => {
              const muted = sounds.toggleMute();
              setIsMuted(muted);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition ${
              isDay
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            {isMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            <span>{isMuted ? 'صدا: خاموش' : 'صدا: روشن'}</span>
          </button>

          <button
            onClick={() => setIsHelpOpen(true)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition ${
              isDay
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <HelpCircle size={15} />
            <span>راهنما</span>
          </button>
        </div>
      </header>

      {/* Control Bar: Mode, Budget, Map, Fold Line */}
      <div className="w-full max-w-[1220px] flex flex-col gap-2 mb-2">
        <div
          className={`backdrop-blur-md rounded-xl px-4 py-2 flex flex-wrap justify-between items-center gap-3 text-xs border ${
            isDay
              ? 'bg-white/80 border-slate-200 shadow-sm'
              : 'bg-slate-900/80 border-slate-800/80'
          }`}
        >
          {/* Mode switch */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setMode('local');
                if (p2Name === 'هوش مصنوعی') setP2Name('فرمانده ۲');
                resetGame();
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                mode === 'local'
                  ? 'bg-blue-600 text-white shadow-md'
                  : isDay
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Users size={14} /> <span>دو نفره (یک سیستم)</span>
            </button>

            <button
              onClick={() => {
                setMode('ai');
                setP2Name('هوش مصنوعی');
                resetGame();
              }}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition ${
                mode === 'ai'
                  ? 'bg-blue-600 text-white shadow-md'
                  : isDay
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
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
                  : isDay
                  ? 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  : 'bg-slate-800/70 text-slate-300 hover:bg-slate-700'
              }`}
            >
              <Globe size={14} /> <span>آنلاین P2P</span>
            </button>
          </div>

          {/* Setup controls */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Host Only Badge in Online */}
            {isOnlineClient && (
              <span className="text-[11px] font-black bg-purple-950 text-purple-300 border border-purple-700 px-2 py-0.5 rounded">
                👑 تنظیمات توسط میزبان
              </span>
            )}

            <div className="flex items-center gap-1.5">
              <span className={isDay ? 'text-slate-600 font-bold' : 'text-slate-400 font-bold'}>
                💰 بودجه:
              </span>
              <select
                value={startingBudget}
                disabled={isBattle || isOnlineClient}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setStartingBudget(val);
                  setP1Coins(val);
                  setP2Coins(val);
                  sendSettingsSync({ startingBudget: val });
                }}
                className={`rounded-lg px-2 py-1 font-bold outline-none cursor-pointer border ${
                  isDay
                    ? 'bg-slate-100 text-slate-800 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value={500}>۵۰۰ 🪙 (تاکتیکی)</option>
                <option value={1000}>۱۰۰۰ 🪙 (استاندارد)</option>
                <option value={2000}>۲۰۰۰ 🪙 (لشکرکشی)</option>
              </select>
            </div>

            <div className="flex items-center gap-1.5">
              <span className={isDay ? 'text-slate-600 font-bold' : 'text-slate-400 font-bold'}>
                🗺️ نقشه:
              </span>
              <select
                value={terrain}
                disabled={isBattle || isOnlineClient}
                onChange={(e) => {
                  const t = e.target.value as TerrainType;
                  setTerrain(t);
                  resetGame();
                  sendSettingsSync({ terrain: t });
                }}
                className={`rounded-lg px-2 py-1 font-bold outline-none cursor-pointer border ${
                  isDay
                    ? 'bg-slate-100 text-slate-800 border-slate-300'
                    : 'bg-slate-800 text-slate-200 border-slate-700'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                <option value="plain">⛰️ زمین ساده تاکتیکی</option>
                <option value="river">🌊 پهنه ساحلی و رودخانه</option>
              </select>
            </div>

            {/* Dynamic Fold Toggle: LOCKED during battle OR for online client */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${
                isDay ? 'bg-slate-100 border-slate-300' : 'bg-slate-800/60 border-slate-700'
              }`}
            >
              <span className={isDay ? 'text-slate-600 font-bold' : 'text-slate-400 font-bold'}>
                📐 خط تا:
              </span>
              <button
                disabled={isBattle || isOnlineClient}
                onClick={() => {
                  setFoldConfig((prev) => {
                    const next = {
                      ...prev,
                      dynamicEnabled: !prev.dynamicEnabled,
                      currentMode: !prev.dynamicEnabled ? prev.currentMode : 'center',
                    };
                    sendSettingsSync({ foldConfig: next });
                    return next;
                  });
                }}
                className={`px-2 py-0.5 rounded text-[11px] font-black transition ${
                  isBattle || isOnlineClient
                    ? 'opacity-50 cursor-not-allowed bg-slate-700 text-slate-400'
                    : foldConfig.dynamicEnabled
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-700 text-slate-300'
                }`}
                title={isBattle ? 'تنظیم خط تا پس از شروع نبرد قفل است' : undefined}
              >
                {foldConfig.dynamicEnabled ? 'پویا (متغیر)' : 'قفل در مرکز'}
              </button>
            </div>

            <button
              onClick={resetGame}
              className={`p-1.5 rounded-lg border transition ${
                isDay
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="شروع مجدد بازی"
            >
              <RotateCcw size={15} />
            </button>
          </div>
        </div>

        {/* Board Width Slider & Wind Status: Host controls in online, locked during battle */}
        <div
          className={`backdrop-blur-md rounded-xl px-4 py-1.5 flex flex-wrap justify-between items-center text-xs gap-3 border ${
            isDay
              ? 'bg-white/70 border-slate-200 text-slate-600 shadow-sm'
              : 'bg-slate-900/60 border-slate-800/60 text-slate-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="font-bold flex items-center gap-1">
              <Maximize2 size={13} /> اسلایدر ابعاد میدان نبرد:
            </span>
            <input
              type="range"
              min="760"
              max="1180"
              step="30"
              disabled={isOnlineClient}
              value={boardWidth}
              onChange={(e) => {
                const bw = Number(e.target.value);
                setBoardWidth(bw);
                sendSettingsSync({ boardWidth: bw });
              }}
              className="w-28 accent-cyan-500 cursor-pointer disabled:opacity-50"
            />
            <span className="text-cyan-500 font-black">
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
                disabled={isOnlineClient}
                value={unitScale}
                onChange={(e) => {
                  const us = Number(e.target.value);
                  setUnitScale(us);
                  sendSettingsSync({ unitScale: us });
                }}
                className="w-16 accent-blue-500 disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* PROMINENT HIGH-VISIBILITY TURN BANNER & STATUS */}
      <div className="w-full max-w-[1220px] mb-2">
        {isBattle ? (
          isMyTurn ? (
            <div
              className={`w-full border-2 rounded-2xl px-5 py-2.5 shadow-lg flex items-center justify-between gap-3 ${
                isDay
                  ? 'bg-emerald-50 border-emerald-500 text-slate-900 shadow-emerald-200/50'
                  : 'bg-gradient-to-r from-cyan-950/90 via-emerald-950/80 to-cyan-950/90 border-emerald-500/80 text-white shadow-[0_0_20px_rgba(16,185,129,0.2)]'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="relative flex h-3.5 w-3.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500"></span>
                </span>
                <h2 className="text-base sm:text-lg font-black flex items-center gap-2">
                  <span>نوبت: {currentPlayer === 1 ? p1Name : p2Name}</span>
                  <span className="text-sm">{currentPlayer === 1 ? '🔵' : '🔴'}</span>
                </h2>
              </div>
              <div
                className={`text-xs font-black px-3.5 py-1 rounded-xl border flex items-center gap-1.5 ${
                  isDay
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                }`}
              >
                <span>نوبت شما</span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              </div>
            </div>
          ) : (
            <div
              className={`w-full border-2 rounded-2xl px-5 py-2.5 shadow-lg flex items-center justify-between gap-3 ${
                isDay
                  ? 'bg-rose-50 border-rose-300 text-slate-900'
                  : 'bg-gradient-to-r from-slate-950 via-rose-950/50 to-slate-950 border-rose-600/60 text-white'
              }`}
            >
              <div className="flex items-center gap-3">
                <Lock className="text-rose-500" size={18} />
                <h2 className="text-base sm:text-lg font-black text-rose-500 flex items-center gap-2">
                  <span>نوبت: {currentPlayer === 1 ? p1Name : p2Name}</span>
                  <span className="text-sm">{currentPlayer === 1 ? '🔵' : '🔴'}</span>
                </h2>
              </div>
              <div
                className={`text-xs font-black px-3.5 py-1 rounded-xl border flex items-center gap-1.5 ${
                  isDay
                    ? 'bg-rose-100 text-rose-800 border-rose-200'
                    : 'bg-rose-950/80 text-rose-300 border-rose-800'
                }`}
              >
                <Clock size={12} />
                <span>در انتظار حریف</span>
              </div>
            </div>
          )
        ) : (
          <div
            className={`w-full rounded-2xl px-5 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs border ${
              isDay
                ? 'bg-white border-sky-200 text-slate-800'
                : 'bg-slate-900/90 border-cyan-800/60 text-slate-200'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-black text-cyan-500">🚩 نوبت چیدمان:</span>
              <span className="text-sm font-black flex items-center gap-1.5">
                <span>{currentPlayer === 1 ? p1Name : p2Name}</span>
                <span>{currentPlayer === 1 ? '🔵' : '🔴'}</span>
              </span>
            </div>

            {waitingForOpponentReady && (
              <span className="bg-amber-950 text-amber-300 border border-amber-800 px-3 py-1 rounded-lg font-black animate-pulse flex items-center gap-1.5">
                <Clock size={13} /> در انتظار حریف...
              </span>
            )}
          </div>
        )}
      </div>

      {/* SELECTED UNIT TO MODIFY (MOVE / DELETE) IN DEPLOYMENT PHASE */}
      {phase === 'deployment' && selectedUnitToModify && (
        <div
          className={`w-full max-w-[1220px] rounded-2xl p-3 mb-2 shadow-lg flex flex-wrap justify-between items-center gap-3 border animate-in zoom-in-95 duration-150 ${
            isDay
              ? 'bg-amber-50 border-amber-300 text-amber-950'
              : 'bg-amber-950/50 border-amber-500/80 text-amber-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <span className="text-2xl">{UNIT_SPECS[selectedUnitToModify.type].icon}</span>
            <div>
              <h4 className="text-xs font-black">
                واحد انتخابی: {UNIT_SPECS[selectedUnitToModify.type].name} (بازیکن {selectedUnitToModify.player})
              </h4>
              <p className="text-[11px] font-medium opacity-85">
                🗑️ دبل‌کلیک روی مهره برای حذف سریع | ✥ کشیدن یا کلیک روی نقطه جدید برای جابجایی
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setUpgradingUnit(selectedUnitToModify)}
              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-md flex items-center gap-1.5 transition"
            >
              <Wrench size={14} />
              <span>ارتقای واحد 🛠️</span>
            </button>

            <button
              onClick={() => handleDeleteUnit(selectedUnitToModify.id)}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black shadow-md flex items-center gap-1.5 transition"
            >
              <Trash2 size={14} />
              <span>حذف نیرو و بازگشت {UNIT_SPECS[selectedUnitToModify.type].cost} 🪙</span>
            </button>

            <button
              onClick={() => setSelectedUnitToModify(null)}
              className={`p-1.5 rounded-xl border transition ${
                isDay
                  ? 'bg-slate-200 hover:bg-slate-300 text-slate-700 border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="انصراف"
            >
              <X size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Status Row */}
      <div className="w-full max-w-[1220px] grid grid-cols-1 md:grid-cols-3 items-center gap-2.5 mb-2">
        {/* P1 Badge */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
            currentPlayer === 1
              ? isDay
                ? 'bg-sky-50 border-sky-400 shadow-md shadow-sky-200/50 scale-[1.01]'
                : 'bg-cyan-950/60 border-cyan-500 shadow-[0_0_15px_rgba(0,210,255,0.25)] scale-[1.01]'
              : isDay
              ? 'bg-white border-slate-200 opacity-80'
              : 'bg-slate-900/60 border-slate-800 opacity-80'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-cyan-500 font-black text-sm">🔵</span>
            {phase === 'deployment' ? (
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border transition ${
                  isDay
                    ? 'bg-white border-sky-300 shadow-sm focus-within:ring-2 focus-within:ring-sky-400'
                    : 'bg-slate-900/90 border-cyan-600/70 shadow-inner focus-within:ring-2 focus-within:ring-cyan-400'
                }`}
                title="نام بازیکن ۱ را قبل از بازی بنویسید"
              >
                <User size={12} className="text-cyan-500 shrink-0" />
                <input
                  type="text"
                  maxLength={18}
                  value={p1Name}
                  disabled={isOnlineClient}
                  onChange={(e) => {
                    const val = e.target.value;
                    setP1Name(val);
                    if (mode === 'online' && myPlayerId === 1) {
                      peerSessionRef.current?.send({
                        type: 'NAME_UPDATE',
                        payload: { player: 1, name: val },
                      });
                    }
                  }}
                  placeholder="نام بازیکن ۱..."
                  className={`bg-transparent text-xs font-black w-24 sm:w-28 outline-none ${
                    isDay ? 'text-sky-950 placeholder:text-sky-400' : 'text-cyan-200 placeholder:text-cyan-600'
                  }`}
                />
                {!isOnlineClient && <Edit3 size={10} className="text-cyan-400 opacity-70 shrink-0" />}
              </div>
            ) : (
              <span className="text-cyan-500 font-black text-sm">{p1Name}</span>
            )}
            {phase === 'deployment' && p1Ready && (
              <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-black flex items-center gap-1">
                <CheckCircle2 size={10} /> آماده
              </span>
            )}
            {p1Factories > 0 && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-black">
                +{p1Factories * 50}🪙/نوبت
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span
              className={`px-2 py-0.5 rounded border ${
                isDay
                  ? 'text-amber-800 bg-amber-100 border-amber-300'
                  : 'text-amber-400 bg-amber-950/60 border border-amber-800'
              }`}
            >
              {p1Coins} 🪙
            </span>
            <span className={isDay ? 'text-slate-500' : 'text-slate-400'}>
              {p1AliveUnits.length} نیرو
            </span>
          </div>
        </div>

        {/* Center Indicator */}
        <div
          className={`rounded-xl px-4 py-2 flex items-center justify-center gap-3 text-xs font-bold shadow-md border ${
            isDay ? 'bg-white border-slate-200 text-slate-700' : 'bg-slate-900/90 border-slate-800 text-slate-300'
          }`}
        >
          <div className="flex items-center gap-1.5 text-purple-500">
            <Compass size={14} />
            <span>
              {foldConfig.currentMode === 'slight_right'
                ? 'مورب راست (+۹°)'
                : foldConfig.currentMode === 'slight_left'
                ? 'مورب چپ (-۹°)'
                : 'وسط عمودی (۰°)'}
            </span>
          </div>

          <div className={`h-3 w-px ${isDay ? 'bg-slate-300' : 'bg-slate-700'}`} />

          <div className="flex items-center gap-2 text-cyan-500">
            <WindIcon size={14} />
            <span>{wind.active ? `${wind.speed} م/ث` : 'بدون باد'}</span>
            {wind.active && (
              <span
                className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-950/70 border border-cyan-500/80 text-rose-400 font-black text-xs transition-transform duration-700 shadow-sm"
                style={{ transform: `rotate(${(wind.angle * 180) / Math.PI}deg)` }}
                title={`جهت وزش باد: ${(wind.angle * 180 / Math.PI).toFixed(0)}°`}
              >
                ➔
              </span>
            )}
          </div>
        </div>

        {/* P2 Badge */}
        <div
          className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
            currentPlayer === 2
              ? isDay
                ? 'bg-rose-50 border-rose-400 shadow-md shadow-rose-200/50 scale-[1.01]'
                : 'bg-rose-950/60 border-rose-500 shadow-[0_0_15px_rgba(255,59,87,0.25)] scale-[1.01]'
              : isDay
              ? 'bg-white border-slate-200 opacity-80'
              : 'bg-slate-900/60 border-slate-800 opacity-80'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-rose-500 font-black text-sm">🔴</span>
            {phase === 'deployment' && mode !== 'ai' ? (
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-lg border transition ${
                  isDay
                    ? 'bg-white border-rose-300 shadow-sm focus-within:ring-2 focus-within:ring-rose-400'
                    : 'bg-slate-900/90 border-rose-600/70 shadow-inner focus-within:ring-2 focus-within:ring-rose-400'
                }`}
                title="نام بازیکن ۲ را قبل از بازی بنویسید"
              >
                <User size={12} className="text-rose-500 shrink-0" />
                <input
                  type="text"
                  maxLength={18}
                  value={p2Name}
                  disabled={mode === 'online' && myPlayerId === 1}
                  onChange={(e) => {
                    const val = e.target.value;
                    setP2Name(val);
                    if (mode === 'online' && myPlayerId === 2) {
                      peerSessionRef.current?.send({
                        type: 'NAME_UPDATE',
                        payload: { player: 2, name: val },
                      });
                    }
                  }}
                  placeholder="نام بازیکن ۲..."
                  className={`bg-transparent text-xs font-black w-24 sm:w-28 outline-none ${
                    isDay ? 'text-rose-950 placeholder:text-rose-400' : 'text-rose-200 placeholder:text-rose-600'
                  }`}
                />
                {!(mode === 'online' && myPlayerId === 1) && (
                  <Edit3 size={10} className="text-rose-400 opacity-70 shrink-0" />
                )}
              </div>
            ) : (
              <span className="text-rose-500 font-black text-sm">{p2Name}</span>
            )}
            {phase === 'deployment' && p2Ready && (
              <span className="text-[10px] bg-emerald-500 text-white px-1.5 py-0.5 rounded font-black flex items-center gap-1">
                <CheckCircle2 size={10} /> آماده
              </span>
            )}
            {p2Factories > 0 && (
              <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded font-black">
                +{p2Factories * 50}🪙/نوبت
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span
              className={`px-2 py-0.5 rounded border ${
                isDay
                  ? 'text-amber-800 bg-amber-100 border-amber-300'
                  : 'text-amber-400 bg-amber-950/60 border border-amber-800'
              }`}
            >
              {p2Coins} 🪙
            </span>
            <span className={isDay ? 'text-slate-500' : 'text-slate-400'}>
              {p2AliveUnits.length} نیرو
            </span>
          </div>
        </div>
      </div>

      {/* Mid-Battle Reinforcements Shop & Deployment Arsenal */}
      <div
        className={`w-full max-w-[1220px] rounded-2xl p-3 mb-2 shadow-xl border ${
          isDay ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
        }`}
      >
        <div className="flex flex-wrap justify-between items-center mb-2 px-1 gap-2">
          <div className="text-xs font-black flex items-center gap-2">
            <span className={isDay ? 'text-slate-900' : 'text-slate-200'}>🛒 انبار تسلیحات و تدارکات</span>
            <span className={`text-[11px] font-bold ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
              {phase === 'deployment'
                ? '(روی نیرو کلیک کرده و در زمین خود مستقر کنید یا با کلیک روی نیروی چیده شده آن را جابجا/حذف کنید)'
                : '(خرید و استقرار نیروی کمکی در نوبت خودتان مجاز است)'}
            </span>
          </div>

          {phase === 'deployment' && (
            <button
              onClick={handleConfirmReadyDeployment}
              disabled={waitingForOpponentReady}
              className={`px-5 py-2 rounded-xl text-xs font-black shadow-lg transition flex items-center gap-2 ${
                waitingForOpponentReady
                  ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-600/30 ring-2 ring-emerald-400'
              }`}
            >
              <CheckCircle2 size={16} />
              <span>
                {waitingForOpponentReady
                  ? 'در انتظار حریف... ⏳'
                  : mode === 'local'
                  ? currentPlayer === 1
                    ? `تأیید چیدمان ${p1Name || 'بازیکن ۱'} 🔵`
                    : `تأیید چیدمان ${p2Name || 'بازیکن ۲'} و شروع نبرد ⚔️`
                  : `تأیید چیدمان (${myPlayerId === 1 ? p1Name : p2Name}) / آماده نبرد ⚔️`}
              </span>
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
            const canInteract = phase === 'deployment' || isMyTurn;

            return (
              <div
                key={type}
                onClick={() => {
                  if (!canInteract) {
                    showToast('در نوبت حریف امکان خرید نیروی کمکی نیست!', '⏳');
                    return;
                  }
                  if (canAfford) {
                    setSelectedUnitToBuy(isSelected ? null : type);
                    setSelectedUnitToModify(null);
                  } else {
                    showToast('سکه کافی برای این نیرو ندارید!', '💰');
                  }
                }}
                className={`p-2.5 rounded-xl border cursor-pointer transition flex flex-col justify-between text-right ${
                  isSelected
                    ? isDay
                      ? 'bg-sky-100 border-sky-500 shadow-md ring-2 ring-sky-400'
                      : 'bg-blue-950/80 border-cyan-400 shadow-md ring-1 ring-cyan-400'
                    : canAfford && canInteract
                    ? isDay
                      ? 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                      : 'bg-slate-800/60 hover:bg-slate-800 border-slate-700'
                    : isDay
                    ? 'bg-slate-100/50 border-slate-200 opacity-50 cursor-not-allowed'
                    : 'bg-slate-900/40 border-slate-800/80 opacity-50 cursor-not-allowed'
                }`}
              >
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-black flex items-center gap-1">
                      <span>{spec.icon}</span> <span>{spec.name}</span>
                    </span>
                    <span
                      className={`text-[11px] font-black px-1.5 py-0.2 rounded border ${
                        isDay
                          ? 'text-amber-800 bg-amber-100 border-amber-300'
                          : 'text-amber-400 bg-amber-950/50 border-amber-800/80'
                      }`}
                    >
                      {spec.cost} 🪙
                    </span>
                  </div>
                  <p className={`text-[10px] line-clamp-2 leading-relaxed ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
                    {spec.description}
                  </p>
                </div>

                <div
                  className={`mt-2 pt-1.5 border-t flex flex-wrap justify-between items-center text-[10px] font-bold gap-1 ${
                    isDay ? 'border-slate-200' : 'border-slate-700/60'
                  }`}
                >
                  <span className="text-emerald-500 font-black">جان: {spec.baseHp}❤️</span>
                  {spec.canShoot ? (
                    <span className="text-rose-400 font-black bg-rose-950/40 border border-rose-800/60 px-1 py-0.2 rounded">
                      قدرت خرابی: {spec.baseDamage}💥
                    </span>
                  ) : spec.type === 'bunker' ? (
                    <span className="text-blue-400 font-bold bg-blue-950/40 px-1 py-0.2 rounded">
                      سنگر دفاعی 🛡️
                    </span>
                  ) : (
                    <span className="text-amber-400 font-bold bg-amber-950/40 px-1 py-0.2 rounded">
                      تولید: +۵۰🪙 🏭
                    </span>
                  )}
                  {isSelected && <span className="text-cyan-400 font-black text-[9px] animate-pulse">آماده استقرار 📍</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Firing Bar (In Battle Phase) */}
      {isBattle && (
        <div
          className={`w-full max-w-[1220px] rounded-2xl px-4 py-2.5 mb-2 flex flex-wrap justify-between items-center gap-3 shadow-lg border ${
            isDay ? 'bg-white border-slate-200' : 'bg-slate-900/90 border-slate-800'
          }`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-black flex items-center gap-1.5 ${isDay ? 'text-slate-700' : 'text-slate-300'}`}>
              <Crosshair size={14} className="text-amber-500" /> واحد شلیک‌کننده:
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
                  const dmgBonus = u.upgrades?.damageBoost || 0;
                  const totalDmg = spec.baseDamage + dmgBonus;
                  const totalUnitUpgrades =
                    (u.upgrades?.damageBoost || 0) +
                    (u.upgrades?.extraHp || 0) +
                    (u.upgrades?.inkRadiusBoost || 0) +
                    (u.upgrades?.windResistance ? 1 : 0);

                  return (
                    <button
                      key={u.id}
                      disabled={!isReady || !isMyTurn}
                      onClick={() => {
                        if (isSelected) {
                          setUpgradingUnit(u);
                        } else {
                          setSelectedFiringUnitId(u.id);
                        }
                      }}
                      onDoubleClick={() => {
                        if (isMyTurn) setUpgradingUnit(u);
                      }}
                      title={
                        isSelected
                          ? `کلیک مجدد برای باز کردن منوی ارتقای واحد ${spec.name} 🛠️ (سقف محدود برای هر آیتم)`
                          : `کلیک برای انتخاب جهت شلیک | کلیک مجدد جهت ارتقای رزمی واحد`
                      }
                      className={`group px-3 py-1.5 rounded-xl text-xs font-black border transition flex items-center gap-1.5 shadow-sm ${
                        isSelected
                          ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md ring-2 ring-amber-300 scale-[1.02]'
                          : isReady && isMyTurn
                          ? isDay
                            ? 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200'
                            : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
                          : 'opacity-50 cursor-not-allowed bg-slate-800/40 text-slate-500 border-slate-700'
                      }`}
                    >
                      <span>{spec.icon}</span>
                      <span>
                        {spec.name} #{i + 1} ({u.hp}❤️ | قدرت: {totalDmg}💥)
                      </span>
                      {totalUnitUpgrades > 0 && (
                        <span
                          className={`text-[10px] px-1 py-0.2 rounded font-black flex items-center gap-0.5 ${
                            isSelected
                              ? 'bg-amber-950 text-amber-200'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                          title={`تعداد ارتقاهای این نیرو: ${totalUnitUpgrades} (محدود به سقف هر آیتم)`}
                        >
                          ⭐{totalUnitUpgrades}
                        </span>
                      )}
                      {!isReady && (
                        <span className="text-[10px] text-amber-500 bg-amber-950 px-1 py-0.2 rounded">
                          ⏳ استراحت
                        </span>
                      )}
                      {isMyTurn && (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFiringUnitId(u.id);
                            setUpgradingUnit(u);
                          }}
                          className={`mr-1 px-1.5 py-0.5 rounded text-[10px] font-black transition cursor-pointer flex items-center gap-0.5 shadow-sm ${
                            isSelected
                              ? 'bg-slate-950 hover:bg-slate-900 text-amber-300 border border-amber-400/40'
                              : 'bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-400 border border-amber-500/30'
                          }`}
                          title="ارتقای این نیرو از این بخش با سقف محدود آیتم‌ها"
                        >
                          <Wrench size={10} />
                          ارتقا 🛠️
                        </span>
                      )}
                    </button>
                  );
                })}
            </div>

            {/* Quick Upgrade Button for Currently Selected Unit */}
            {selectedFiringUnitId && isMyTurn && (() => {
              const activeUnit = units.find((u) => u.id === selectedFiringUnitId);
              if (!activeUnit) return null;
              const totalActiveUpgrades =
                (activeUnit.upgrades?.damageBoost || 0) +
                (activeUnit.upgrades?.extraHp || 0) +
                (activeUnit.upgrades?.inkRadiusBoost || 0) +
                (activeUnit.upgrades?.windResistance ? 1 : 0);
              return (
                <button
                  onClick={() => setUpgradingUnit(activeUnit)}
                  className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 text-xs font-black shadow-md flex items-center gap-1.5 transition"
                  title="باز کردن پنجره ارتقای نیرو با سقف محدود برای هر آیتم"
                >
                  <Wrench size={13} />
                  <span>ارتقای {UNIT_SPECS[activeUnit.type].name} ({totalActiveUpgrades} ارتقا)</span>
                </button>
              );
            })()}
          </div>

          <div
            className={`text-[11px] font-bold px-3 py-1 rounded-lg border ${
              isMyTurn
                ? isDay
                  ? 'text-cyan-700 bg-cyan-50 border-cyan-300'
                  : 'text-cyan-400 bg-cyan-950/60 border-cyan-800/80'
                : isDay
                ? 'text-slate-500 bg-slate-100 border-slate-300'
                : 'text-slate-500 bg-slate-900 border-slate-800'
            }`}
          >
            {isMyTurn
              ? '🎯 روی نیمه زمین خودت کلیک کن تا تیر با زاویه خط تا شلیک بشه!'
              : '🔒 در انتظار شلیک حریف...'}
          </div>
        </div>
      )}

      {/* PROMINENT TOP WIND GAUGE: Direction Compass + Speed */}
      <div
        className={`w-full max-w-[1220px] rounded-2xl px-4 py-2.5 mb-2 shadow-md border flex flex-wrap items-center justify-between text-xs font-bold transition-all ${
          isDay
            ? 'bg-white/95 border-sky-200 text-slate-800 shadow-sm'
            : 'bg-slate-900/90 border-cyan-900/80 text-slate-100 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-cyan-500">
            <WindIcon size={18} className="text-cyan-400" />
            <span className="font-black text-sm">وضعیت باد میدان نبرد:</span>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-xs font-black border ${
              wind.active
                ? isDay
                  ? 'bg-sky-100 text-sky-800 border-sky-300'
                  : 'bg-cyan-950 text-cyan-300 border-cyan-700'
                : isDay
                ? 'bg-slate-100 text-slate-500 border-slate-300'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {wind.active ? `سرعت: ${wind.speed} متر بر ثانیه` : 'آرام (بدون وزش باد)'}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {wind.active ? (
            <div className="flex items-center gap-2">
              <span className={isDay ? 'text-slate-600 font-bold' : 'text-slate-300 font-bold'}>
                جهت‌نما:
              </span>
              <div
                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-rose-500 text-white font-black text-sm shadow-md transition-transform duration-700 ring-2 ring-rose-400/50"
                style={{ transform: `rotate(${(wind.angle * 180) / Math.PI}deg)` }}
                title={`زاویه وزش: ${(wind.angle * 180 / Math.PI).toFixed(0)} درجه`}
              >
                ➔
              </div>
            </div>
          ) : (
            <span className={`text-[11px] ${isDay ? 'text-slate-500' : 'text-slate-400'}`}>
              (بدون انحراف شلیک)
            </span>
          )}

          {/* Wind Button: locked during battle or for online client */}
          <button
            disabled={isBattle || isOnlineClient}
            onClick={() => {
              const nextActive = !windActive;
              setWindActive(nextActive);
              const nw = nextActive
                ? { active: true, speed: 4, xOffsetPx: 8, yOffsetPx: -4, angle: 0 }
                : { active: false, speed: 0, xOffsetPx: 0, yOffsetPx: 0, angle: 0 };
              setWind(nw);
              sendSettingsSync({ windActive: nextActive, wind: nw });
            }}
            className={`px-3 py-1 rounded-xl text-xs font-black border transition ${
              isBattle || isOnlineClient
                ? 'opacity-50 cursor-not-allowed bg-slate-800 border-slate-700 text-slate-500'
                : windActive
                ? 'bg-sky-600 hover:bg-sky-500 text-white border-sky-400 shadow-sm'
                : isDay
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title={isBattle ? 'تنظیم باد پس از شروع بازی قفل است' : undefined}
          >
            {isBattle ? '🔒 قفل در نبرد' : windActive ? 'خاموش کردن باد' : 'روشن کردن باد'}
          </button>
        </div>
      </div>

      {/* Main Tactical Canvas Board */}
      <div className="w-full flex justify-center mb-2">
        <NotebookBoard
          phase={phase}
          currentPlayer={currentPlayer}
          myPlayerId={mode === 'local' ? currentPlayer : myPlayerId}
          terrain={terrain}
          theme={theme}
          units={units}
          shots={shots}
          unitScale={unitScale}
          selectedUnitToBuy={selectedUnitToBuy}
          selectedFiringUnitId={selectedFiringUnitId}
          selectedUnitToModifyId={selectedUnitToModify?.id || null}
          wind={wind}
          foldConfig={foldConfig}
          onPlaceUnit={handlePlaceUnit}
          onMoveUnit={handleMoveUnit}
          onDeleteUnit={handleDeleteUnit}
          onSelectUnitToModify={(u) => setSelectedUnitToModify(u)}
          onShoot={handleShoot}
          onSelectUnitForUpgrade={(u) => setUpgradingUnit(u)}
          onSelectFiringUnit={(id) => setSelectedFiringUnitId(id)}
          onShowToast={showToast}
          isFoldAnimating={isFoldAnimating}
          foldingPlayer={foldingPlayer}
          targetDimensions={targetDimensions}
        />
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-2xl shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-black animate-in fade-in slide-in-from-bottom-3 duration-200 border ${
            isDay
              ? 'bg-slate-900 text-white border-cyan-400'
              : 'bg-slate-900/95 text-white border-cyan-500/80'
          }`}
        >
          <span className="text-base">{toast.icon}</span>
          <span>{toast.msg}</span>
        </div>
      )}

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
              توسط {UNIT_SPECS[killcam.attackerType].name} ({killcam.attackerPlayer === 1 ? p1Name : p2Name}) • آسیب: {killcam.damageDealt || 1} • غنیمت: +{killcam.bounty} 🪙
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
              پیروزی مقتدرانه {winner === 1 ? p1Name : p2Name} ({winner === 1 ? '🔵' : '🔴'})!
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

      {/* Upgrades Modal (With STRICT LIMITS PER ITEM) */}
      {upgradingUnit && (() => {
        const spec = UNIT_SPECS[upgradingUnit.type];
        const currentDamage = upgradingUnit.upgrades?.damageBoost || 0;
        const currentHpBonus = upgradingUnit.upgrades?.extraHp || 0;
        const currentRadius = upgradingUnit.upgrades?.inkRadiusBoost || 0;
        const hasWind = !!upgradingUnit.upgrades?.windResistance;
        const playerCoins = upgradingUnit.player === 1 ? p1Coins : p2Coins;
        const totalUnitUpgrades = currentDamage + currentHpBonus + currentRadius + (hasWind ? 1 : 0);

        const isDamageMaxed = currentDamage >= MAX_UPGRADE_LEVELS.damage;
        const isHpMaxed = currentHpBonus >= MAX_UPGRADE_LEVELS.hp;
        const isRadiusMaxed = currentRadius >= MAX_UPGRADE_LEVELS.radius;
        const isWindMaxed = hasWind;

        return (
          <div className="fixed inset-0 bg-black/75 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-amber-500/70 rounded-2xl p-5 max-w-lg w-full shadow-2xl relative text-right">
              {/* Close X Button */}
              <button
                onClick={() => setUpgradingUnit(null)}
                className="absolute top-4 left-4 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                title="بستن پنجره"
              >
                <X size={16} />
              </button>

              {/* Header */}
              <div className="flex items-center gap-3 mb-3 pr-1">
                <span className="text-3xl p-2 rounded-xl bg-amber-950/60 border border-amber-600/50 shadow-inner">
                  {spec.icon}
                </span>
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <span>ارتقای تجهیزات {spec.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-950 border border-cyan-600 text-cyan-300 font-bold">
                      بازیکن {upgradingUnit.player === 1 ? p1Name : p2Name} ({upgradingUnit.player === 1 ? '🔵' : '🔴'})
                    </span>
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-slate-300 mt-1">
                    <span className="text-emerald-400 font-bold">
                      جان فعلی: {upgradingUnit.hp} / {upgradingUnit.maxHp} ❤️
                    </span>
                    {spec.canShoot && (
                      <span className="text-rose-400 font-bold">
                        قدرت تخریب: {spec.baseDamage + currentDamage} 💥
                      </span>
                    )}
                    <span className="text-amber-400 font-black">
                      موجودی شما: {playerCoins} 🪙
                    </span>
                  </div>
                </div>
              </div>

              {/* Limit Notice Box */}
              <div className="bg-amber-950/40 border border-amber-600/50 rounded-xl p-2.5 mb-3 text-[11px] font-bold text-amber-200 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <Shield size={14} className="text-amber-400 shrink-0" />
                  <span>تعداد ارتقای هر آیتم دارای سقف محدود و مشخصی است (حداکثر سقف مجاز برای هر ویژگی):</span>
                </span>
                <span className="bg-amber-900/80 px-2 py-0.5 rounded text-[10px] text-amber-300 font-black shrink-0">
                  {totalUnitUpgrades} از ۷ ارتقا
                </span>
              </div>

              {/* Upgrades Items List */}
              <div className="flex flex-col gap-2.5 mb-4 max-h-[60vh] overflow-y-auto pl-1">
                {/* 1. Damage Upgrade */}
                {spec.canShoot && (
                  <div className={`p-3 rounded-xl border transition flex justify-between items-center ${
                    isDamageMaxed
                      ? 'bg-slate-900/60 border-slate-700/60 opacity-80'
                      : 'bg-slate-800/80 border-amber-600/60 shadow-sm'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-xs font-black text-amber-400 flex items-center gap-1">
                          <Flame size={14} className="text-rose-400" />
                          <span>💥 قدرت تخریب گلوله (+۱ دمیج)</span>
                        </h4>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-black border ${
                          isDamageMaxed
                            ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                            : 'bg-slate-950 border-slate-700 text-slate-300'
                        }`}>
                          {isDamageMaxed
                            ? `●● سقف تکمیل شد (${currentDamage}/${MAX_UPGRADE_LEVELS.damage})`
                            : currentDamage === 1
                            ? `●○ سطح ۱ از ${MAX_UPGRADE_LEVELS.damage}`
                            : `○○ سطح ۰ از ${MAX_UPGRADE_LEVELS.damage}`}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        قدرت تخریب فعلی: <span className="text-white font-bold">{spec.baseDamage + currentDamage}</span> • سقف ارتقا: حداکثر {MAX_UPGRADE_LEVELS.damage} بار
                      </p>
                    </div>

                    <button
                      onClick={() => handleApplyUpgrade('damage')}
                      disabled={isDamageMaxed || playerCoins < 110}
                      className={`px-3 py-1.5 text-xs font-black rounded-lg transition shrink-0 ${
                        isDamageMaxed
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                          : playerCoins < 110
                          ? 'bg-amber-950/60 text-amber-500 border border-amber-800 opacity-60 cursor-not-allowed'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 active:scale-95'
                      }`}
                    >
                      {isDamageMaxed ? 'تکمیل شد (۲/۲) 🔒' : '۱۱۰ 🪙 (ارتقا)'}
                    </button>
                  </div>
                )}

                {/* 2. Extra HP Upgrade */}
                <div className={`p-3 rounded-xl border transition flex justify-between items-center ${
                  isHpMaxed
                    ? 'bg-slate-900/60 border-slate-700/60 opacity-80'
                    : 'bg-slate-800/80 border-blue-500/60 shadow-sm'
                }`}>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-xs font-black text-sky-400 flex items-center gap-1">
                        <Shield size={14} className="text-sky-400" />
                        <span>❤️ زره تقویتی بدنه (+۱ جان)</span>
                      </h4>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded font-black border ${
                        isHpMaxed
                          ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                          : 'bg-slate-950 border-slate-700 text-slate-300'
                      }`}>
                        {isHpMaxed
                          ? `●● سقف تکمیل شد (${currentHpBonus}/${MAX_UPGRADE_LEVELS.hp})`
                          : currentHpBonus === 1
                          ? `●○ سطح ۱ از ${MAX_UPGRADE_LEVELS.hp}`
                          : `○○ سطح ۰ از ${MAX_UPGRADE_LEVELS.hp}`}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400">
                      جان فعلی: <span className="text-white font-bold">{upgradingUnit.hp}/{upgradingUnit.maxHp}</span> • سقف ارتقا: حداکثر {MAX_UPGRADE_LEVELS.hp} بار
                    </p>
                  </div>

                  <button
                    onClick={() => handleApplyUpgrade('hp')}
                    disabled={isHpMaxed || playerCoins < 120}
                    className={`px-3 py-1.5 text-xs font-black rounded-lg transition shrink-0 ${
                      isHpMaxed
                        ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                        : playerCoins < 120
                        ? 'bg-sky-950/60 text-sky-500 border border-sky-800 opacity-60 cursor-not-allowed'
                        : 'bg-sky-500 hover:bg-sky-400 text-slate-950 shadow-md shadow-sky-500/20 active:scale-95'
                    }`}
                  >
                    {isHpMaxed ? 'تکمیل شد (۲/۲) 🔒' : '۱۲۰ 🪙 (ارتقا)'}
                  </button>
                </div>

                {/* 3. Ink Radius Boost */}
                {spec.canShoot && (
                  <div className={`p-3 rounded-xl border transition flex justify-between items-center ${
                    isRadiusMaxed
                      ? 'bg-slate-900/60 border-slate-700/60 opacity-80'
                      : 'bg-slate-800/80 border-purple-500/60 shadow-sm'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-xs font-black text-purple-300 flex items-center gap-1">
                          <Zap size={14} className="text-purple-400" />
                          <span>⚡ شعاع ترکش جوهر (+۲.۵px)</span>
                        </h4>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-black border ${
                          isRadiusMaxed
                            ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                            : 'bg-slate-950 border-slate-700 text-slate-300'
                        }`}>
                          {isRadiusMaxed
                            ? `●● سقف تکمیل شد (${currentRadius}/${MAX_UPGRADE_LEVELS.radius})`
                            : currentRadius === 1
                            ? `●○ سطح ۱ از ${MAX_UPGRADE_LEVELS.radius}`
                            : `○○ سطح ۰ از ${MAX_UPGRADE_LEVELS.radius}`}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        محدوده اصابت گسترده‌تر • سقف ارتقا: حداکثر {MAX_UPGRADE_LEVELS.radius} بار
                      </p>
                    </div>

                    <button
                      onClick={() => handleApplyUpgrade('radius')}
                      disabled={isRadiusMaxed || playerCoins < 90}
                      className={`px-3 py-1.5 text-xs font-black rounded-lg transition shrink-0 ${
                        isRadiusMaxed
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                          : playerCoins < 90
                          ? 'bg-purple-950/60 text-purple-400 border border-purple-800 opacity-60 cursor-not-allowed'
                          : 'bg-purple-500 hover:bg-purple-400 text-slate-950 shadow-md shadow-purple-500/20 active:scale-95'
                      }`}
                    >
                      {isRadiusMaxed ? 'تکمیل شد (۲/۲) 🔒' : '۹۰ 🪙 (ارتقا)'}
                    </button>
                  </div>
                )}

                {/* 4. Wind Resistance */}
                {spec.canShoot && (
                  <div className={`p-3 rounded-xl border transition flex justify-between items-center ${
                    isWindMaxed
                      ? 'bg-slate-900/60 border-slate-700/60 opacity-80'
                      : 'bg-slate-800/80 border-teal-500/60 shadow-sm'
                  }`}>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="text-xs font-black text-teal-300 flex items-center gap-1">
                          <WindIcon size={14} className="text-teal-400" />
                          <span>💨 سیستم ناوبری پایدار در باد</span>
                        </h4>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-black border ${
                          isWindMaxed
                            ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                            : 'bg-slate-950 border-slate-700 text-slate-300'
                        }`}>
                          {isWindMaxed ? '● فعال شد (۱/۱)' : '○ غیرفعال (۰/۱)'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400">
                        کاهش ۵۰ درصدی انحراف باد • سقف ارتقا: حداکثر {MAX_UPGRADE_LEVELS.wind} بار
                      </p>
                    </div>

                    <button
                      onClick={() => handleApplyUpgrade('wind')}
                      disabled={isWindMaxed || playerCoins < 100}
                      className={`px-3 py-1.5 text-xs font-black rounded-lg transition shrink-0 ${
                        isWindMaxed
                          ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                          : playerCoins < 100
                          ? 'bg-teal-950/60 text-teal-400 border border-teal-800 opacity-60 cursor-not-allowed'
                          : 'bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20 active:scale-95'
                      }`}
                    >
                      {isWindMaxed ? 'فعال شد (۱/۱) 🔒' : '۱۰۰ 🪙 (فعال‌سازی)'}
                    </button>
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-800">
                <span className="text-[11px] font-bold text-slate-400">
                  سکه باقیمانده: <span className="text-amber-400 font-black">{playerCoins} 🪙</span>
                </span>
                <button
                  onClick={() => setUpgradingUnit(null)}
                  className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-black rounded-xl transition"
                >
                  بستن پنجره
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Online PeerJS Modal */}
      {isOnlineModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-purple-500/60 rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="text-base font-black text-white mb-2 flex items-center gap-2">
              <Globe size={18} className="text-purple-400" /> نبرد آنلاین P2P با WebRTC
            </h3>
            <p className="text-xs text-slate-400 mb-4 font-bold">
              سازنده اتاق کنترل ابعاد، خط تا، باد و مقیاس را در دست دارد:
            </p>

            <div className="bg-purple-950/40 border border-purple-800/80 p-3 rounded-xl mb-3">
              <span className="text-xs font-black text-purple-300 block mb-2">
                میزبان بازی (کنترل‌کننده زمین و تنظیمات 👑):
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

      {/* Instructions / Comprehensive Help Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div
            className={`border rounded-3xl p-6 max-w-2xl w-full shadow-2xl max-h-[88vh] overflow-y-auto ${
              isDay ? 'bg-white border-slate-200 text-slate-800' : 'bg-slate-900 border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex justify-between items-center mb-4 pb-3 border-b border-slate-700/60">
              <h3 className="text-base font-black flex items-center gap-2">
                <span>📖 راهنمای کامل ادوات، دکمه‌ها و قوانین نبرد</span>
              </h3>
              <button
                onClick={() => setIsHelpOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 text-xs leading-relaxed font-normal">
              {/* SECTION 1: UNIT CARDS */}
              <div>
                <h4 className="font-black text-sm text-cyan-400 mb-2.5 flex items-center gap-1.5">
                  <span>🪖 بخش اول: معرفی تمام ادوات و کارت‌های نبرد</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Soldier */}
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-white flex items-center gap-1.5 text-xs">
                        <span>🪖</span> <span>سرباز تک‌تیرانداز</span>
                      </span>
                      <span className="text-[11px] font-black text-amber-400">۱۰۰ 🪙</span>
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-1 mt-1.5">
                      <p>
                        <strong className="text-emerald-400">جان: ۱ ❤️</strong> |{' '}
                        <strong className="text-rose-400">قدرت: ۱ 💥</strong>
                      </p>
                      <p>• <strong>نقش:</strong> پیاده‌نظام چابک با تفنگ دوربرد.</p>
                      <p>• <strong>هدف‌گیری:</strong> شلیک به تمام اهداف شامل تانک، قایق، سنگر، کارخانه و هواپیما.</p>
                      <p>• <strong>ویژگی خاص:</strong> به دلیل پراکنده بودن در سنگر، از بمباران هوایی جنگنده مصون است!</p>
                    </div>
                  </div>

                  {/* Tank */}
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-white flex items-center gap-1.5 text-xs">
                        <span>🛡️</span> <span>تانک سنگین زره‌پوش</span>
                      </span>
                      <span className="text-[11px] font-black text-amber-400">۲۵۰ 🪙</span>
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-1 mt-1.5">
                      <p>
                        <strong className="text-emerald-400">جان: ۲ ❤️</strong> |{' '}
                        <strong className="text-rose-400">قدرت: ۱ 💥</strong>
                      </p>
                      <p>• <strong>نقش:</strong> ستون فقرات ارتش زمینی و توپخانه تهاجمی سنگین.</p>
                      <p>• <strong>هدف‌گیری:</strong> تانک، سرباز، قایق، سنگر و کارخانه.</p>
                      <p>• <strong>محدودیت:</strong> زاویه لوله تانک به بالا نمی‌رسد و توانایی شلیک به هواپیما را ندارد.</p>
                    </div>
                  </div>

                  {/* Plane */}
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-white flex items-center gap-1.5 text-xs">
                        <span>✈️</span> <span>جنگنده بمب‌افکن هوایی</span>
                      </span>
                      <span className="text-[11px] font-black text-amber-400">۴۰۰ 🪙</span>
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-1 mt-1.5">
                      <p>
                        <strong className="text-emerald-400">جان: ۲ ❤️</strong> |{' '}
                        <strong className="text-rose-400">قدرت: ۱ 💥</strong> | شعاع انفجار وسیع
                      </p>
                      <p>• <strong>نقش:</strong> پرواز بر فراز میدان با بالاترین شعاع ترکش انفجاری.</p>
                      <p>• <strong>هدف‌گیری:</strong> بمباران مهلک تانک، قایق، هواپیما، سنگر و کارخانه.</p>
                      <p>• <strong>محدودیت:</strong> به پیاده‌نظام سرباز صدمه نمی‌زند؛ تانک و قایق نیز به آن دسترسی ندارند.</p>
                    </div>
                  </div>

                  {/* Boat */}
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-white flex items-center gap-1.5 text-xs">
                        <span>🛥️</span> <span>قایق گشتی موشک‌انداز</span>
                      </span>
                      <span className="text-[11px] font-black text-amber-400">۲۰۰ 🪙</span>
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-1 mt-1.5">
                      <p>
                        <strong className="text-emerald-400">جان: ۲ ❤️</strong> |{' '}
                        <strong className="text-rose-400">قدرت: ۱ 💥</strong>
                      </p>
                      <p>• <strong>نقش:</strong> تسلط بر آبراه و حمله به نیروهای ساحلی.</p>
                      <p>• <strong>استقرار:</strong> تنها در پهنه آبی رودخانه مستقر می‌شود.</p>
                      <p>• <strong>هدف‌گیری:</strong> شلیک به قایق، تانک، سرباز و استحکامات ساحلی (ممنوع به هواپیما).</p>
                    </div>
                  </div>

                  {/* Bunker */}
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-white flex items-center gap-1.5 text-xs">
                        <span>🏰</span> <span>سنگر بتنی محافظ</span>
                      </span>
                      <span className="text-[11px] font-black text-amber-400">۸۰ 🪙</span>
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-1 mt-1.5">
                      <p>
                        <strong className="text-emerald-400">جان: ۴ ❤️</strong> |{' '}
                        <strong className="text-slate-400">غیرمسلح / مدافع</strong>
                      </p>
                      <p>• <strong>هاله محافظتی (Aura):</strong> نیروهای خودی هم‌جوار درون شعاع سنگر را پوشش می‌دهد.</p>
                      <p>• <strong>جذب آسیب:</strong> تیرهای حریف که به نیروهای درون هاله برخورد کند، توسط سنگر مهار شده و جان سنگر کسر می‌شود!</p>
                    </div>
                  </div>

                  {/* Factory */}
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDay ? 'bg-slate-50 border-slate-200' : 'bg-slate-800/60 border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-black text-white flex items-center gap-1.5 text-xs">
                        <span>🏭</span> <span>کارخانه تدارکات و تسلیحات</span>
                      </span>
                      <span className="text-[11px] font-black text-amber-400">۳۵۰ 🪙</span>
                    </div>
                    <div className="text-[11px] text-slate-400 space-y-1 mt-1.5">
                      <p>
                        <strong className="text-emerald-400">جان: ۳ ❤️</strong> |{' '}
                        <strong className="text-emerald-400">درآمد: +۵۰🪙 / نوبت</strong>
                      </p>
                      <p>• <strong>موتور اقتصادی:</strong> در آغاز هر نوبت شما، ۵۰ سکه درآمد خالص تولید می‌کند.</p>
                      <p>• <strong>نکته:</strong> غیرمسلح است و دشمن برای قطع درآمد شما به آن حمله خواهد کرد.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: BUTTONS AND CONTROLS */}
              <div>
                <h4 className="font-black text-sm text-cyan-400 mb-2.5 flex items-center gap-1.5">
                  <span>🕹️ بخش دوم: راهنمای تمام دکمه‌ها و کنترل‌های بازی</span>
                </h4>
                <div className="space-y-2">
                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">✍️ ثبت نام بازیکنان قبل از شروع بازی:</strong>
                    <span className="text-slate-400">
                      در فاز چیدمان، بازیکنان می‌توانند با کلیک روی کادرهای نام فرمانده (بازیکن ۱ 🔵 و بازیکن ۲ 🔴)، نام‌های دلخواه خود را بنویسند. این اسامی در تمام طول نبرد، پیام‌های نوبت‌دهی، اعلانات و پیام پیروزی اعمال می‌شوند.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">👥 حالت‌های بازی (دو نفره، هوش مصنوعی، آنلاین P2P):</strong>
                    <span className="text-slate-400">
                      امکان نبرد روی یک دستگاه با دو بازیکن، نبرد با هوش مصنوعی تاکتیکی، یا نبرد آنلاین از راه دور با ساخت اتاق و ارسال کد کوتاه برای دوست.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">💰 بودجه اولیه (۵۰۰ / ۱۰۰۰ / ۲۰۰۰ سکه):</strong>
                    <span className="text-slate-400">
                      تعیین میزان سرمایه شروع برای چینش سریع ارتشی کوچک و چریکی تا لشکرهای سنگین و مجهز.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">🗺️ انتخاب نقشه (زمین ساده تاکتیکی / پهنه ساحلی و رودخانه):</strong>
                    <span className="text-slate-400">
                      زمین ساده تماماً خاکی است. نقشه رودخانه دارای بخش آبی در پایین بوم است که تنها قایق‌های جنگی و پرنده‌ها امکان حضور در آن را دارند.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">📐 کلید خط تا (پویا / قفل در مرکز):</strong>
                    <span className="text-slate-400">
                      در حالت قفل، خط تا عمود در وسط بوم است. در حالت پویا، در هر نوبت زاویه خط تا به صورت تصادفی به مورب راست (+۹°) یا مورب چپ (-۹°) تغییر می‌کند و فرمول بازتاب بر اساس آن محاسبه می‌شود.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">💨 کلید باد و جهت‌نمای عقربه‌ای:</strong>
                    <span className="text-slate-400">
                      روشن/خاموش کردن اثر باد. عقربه چرخان در بالای زمین و کارت وسط زاویه دقیق و سرعت وزش باد را نشان می‌دهد تا بازیکن انحراف گلوله را تخمین بزند.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">☀️ / 🌙 کلید روز و شب (Day / Night Mode):</strong>
                    <span className="text-slate-400">
                      تغییر آنی تم بازی بین حالت تاریک نئونی و حالت روشن تمیز با کنتراست بالا طبق سلیقه کاربر.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">🗑️ حذف نیرو با دبل‌کلیک در فاز چیدمان:</strong>
                    <span className="text-slate-400">
                      قبل از شروع نبرد، با دو بار کلیک سریع (دبل‌کلیک یا دبل‌تپ) روی هر مهره، آن را فوراً حذف کرده و سکه کامل آن را به خزانه بازگردانید.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">✥ جابجایی نیروها در فاز چیدمان:</strong>
                    <span className="text-slate-400">
                      با کشیدن و رها کردن (Drag & Drop) یا یک کلیک برای انتخاب و کلیک در نقطه مقصد، نیروهای خود را در قلمرو خود آزادانه جابجا کنید.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">⚔️ دکمه تأیید چیدمان / آماده نبرد (Ready):</strong>
                    <span className="text-slate-400">
                      ثبت نهایی چینش ارتش. در بازی آنلاین بازی تا زمانی که هر دو بازیکن دکمه آماده را نزنند شروع نخواهد شد.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">🛒 خرید نیروی کمکی در میانه نبرد (Reinforcements):</strong>
                    <span className="text-slate-400">
                      حتی پس از شروع نبرد، در نوبت خودتان می‌توانید با سکه‌های غنیمت یا درآمد کارخانه‌ها، از انبار تسلیحات نیروی تازه بخرید و در زمین مستقر کنید.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">🛠️ پنجره ارتقای ادوات (Upgrades):</strong>
                    <span className="text-slate-400">
                      با کلیک روی نیروی خودی در نبرد می‌توانید: زره تقویتی (+۱ جان)، شعاع ترکش (+۲.۵px)، قدرت تخریب (+۱ دمیج) و سیستم ناوبری باد (۵۰٪ کاهش انحراف) را خریداری کنید.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">⏳ قانون خنک‌شونده (Cooldown):</strong>
                    <span className="text-slate-400">
                      هر واحد پس از شلیک حداقل ۱ نوبت استراحت می‌کند تا امکان شلیک‌های متوالی با یک تانک وجود نداشته باشد و تنوع تاکتیکی حفظ شود.
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-800/50 rounded-xl border border-slate-700">
                    <strong className="text-white block mb-0.5">🏆 شرایط برد هوشمند (Smart Win Condition):</strong>
                    <span className="text-slate-400">
                      بازیکنی برنده اعلام می‌شود که تمام واحدهای رزمی حریف را منهدم کند و حریف سکه کافی (حداقل ۱۰۰ سکه) برای استخدام سرباز جدید نداشته باشد!
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => setIsHelpOpen(false)}
              className="mt-6 w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-xl transition shadow-lg"
            >
              بستن راهنما و بازگشت به نبرد ⚔️
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
