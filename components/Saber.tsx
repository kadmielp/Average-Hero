
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { HandType, COLORS } from '../types';

interface SaberProps {
  type: HandType;
  positionRef: React.MutableRefObject<THREE.Vector3 | null>;
  rotationRef: React.MutableRefObject<THREE.Quaternion | null>;
}

const Saber: React.FC<SaberProps> = ({ type, positionRef, rotationRef }) => {
  const meshRef = useRef<THREE.Group>(null);
  
  // Saber Dimensions
  const saberLength = 1.0; 
  const bladeRadius = 0.02;
  const bladeStart = 0.05;
  
  // We offset the geometry on the Y-axis so that the TIP of the blade 
  // sits at (0,0,0), which corresponds to the tracked index finger tip.
  // Total height from origin = start + length + top_cap_radius
  const tipHeight = bladeStart + saberLength + bladeRadius;
  const yOffset = -tipHeight;

  useFrame((state, delta) => {
    if (!meshRef.current) return;
    
    const targetPos = positionRef.current;
    const targetRot = rotationRef.current;

    if (targetPos) {
      meshRef.current.visible = true;
      // Smooth movement
      meshRef.current.position.lerp(targetPos, 0.5); 
      
      if (targetRot) {
          // Slerp (Spherical Linear Interpolation) for smooth rotation
          meshRef.current.quaternion.slerp(targetRot, 0.4);
      } else {
          // Fallback to static if rotation is lost but position exists
          meshRef.current.rotation.set(0, 0, 0);
      }

    } else {
      meshRef.current.visible = false;
    }
  });

  const color = type === 'left' ? COLORS.left : COLORS.right;

  return (
    <group ref={meshRef}>
      {/* 
         The entire visual mesh is shifted down by yOffset. 
         (0,0,0) of the parent group is now the Tip of the Blade.
         Negative Y extends back towards the handle.
      */}
      <group position={[0, yOffset, 0]}>
        {/* --- HANDLE ASSEMBLY --- */}
        {/* Main Grip (Dark Grey/Black) */}
        <mesh position={[0, -0.06, 0]}>
            <cylinderGeometry args={[0.02, 0.02, 0.12, 16]} />
            <meshStandardMaterial color="#1a1a1a" roughness={0.6} metalness={0.8} />
        </mesh>
        
        {/* Pommel (Bottom Cap) */}
        <mesh position={[0, -0.13, 0]}>
            <cylinderGeometry args={[0.025, 0.025, 0.02, 16]} />
            <meshStandardMaterial color="#888" roughness={0.3} metalness={1} />
        </mesh>

        {/* Grip Accents (Metallic Rings) */}
        <mesh position={[0, -0.08, 0]}>
            <torusGeometry args={[0.021, 0.002, 8, 24]} />
            <meshStandardMaterial color="#aaa" roughness={0.2} metalness={1} />
        </mesh>
        <mesh position={[0, -0.04, 0]}>
            <torusGeometry args={[0.021, 0.002, 8, 24]} />
            <meshStandardMaterial color="#aaa" roughness={0.2} metalness={1} />
        </mesh>

        {/* Emitter Guard (Top metallic part where blade comes out) */}
        <mesh position={[0, 0.01, 0]}>
            <cylinderGeometry args={[0.035, 0.025, 0.05, 16]} />
            <meshStandardMaterial color="#C0C0C0" roughness={0.2} metalness={1} />
        </mesh>

        {/* Emitter Glow Ring */}
        <mesh position={[0, 0.036, 0]} rotation={[Math.PI/2, 0, 0]}>
            <ringGeometry args={[0.015, 0.03, 32]} />
            <meshBasicMaterial color={color} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>


        {/* --- BLADE ASSEMBLY --- */}
        {/* Inner Core (Bright White) */}
        <mesh position={[0, bladeStart + saberLength / 2, 0]}>
            <cylinderGeometry args={[0.008, 0.008, saberLength, 12]} />
            <meshBasicMaterial color="white" toneMapped={false} />
        </mesh>

        {/* Outer Glow (Colored) */}
        <mesh position={[0, bladeStart + saberLength / 2, 0]}>
            <capsuleGeometry args={[bladeRadius, saberLength, 16, 32]} />
            <meshStandardMaterial 
            color={color} 
            emissive={color} 
            emissiveIntensity={4} // Very bright
            toneMapped={false} // Don't let the renderer clamp the brightness
            transparent
            opacity={0.6} // Semi-transparent to see the white core
            roughness={0.1}
            metalness={0}
            />
        </mesh>
      </group>
      
      {/* Interactive Light - Placed at the TIP (origin) to illuminate what you touch */}
      <pointLight color={color} intensity={2} distance={3} decay={2} position={[0, 0, 0]} />
    </group>
  );
};

export default Saber;
