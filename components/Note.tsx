
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useMemo, useRef } from 'react';
import { Extrude, Octahedron } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import * as Tone from 'tone';
import { NoteData, COLORS } from '../types';
import { LANE_X_POSITIONS, LAYER_Y_POSITIONS, NOTE_SIZE, PLAYER_Z, NOTE_SPEED, SPAWN_Z } from '../constants';

interface NoteProps {
  data: NoteData;
  // Pass primitive flags to ensure React.memo detects changes even if 'data' ref is stable
  hit?: boolean;
  missed?: boolean;
  isHolding?: boolean;
}

// --- SPARK SHAPE GENERATOR ---
// Creates the iconic 4-pointed star shape with concave edges
const createSparkShape = (size: number) => {
  const shape = new THREE.Shape();
  const s = size / 1.8; // Scale helper

  // Start Top
  shape.moveTo(0, s);
  // Curve to Right
  shape.quadraticCurveTo(0, 0, s, 0);
  // Curve to Bottom
  shape.quadraticCurveTo(0, 0, 0, -s);
  // Curve to Left
  shape.quadraticCurveTo(0, 0, -s, 0);
  // Curve to Top
  shape.quadraticCurveTo(0, 0, 0, s);
  
  return shape;
};

const SPARK_SHAPE = createSparkShape(NOTE_SIZE);
const EXTRUDE_SETTINGS = { depth: NOTE_SIZE * 0.4, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 3 };

// Independent Shard Component to avoid re-definition inside render loop
const Shard = ({ offsetDir, moveDir, scale = 1, color, hitTime, rotationSpeed }: { 
    offsetDir: number[], 
    moveDir: number[], 
    scale?: number, 
    color: string, 
    hitTime?: number,
    rotationSpeed: number
}) => {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame(() => {
         if (meshRef.current && hitTime) {
             const timeSinceHit = Tone.Transport.seconds - hitTime;
             const dist = 6.0 * timeSinceHit;

             meshRef.current.position.x = offsetDir[0] + moveDir[0] * dist;
             meshRef.current.position.y = offsetDir[1] + moveDir[1] * dist;
             meshRef.current.position.z = offsetDir[2] + moveDir[2] * dist;

             meshRef.current.rotation.x += moveDir[1] * 0.1 * rotationSpeed;
             meshRef.current.rotation.y += moveDir[0] * 0.1 * rotationSpeed;
         }
    });

    return (
        <Octahedron ref={meshRef} args={[NOTE_SIZE * 0.3 * scale]} position={[offsetDir[0], offsetDir[1], offsetDir[2]]}>
             <meshStandardMaterial color={color} roughness={0.1} metalness={0.9} emissive={color} emissiveIntensity={0.5} />
        </Octahedron>
    )
}

const Debris: React.FC<{ data: NoteData, color: string }> = ({ data, color }) => {
    const groupRef = useRef<THREE.Group>(null);
    const flashRef = useRef<THREE.Mesh>(null);
    const rotationSpeed = 10.0;

    useFrame(() => {
        if (!data.hitTime) return;
        
        const currentTime = Tone.Transport.seconds;
        const timeSinceHit = currentTime - data.hitTime;

        if (groupRef.current) {
             groupRef.current.scale.setScalar(Math.max(0.01, 1 - timeSinceHit * 1.5));
        }
        
        if (flashRef.current) {
            const flashDuration = 0.15;
            if (timeSinceHit < flashDuration) {
                const t = timeSinceHit / flashDuration;
                flashRef.current.visible = true;
                flashRef.current.scale.setScalar(1 + t * 4);
                (flashRef.current.material as THREE.MeshBasicMaterial).opacity = 1 - t;
            } else {
                flashRef.current.visible = false;
            }
        }
    });
    
    return (
        <group ref={groupRef}>
            {/* Hit Flash */}
            <mesh ref={flashRef}>
                <sphereGeometry args={[NOTE_SIZE * 1.2, 16, 16]} />
                <meshBasicMaterial color="white" transparent toneMapped={false} />
            </mesh>

            {/* Shattered Pieces */}
            <Shard offsetDir={[0, 0.2, 0]} moveDir={[0, 1.5, -0.5]} scale={0.8} color={color} hitTime={data.hitTime} rotationSpeed={rotationSpeed} />
            <Shard offsetDir={[0.2, 0, 0]} moveDir={[1.5, 0, -0.5]} scale={0.8} color={color} hitTime={data.hitTime} rotationSpeed={rotationSpeed} />
            <Shard offsetDir={[0, -0.2, 0]} moveDir={[0, -1.5, -0.5]} scale={0.8} color={color} hitTime={data.hitTime} rotationSpeed={rotationSpeed} />
            <Shard offsetDir={[-0.2, 0, 0]} moveDir={[-1.5, 0, -0.5]} scale={0.8} color={color} hitTime={data.hitTime} rotationSpeed={rotationSpeed} />
            
            <Shard offsetDir={[0.1, 0.1, 0.1]} moveDir={[1, 1, 1]} scale={0.5} color={color} hitTime={data.hitTime} rotationSpeed={rotationSpeed} />
            <Shard offsetDir={[-0.1, -0.1, -0.1]} moveDir={[-1, -1, 1]} scale={0.5} color={color} hitTime={data.hitTime} rotationSpeed={rotationSpeed} />
        </group>
    );
};

