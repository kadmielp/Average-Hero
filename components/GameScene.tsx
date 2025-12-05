

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Environment, Grid, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { GameStatus, NoteData, HandPositions, COLORS, CutDirection, GameMode } from '../types';
import { PLAYER_Z, SPAWN_Z, MISS_Z, NOTE_SPEED, LANE_X_POSITIONS, LAYER_Y_POSITIONS } from '../constants';
import Note from './Note';
import Saber from './Saber';

// Force Rebuild Comment

// --- STAR TUNNEL COMPONENT ---
// Creates a "Warp Speed" effect with particles flying towards camera
const StarTunnel = ({ speed }: { speed: number }) => {
  const count = 400;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  // Generate random initial positions
  const particles = useMemo(() => {
    const temp = [];
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 30;
      const y = (Math.random() - 0.5) * 30;
      // Distribute along the track length
      const z = (Math.random() - 0.5) * 100 - 20;
      temp.push({ x, y, z });
    }
    return temp;
  }, []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // If speed is 0 (game paused), slight drift
    const currentSpeed = speed > 0 ? speed : 0.5;

    particles.forEach((particle, i) => {
      // Move particle towards camera (+Z)
      particle.z += currentSpeed * delta;

      // If particle passes camera (Z > 5), reset to back (Z = -80)
      if (particle.z > 5) {
        particle.z = -80;
        particle.x = (Math.random() - 0.5) * 30;
        particle.y = (Math.random() - 0.5) * 30;
      }

      dummy.position.set(particle.x, particle.y, particle.z);

      // Stretch effect based on speed to look like light streaks
      const stretch = Math.max(1, currentSpeed * 0.3);
      dummy.scale.set(1, 1, stretch);

      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[0.05, 0.05, 0.4]} />
      <meshBasicMaterial color="#ffffff" transparent opacity={0.4} />
    </instancedMesh>
  );
};

interface GameSceneProps {
  gameStatus: GameStatus;
  gameMode: GameMode;
  getCurrentTime: () => number;
  handPositionsRef: React.MutableRefObject<any>; // Simplified type for the raw ref
  chart: NoteData[];
  onNoteHit: (note: NoteData, goodCut: boolean) => void;
  onNoteMiss: (note: NoteData) => void;
  onNoteHold?: (note: NoteData) => void;
  onSongEnd: () => void;
}

