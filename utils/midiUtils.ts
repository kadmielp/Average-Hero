
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import { Midi } from '@tonejs/midi';
import { NoteData, CutDirection, HandType, NoteAudioData, BackgroundAudioEvent } from '../types';

// GM Drum Mapping
const DRUMS = { KICK: 36, SNARE: 38, HAT_CLOSED: 42, HAT_OPEN: 46 };

export const loadMidi = async (url: string): Promise<Midi> => {
  try {
    let safeUrl = url;
    
    // Only apply encoding logic to relative paths (like songs/My Song.mid).
    // Blob URLs (blob:...) must remain untouched as they are already valid unique identifiers.
    if (!url.startsWith('blob:')) {
        safeUrl = url.split('/').map(part => encodeURIComponent(decodeURIComponent(part))).join('/');
    }
    
    const response = await fetch(safeUrl);
    if (!response.ok) {
        // Throwing simpler error message for UI handling
        throw new Error(`File not found (404)`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Midi(arrayBuffer);
  } catch (e: any) {
      // Log as warning to prevent flooding console with "Errors" when preloading optional songs
      console.warn(`MIDI Load Warning: ${url}`, e.message);
      throw e;
  }
};

interface ProcessedSong {
    chart: NoteData[];
    backgroundEvents: BackgroundAudioEvent[];
}

export const generateChartFromMidi = (midi: Midi, difficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium'): ProcessedSong => {
  const notes: NoteData[] = [];
  const backgroundEvents: BackgroundAudioEvent[] = [];
  let idCount = 0;

  // --- DIFFICULTY TUNING ---
  // Minimum time (in seconds) between notes for a single hand.
  const minTimeGap = difficulty === 'Easy' ? 0.6 : difficulty === 'Medium' ? 0.35 : 0.15;

  // Helper to determine instrument
  const getInstrumentType = (track: any, midiNote: number): 'kick' | 'snare' | 'hihat' | 'bass' | 'lead' => {
      if (track.instrument.percussion || track.channel === 9) {
          if (midiNote === 36 || midiNote === 35) return 'kick';
          if (midiNote === 38 || midiNote === 40) return 'snare';
          if (midiNote >= 42 && midiNote <= 46) return 'hihat';
          return 'snare'; // Fallback
      }
      // Standard cutoff for Bass vs Melody (MIDI 50 is roughly D2)
      if (midiNote < 50) return 'bass';
      return 'lead';
  };

  // Flatten all notes with their track info preserved
  let allEvents = midi.tracks.flatMap(track => {
      return track.notes.map(n => ({
          time: n.time,
          midi: n.midi,
          name: n.name,
          velocity: n.velocity,
          duration: n.duration,
          instrumentType: getInstrumentType(track, n.midi)
      }));
  }).sort((a, b) => a.time - b.time);


  // Filter logic for sorting notes into "Interactive" vs "Background"
  const lastTimeForHand: Record<HandType, number> = { left: -1, right: -1 };
  const lastNoteTimeGlobal = -1;
  
  for (let i = 0; i < allEvents.length; i++) {
    const note = allEvents[i];
    const instrument = note.instrumentType;

    // --- STEP 1: FILTERING (Should this note even be considered for gameplay?) ---
    
    let shouldBeInteractive = true;

    // On Easy/Medium, remove busy hi-hats from gameplay, keep them in background
    if (instrument === 'hihat' && difficulty !== 'Hard') {
        shouldBeInteractive = false;
    }
    
    // Move Rhythm Section (Kick/Bass) entirely to Background Track
    // This allows the hands to focus purely on Melody/Harmony
    if (instrument === 'kick' || instrument === 'bass') {
        shouldBeInteractive = false;
    }

    // 1. Chord De-duplication for Gameplay
    // If this note is at the same time as the previous interactive note
    // We only want ONE interactive note per timestamp usually (unless Hard mode)
    const timeDiff = Math.abs(note.time - lastNoteTimeGlobal);
    if (timeDiff < 0.05) {
         if (difficulty !== 'Hard') {
             shouldBeInteractive = false;
         }
    }

    // --- PIANO STYLE HAND ASSIGNMENT ---
    // Since Bass/Kick are gone, we split the Melody across both hands based on pitch.
    // Split Point: MIDI 62 (D4) - roughly center of pop melody range.
    // Left Hand (Red): Lower Notes
    // Right Hand (Blue): Higher Notes
    
    let type: HandType = 'right'; 

    if (note.midi < 62) {
        type = 'left';
    } else {
        type = 'right';
    }

    // 2. Time Gating
    // If it's too fast after the last note on this hand, move to background
    if (shouldBeInteractive && (note.time - lastTimeForHand[type] < minTimeGap)) {
        shouldBeInteractive = false;
    }

    const audioData: NoteAudioData = {
        instrument: instrument,
        midi: note.midi,
        name: note.name,
        duration: note.duration,
        velocity: note.velocity
    };

    if (shouldBeInteractive) {
        // --- MAKE INTERACTIVE SPARK ---
        
        // Mapping Logic
        // We base "Line Layer" (Height) on pitch, relative to the instrument's typical range
        let lineLayer = 1; // Default Mid
        
        // Simple Pitch Mapping for Height
        // Low notes -> Bottom, Mid notes -> Mid, High notes -> Top
        if (note.midi < 55) lineLayer = 0;
        else if (note.midi > 70) lineLayer = 2;
        else lineLayer = 1;

        // Lane Logic (Horizontal)
        // Left Hand (0, 1), Right Hand (2, 3)
        const hash = Math.sin(note.time * 123.45);
        let lineIndex = 0;
        if (type === 'left') {
            lineIndex = hash > 0 ? 1 : 0; // Lane 0 or 1
        } else {
            lineIndex = hash > 0 ? 2 : 3; // Lane 2 or 3
        }

        // LONG NOTE LOGIC
        // If the note is longer than 0.2s, it becomes a hold note
        const length = note.duration > 0.2 ? note.duration : 0;

        notes.push({
            id: `n-${idCount++}`,
            time: note.time,
            length: length, 
            lineIndex,
            lineLayer, 
            type,
            cutDirection: CutDirection.ANY,
            audio: audioData
        });

        lastTimeForHand[type] = note.time + length * 0.5; // Add small buffer based on length
    } else {
        // --- MAKE BACKGROUND AUDIO ---
        backgroundEvents.push({
            time: note.time,
            instrument: instrument,
            name: note.name,
            duration: note.duration,
            velocity: note.velocity
        });
    }
  }

  return { chart: notes, backgroundEvents };
};
