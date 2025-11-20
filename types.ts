
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import * as THREE from 'three';

export enum GameStatus {
  LOADING = 'LOADING',
  IDLE = 'IDLE',
  SONG_SELECTION = 'SONG_SELECTION',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
  VICTORY = 'VICTORY'
}

export type HandType = 'left' | 'right';

// 0: Up, 1: Down, 2: Left, 3: Right, 4: Any (Dot)
export enum CutDirection {
  UP = 0,
  DOWN = 1,
  LEFT = 2,
  RIGHT = 3,
  ANY = 4
}

export interface NoteAudioData {
  instrument: 'kick' | 'snare' | 'hihat' | 'bass' | 'lead';
  midi: number;
  name: string;
  duration: number;
  velocity: number;
}

export interface NoteData {
  id: string;
  time: number;     // Time in seconds when the HEAD reaches the player
  length: number;   // Duration in seconds (0 for single hits)
  lineIndex: number; // 0-3 (horizontal position)
  lineLayer: number; // 0-2 (vertical position)
  type: HandType;    // which hand should cut it
  cutDirection: CutDirection;
  audio: NoteAudioData; 
  
  // State
  hit?: boolean;      // Has the head been hit?
  isHolding?: boolean; // Is the player currently holding this long note?
  missed?: boolean;
  hitTime?: number; 
}

export interface BackgroundAudioEvent {
  time: number;
  instrument: 'kick' | 'snare' | 'hihat' | 'bass' | 'lead';
  name: string;
  duration: number;
  velocity: number;
}

export interface HandPositions {
  left: THREE.Vector3 | null;
  right: THREE.Vector3 | null;
  leftRotation: THREE.Quaternion | null;
  rightRotation: THREE.Quaternion | null;
  leftVelocity: THREE.Vector3;
  rightVelocity: THREE.Vector3;
}

export interface SongMetadata {
  id: string;
  title: string;
  artist: string;
  filename: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  bpm: number;
}

export const COLORS = {
  left: '#ef4444',  // Red-ish
  right: '#3b82f6', // Blue-ish
  track: '#111111',
  hittable: '#ffffff'
};