const Note: React.FC<NoteProps> = ({ data, hit, missed, isHolding }) => {
  const groupRef = useRef<THREE.Group>(null);
  const tailRef = useRef<THREE.Group>(null);
  const color = data.type === 'left' ? COLORS.left : COLORS.right;
  
  // Initial static position (X/Y are constant)
  const baseX = LANE_X_POSITIONS[data.lineIndex];
  const baseY = LAYER_Y_POSITIONS[data.lineLayer];

  // Length of the tail in world units (Z axis)
  const tailLength = data.length > 0 ? data.length * NOTE_SPEED : 0;

  useFrame(() => {
    if (groupRef.current) {
        const currentTime = Tone.Transport.seconds;
        
        // We use the 'hit' prop passed from parent for rendering logic, 
        // but 'data.hit' is still used for internal physics checks if needed.
        // Using props ensures we react to the frame where hit became true.
        const isHit = hit || data.hit;
        const isMissed = missed || data.missed;

        if (!isHit || (data.length > 0 && !isMissed)) {
             // Independent animation loop based on Audio Time
            const timeDiff = data.time - currentTime;
            // Z Position calculation matching GameScene collision logic
            const zPos = PLAYER_Z - (timeDiff * NOTE_SPEED);
            
            groupRef.current.position.set(baseX, baseY, zPos);

            // Visual effect for holding
            if (isHolding && tailRef.current) {
                 // Pulse the tail opacity or scale
                 const pulse = Math.sin(currentTime * 20) * 0.2 + 0.8;
                 tailRef.current.scale.set(pulse, pulse, 1);
            }
        }
    }
  });

  // If it's missed, don't render anything.
  // The parent should unmount it shortly, but this hides it immediately.
  if (missed) return null;

  // Debris Logic
  if (hit && data.length === 0 && data.hitTime) {
      // Short note hit -> Debris immediately
      const hitZ = PLAYER_Z - ((data.time - data.hitTime) * NOTE_SPEED);
      return (
          <group position={[baseX, baseY, hitZ]}>
              <Debris data={data} color={color} />
          </group>
      );
  }

  return (
    <group ref={groupRef} position={[baseX, baseY, SPAWN_Z]}>
      
      {/* LONG NOTE TAIL */}
      {data.length > 0 && (
          <group ref={tailRef} position={[0, 0, -tailLength / 2]}> 
             {/* The tail extends backwards (negative Z) from the head */}
             <mesh rotation={[Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[NOTE_SIZE * 0.3, NOTE_SIZE * 0.3, tailLength, 8]} />
                 <meshStandardMaterial 
                    color={color} 
                    emissive={color} 
                    emissiveIntensity={isHolding ? 4 : 1.5} 
                    transparent 
                    opacity={0.6}
                    roughness={0.4}
                 />
             </mesh>
             {/* Core beam */}
             <mesh rotation={[Math.PI/2, 0, 0]}>
                 <cylinderGeometry args={[NOTE_SIZE * 0.1, NOTE_SIZE * 0.1, tailLength, 8]} />
                 <meshBasicMaterial color="white" transparent opacity={0.8} />
             </mesh>
          </group>
      )}

      {/* MAIN SPARK HEAD */}
      {/* Hide head when hit, even if length > 0 */}
      {!hit && (
          <group>
            <group rotation={[0, 0, 0]} position={[0, 0, -NOTE_SIZE * 0.2]}>
                <Extrude args={[SPARK_SHAPE, EXTRUDE_SETTINGS]} castShadow receiveShadow>
                    <meshPhysicalMaterial 
                        color={color} 
                        roughness={0.2} 
                        metalness={0.1}
                        transmission={0.1} 
                        thickness={0.5}
                        emissive={color}
                        emissiveIntensity={0.8} 
                    />
                </Extrude>
            </group>
            
            {/* Inner Core Glow */}
            <mesh position={[0, 0, NOTE_SIZE * 0.1]}>
                <octahedronGeometry args={[NOTE_SIZE * 0.2, 0]} />
                <meshBasicMaterial color="white" toneMapped={false} transparent opacity={0.8} />
            </mesh>

            {/* Outer Wireframe Glow */}
            <group position={[0, 0, -NOTE_SIZE * 0.2]}>
                <mesh>
                    <extrudeGeometry args={[SPARK_SHAPE, { ...EXTRUDE_SETTINGS, depth: EXTRUDE_SETTINGS.depth * 1.1 }]} />
                    <meshBasicMaterial color={color} wireframe transparent opacity={0.3} />
                </mesh>
            </group>
          </group>
      )}
    </group>
  );
};

// Use React.memo with default shallow comparison.
// Since we now pass boolean props (hit, missed, isHolding), React will 
// correctly re-render when these primitives change, even if the 'data' object ref is unchanged.
export default React.memo(Note);