const GameScene: React.FC<GameSceneProps> = ({
  gameStatus,
  gameMode,
  getCurrentTime,
  handPositionsRef,
  chart,
  onNoteHit,
  onNoteMiss,
  onNoteHold,
  onSongEnd
}) => {
  // Local state to hold the full chart. We won't use this for the animation loop directly.
  const [notesState, setNotesState] = useState<NoteData[]>([]);

  // We use a counter to trigger re-renders only when new notes need to be mounted.
  // This avoids re-rendering the entire scene 60 times a second.
  const [visibleNoteCount, setVisibleNoteCount] = useState(0);

  // Initialize notes state when chart changes (e.g. new game)
  useEffect(() => {
    if (chart.length > 0) {
      // Deep copy to ensure we don't mutate the prop directly across restarts if not handled in parent
      setNotesState(JSON.parse(JSON.stringify(chart)));
      activeNotesRef.current = [];
      nextNoteIndexRef.current = 0;
      setVisibleNoteCount(0);
    }
  }, [chart]);

  // Refs for things we don't want causing re-renders every frame
  const activeNotesRef = useRef<NoteData[]>([]);
  const nextNoteIndexRef = useRef(0);
  const shakeIntensity = useRef(0);
  const cameraRef = useRef<THREE.PerspectiveCamera>(null);
  const ambientLightRef = useRef<THREE.AmbientLight>(null);
  const spotLightRef = useRef<THREE.SpotLight>(null);
  const gridRef = useRef<THREE.Group>(null);

  // Helper Vector3s for collision to avoid GC
  const vecA = useMemo(() => new THREE.Vector3(), []);
  const vecB = useMemo(() => new THREE.Vector3(), []);

  // Wrap onNoteHit to add Scene-level effects (Camera shake)
  const handleHit = (note: NoteData, goodCut: boolean, isAutoPlay: boolean = false) => {
    // Only shake if it's a player hit
    if (!isAutoPlay) {
      shakeIntensity.current = goodCut ? 0.3 : 0.15;
    }
    onNoteHit(note, goodCut);
  }

  useFrame((state, delta) => {
    const isPlaying = gameStatus === GameStatus.PLAYING;

    // --- Background Movement ---
    // Animate grid to create forward velocity sensation
    if (gridRef.current) {
      const time = isPlaying ? getCurrentTime() : state.clock.getElapsedTime();
      const speed = isPlaying ? NOTE_SPEED : (gameStatus === GameStatus.PAUSED ? 0 : 2); // Stop when paused, slow drift when idle

      // Modulo 5 matches the sectionSize of the Grid to create a seamless loop
      const zOffset = (time * speed) % 5;
      gridRef.current.position.z = zOffset;
    }

    if (!isPlaying) return;

    const time = getCurrentTime();

    // --- Beat Pulsing ---
    // We assume 140 BPM for visual pulsing if we don't have explicit beat events
    const BPM = 140;
    const BEAT_TIME = 60 / BPM;
    const beatPhase = (time % BEAT_TIME) / BEAT_TIME;
    const pulse = Math.pow(1 - beatPhase, 4);

    if (ambientLightRef.current) {
      ambientLightRef.current.intensity = 0.1 + (pulse * 0.3);
    }
    if (spotLightRef.current) {
      spotLightRef.current.intensity = 0.5 + (pulse * 1.5);
    }

    // --- Camera Shake ---
    if (shakeIntensity.current > 0 && cameraRef.current) {
      const shake = shakeIntensity.current;
      cameraRef.current.position.x = (Math.random() - 0.5) * shake;
      cameraRef.current.position.y = 1.8 + (Math.random() - 0.5) * shake;
      cameraRef.current.position.z = 4 + (Math.random() - 0.5) * shake;

      // Decay shake
      shakeIntensity.current = THREE.MathUtils.lerp(shakeIntensity.current, 0, 10 * delta);
      if (shakeIntensity.current < 0.01) {
        shakeIntensity.current = 0;
        // Reset to exact base position when done shaking
        cameraRef.current.position.set(0, 1.8, 4);
      }
    }

    // 1. Spawn Notes
    // Look ahead by the time it takes for a note to travel from spawn to player
    const spawnAheadTime = Math.abs(SPAWN_Z - PLAYER_Z) / NOTE_SPEED;
    let notesAdded = false;

    while (nextNoteIndexRef.current < notesState.length) {
      const nextNote = notesState[nextNoteIndexRef.current];
      if (nextNote.time - spawnAheadTime <= time) {
        activeNotesRef.current.push(nextNote);
        nextNoteIndexRef.current++;
        notesAdded = true;
      } else {
        break;
      }
    }

    if (notesAdded) {
      // Trigger a render to mount the new notes
      setVisibleNoteCount(nextNoteIndexRef.current);
    }

    // 2. Update & Collide Notes
    const hands = handPositionsRef.current as HandPositions;

    // We iterate backwards to safely remove items
    for (let i = activeNotesRef.current.length - 1; i >= 0; i--) {
      const note = activeNotesRef.current[i];

      if (note.missed) continue;

      // --- ACTIVE LONG NOTE LOGIC (TAIL) ---
      // If the head was already hit, we check if we are still inside the duration
      if (note.hit && note.length > 0) {
        const endTime = note.time + note.length;

        // Check if hold duration is complete
        if (time >= endTime) {
          note.isHolding = false;
          activeNotesRef.current.splice(i, 1); // Remove from active
          // Force update to stop rendering tail
          setVisibleNoteCount(c => c + 0.0001);
          continue;
        }

        // We are inside the hold duration. Check for "Holding" status.
        // Logic: Is the hand close to the lane center at the Player Plane?
        const handPos = note.type === 'left' ? hands.left : hands.right;
        let isNowHolding = false;

        if (handPos) {
          const noteBasePos = vecA.set(
            LANE_X_POSITIONS[note.lineIndex],
            LAYER_Y_POSITIONS[note.lineLayer],
            PLAYER_Z
          );

          // Check XY distance only (Cylinder check for holding)
          const dx = Math.abs(handPos.x - noteBasePos.x);
          const dy = Math.abs(handPos.y - noteBasePos.y);
          const distXY = Math.sqrt(dx * dx + dy * dy);

          // Radius 0.7 for holding (slightly lenient)
          if (distXY < 0.7) {
            isNowHolding = true;
          }
        }

        if (note.isHolding !== isNowHolding) {
          note.isHolding = isNowHolding;
          // Force render for holding state visualization
          setVisibleNoteCount(c => c + 0.0001);
        }

        if (isNowHolding && onNoteHold) {
          onNoteHold(note);
        }

        // Since it's already hit, we skip the standard hit logic
        continue;
      }


      // --- STANDARD HIT LOGIC (HEAD) ---

      // Calculate current Z position relative to audio time
      const timeDiff = note.time - time;
      const currentZ = PLAYER_Z - (timeDiff * NOTE_SPEED);

      // Miss check (passed player) - For Long notes, this is if HEAD passes without hit
      if (currentZ > MISS_Z) {
        note.missed = true;
        onNoteMiss(note);
        activeNotesRef.current.splice(i, 1);
        // Fix: Must force render to unmount the missed note!
        setVisibleNoteCount(c => c + 0.0001);
        continue;
      }

      // --- AUTO-PLAY LOGIC (RIGHT_HAND_ONLY) ---
      if (gameMode === GameMode.RIGHT_HAND_ONLY && note.type === 'left') {
        // Perfect hit window is around Z=PLAYER_Z (0)
        // We trigger it slightly early to ensure it feels responsive visually
        if (!note.hit && currentZ >= PLAYER_Z - 0.1) {
          note.hit = true;
          note.hitTime = time;
          handleHit(note, true, true); // isAutoPlay = true

          if (note.length > 0) {
            note.isHolding = true;
            setVisibleNoteCount(c => c + 0.0001);
          } else {
            activeNotesRef.current.splice(i, 1);
            setVisibleNoteCount(c => c + 0.0001);
          }
          continue; // Skip standard collision check
        }
      }

      // --- AUTO-PLAY LOGIC (LEFT_HAND_ONLY) ---
      if (gameMode === GameMode.LEFT_HAND_ONLY && note.type === 'right') {
        if (!note.hit && currentZ >= PLAYER_Z - 0.1) {
          note.hit = true;
          note.hitTime = time;
          handleHit(note, true, true); // isAutoPlay = true

          if (note.length > 0) {
            note.isHolding = true;
            setVisibleNoteCount(c => c + 0.0001);
          } else {
            activeNotesRef.current.splice(i, 1);
            setVisibleNoteCount(c => c + 0.0001);
          }
          continue;
        }
      }

      // Collision check (only if near player)
      // Broad Z-check first to avoid expensive math
      if (!note.hit && currentZ > PLAYER_Z - 2.5 && currentZ < PLAYER_Z + 1.5) {
        const handPos = note.type === 'left' ? hands.left : hands.right;
        if (handPos) {
          const notePos = vecA.set(
            LANE_X_POSITIONS[note.lineIndex],
            LAYER_Y_POSITIONS[note.lineLayer],
            currentZ
          );

          // Improved Collision Logic: Cylinder Check
          // Webcam depth (Z) is unreliable. We prioritize X/Y accuracy (Lane position)
          // and give a generous Z window for timing.

          const dx = Math.abs(handPos.x - notePos.x);
          const dy = Math.abs(handPos.y - notePos.y);
          const dz = Math.abs(handPos.z - notePos.z);

          // Check planar distance (X/Y) separate from Depth (Z)
          const planarDist = Math.sqrt(dx * dx + dy * dy);

          // Radius 0.6 covers the lane well (width 0.8) without too much overlap
          // Z-Depth 1.2 corresponds to ~100ms timing window at speed 12
          // Radius 0.6 covers the lane well (width 0.8) without too much overlap
          // Z-Depth 1.2 corresponds to ~100ms timing window at speed 12
          if (planarDist < 0.6 && dz < 1.2) {
            // Speed check removed - static hits allowed
            note.hit = true;
            note.hitTime = time;
            handleHit(note, true);

            if (note.length > 0) {
              // Start Holding!
              note.isHolding = true;
              // Don't remove from activeNotes yet!
              // We need it for the tail logic in subsequent frames.
              setVisibleNoteCount(c => c + 0.0001); // Update visuals to hide head
            } else {
              // Single hit, remove
              activeNotesRef.current.splice(i, 1);
              setVisibleNoteCount(c => c + 0.0001); // Update debris
            }
          }
        }
      }
    }
  });

  // Map active notes to components. 
  // We only render notes that have been "spawned" (index < nextNoteIndexRef)
  // and aren't too old.
  const visibleNotes = useMemo(() => {
    const now = getCurrentTime();

    return notesState.slice(0, nextNoteIndexRef.current).filter(n => {
      // NEW: Hide notes if they belong to the unused hand in Single-Hand modes
      // Must be checked FIRST to prevent debris from showing up
      if (gameMode === GameMode.RIGHT_HAND_ONLY && n.type === 'left') return false;
      if (gameMode === GameMode.LEFT_HAND_ONLY && n.type === 'right') return false;

      if (n.missed) return false;

      // Garbage Collection for Old Hits (prevents memory leak)
      if (n.hit && n.length === 0 && n.hitTime) {
        // Keep debris for only 1 second, then unmount
        if (now - n.hitTime > 1.0) return false;
        return true;
      }

      if (n.hit && n.length > 0) {
        // Keep long notes visible while they are in activeNotesRef
        const isActive = activeNotesRef.current.includes(n);
        return isActive;
      }

      // Standard un-hit note
      return true;
    });
  }, [notesState, visibleNoteCount]); // Now depends on visibleNoteCount which updates on Hit/Miss

  // Refs for visual sabers
  const leftHandPosRef = useRef<THREE.Vector3 | null>(null);
  const rightHandPosRef = useRef<THREE.Vector3 | null>(null);
  const leftHandRotRef = useRef<THREE.Quaternion | null>(null);
  const rightHandRotRef = useRef<THREE.Quaternion | null>(null);

  const leftHandVelRef = useRef<THREE.Vector3 | null>(null);
  const rightHandVelRef = useRef<THREE.Vector3 | null>(null);

  useFrame(() => {
    leftHandPosRef.current = handPositionsRef.current.left;
    rightHandPosRef.current = handPositionsRef.current.right;
    leftHandRotRef.current = handPositionsRef.current.leftRotation;
    rightHandRotRef.current = handPositionsRef.current.rightRotation;
    leftHandVelRef.current = handPositionsRef.current.leftVelocity;
    rightHandVelRef.current = handPositionsRef.current.rightVelocity;
  });

  return (
    <>
      <PerspectiveCamera ref={cameraRef} makeDefault position={[0, 1.8, 4]} fov={60} />
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 10, 50]} />

      {/* Pulsing Lights */}
      <ambientLight ref={ambientLightRef} intensity={0.2} />
      <spotLight ref={spotLightRef} position={[0, 10, 5]} angle={0.5} penumbra={1} intensity={1} castShadow />

      <Environment preset="night" />

      {/* Warp Speed Particle Tunnel */}
      <StarTunnel speed={gameStatus === GameStatus.PLAYING ? NOTE_SPEED : (gameStatus === GameStatus.PAUSED ? 0 : 2)} />

      {/* Moving Grid / Floor */}
      <group ref={gridRef}>
        <Grid position={[0, 0, 0]} args={[6, 100]} cellThickness={0.1} cellColor="#333" sectionSize={5} sectionThickness={1.5} sectionColor={COLORS.right} fadeDistance={60} infiniteGrid />
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
          <planeGeometry args={[4, 100]} />
          <meshStandardMaterial color="#111" roughness={0.8} metalness={0.5} />
        </mesh>
      </group>



      {gameMode !== GameMode.RIGHT_HAND_ONLY && (
        <Saber
          type="left"
          positionRef={leftHandPosRef}
          rotationRef={leftHandRotRef}
        />
      )
      }
      {gameMode !== GameMode.LEFT_HAND_ONLY && (
        <Saber
          type="right"
          positionRef={rightHandPosRef}
          rotationRef={rightHandRotRef}
        />
      )}

      {
        visibleNotes.map(note => (
          <Note
            key={note.id}
            data={note}
            // IMPORTANT: Pass state as primitive props so React detects changes
            // even if the 'data' object reference is mutated.
            hit={note.hit}
            isHolding={note.isHolding}
            missed={note.missed}
          />
        ))
      }
    </>
  );
};

export default GameScene;
