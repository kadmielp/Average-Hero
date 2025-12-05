
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useMemo, useRef } from 'react';
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

// Spark shape removed

// Spark Particle Component
const Spark = ({ velocity, color, hitTime, scale = 1 }: {
    velocity: THREE.Vector3,
    color: string,
    hitTime?: number,
    scale?: number
}) => {
    const meshRef = useRef<THREE.Mesh>(null);

    useFrame(() => {
        if (meshRef.current && hitTime) {
            const timeSinceHit = Tone.Transport.seconds - hitTime;

            // Physics: Move by velocity * time
            // Add slight gravity or drag if desired, but for sparks linear is usually fine for short bursts
            meshRef.current.position.x = velocity.x * timeSinceHit * 5; // Speed multiplier
            meshRef.current.position.y = velocity.y * timeSinceHit * 5;
            meshRef.current.position.z = velocity.z * timeSinceHit * 5;

            // Fade out / Shrink
            const life = 0.5; // Seconds
            if (timeSinceHit < life) {
                const t = 1 - (timeSinceHit / life);
                meshRef.current.scale.setScalar(scale * t);
            } else {
                meshRef.current.scale.setScalar(0);
            }
        }
    });

    return (
        <mesh ref={meshRef}>
            <boxGeometry args={[0.05, 0.05, 0.05]} />
            <meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
    )
}

const Debris: React.FC<{ data: NoteData, color: string }> = ({ data, color }) => {
    // Generate random sparks
    const sparks = useMemo(() => {
        const temp = [];
        const count = 12; // Number of sparks
        for (let i = 0; i < count; i++) {
            // Random direction in a sphere
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);

            const x = Math.sin(phi) * Math.cos(theta);
            const y = Math.sin(phi) * Math.sin(theta);
            const z = Math.cos(phi);

            temp.push({
                id: i,
                velocity: new THREE.Vector3(x, y, z).normalize().addScalar((Math.random() - 0.5) * 0.5), // Add some randomness
                scale: 0.5 + Math.random() * 0.5
            });
        }
        return temp;
    }, []);

    return (
        <group>


            {/* Sparks */}
            {sparks.map(s => (
                <Spark
                    key={s.id}
                    velocity={s.velocity}
                    color={color}
                    hitTime={data.hitTime}
                    scale={s.scale}
                />
            ))}
        </group>
    );
};

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

const Note: React.FC<NoteProps> = ({ data, hit, missed, isHolding }) => {
    const groupRef = useRef<THREE.Group>(null);
    const tailRef = useRef<THREE.Group>(null);
    const asteroidRef = useRef<THREE.Group>(null);
    const color = data.type === 'left' ? COLORS.left : COLORS.right;

    // Initial static position (X/Y are constant)
    const baseX = LANE_X_POSITIONS[data.lineIndex];
    const baseY = LAYER_Y_POSITIONS[data.lineLayer];

    // Length of the tail in world units (Z axis)
    const tailLength = data.length > 0 ? data.length * NOTE_SPEED : 0;

    // Random rotation removed for uniform look
    // const randomRotation = ... 


    const starShape = useMemo(() => createSparkShape(NOTE_SIZE), []);

    useFrame((state, delta) => {
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

                // Rotate star (spin)
                if (asteroidRef.current) {
                    asteroidRef.current.rotation.z += delta * 1.0; // Simple spin
                }

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
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
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
                    <mesh rotation={[Math.PI / 2, 0, 0]}>
                        <cylinderGeometry args={[NOTE_SIZE * 0.1, NOTE_SIZE * 0.1, tailLength, 8]} />
                        <meshBasicMaterial color="white" transparent opacity={0.8} />
                    </mesh>
                </group>
            )}

            {/* MAIN STAR HEAD */}
            {!hit && (
                <group ref={asteroidRef}>
                    <mesh position={[0, 0, -NOTE_SIZE * 0.1]}>
                        <extrudeGeometry args={[starShape, {
                            depth: NOTE_SIZE * 0.3,
                            bevelEnabled: true,
                            bevelThickness: NOTE_SIZE * 0.1,
                            bevelSize: NOTE_SIZE * 0.05,
                            bevelSegments: 3
                        }]} />
                        <meshStandardMaterial
                            color={color}
                            emissive={color}
                            emissiveIntensity={0.5}
                            roughness={0.2}
                            metalness={0.1}
                        />
                    </mesh>

                </group>
            )}
        </group>
    );
};

// Use React.memo with default shallow comparison.
// Since we now pass boolean props (hit, missed, isHolding), React will 
// correctly re-render when these primitives change, even if the 'data' object ref is unchanged.
export default React.memo(Note);
