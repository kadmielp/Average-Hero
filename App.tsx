
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/


import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { GameStatus, NoteData, SongMetadata, BackgroundAudioEvent } from './types';
import { LEAD_IN_TIME } from './constants';
import { useMediaPipe } from './hooks/useMediaPipe';
import GameScene from './components/GameScene';
import WebcamPreview from './components/WebcamPreview';
import SongProgress from './components/SongProgress';
import { Play, RefreshCw, VideoOff, Hand, Sparkles, Music, ChevronLeft, Loader2, Upload, AlertCircle, FileAudio } from 'lucide-react';
import * as Tone from 'tone';
import { loadMidi, generateChartFromMidi } from './utils/midiUtils';
import { Midi } from '@tonejs/midi';

const App: React.FC = () => {
    const [gameStatus, setGameStatus] = useState<GameStatus>(GameStatus.LOADING);
    const [score, setScore] = useState(0);
    const [combo, setCombo] = useState(0);
    const [multiplier, setMultiplier] = useState(1);
    const [health, setHealth] = useState(100);
    const [gameChart, setGameChart] = useState<NoteData[]>([]);

    // Song Selection State
    const [songs, setSongs] = useState<SongMetadata[]>([]);
    const [selectedSong, setSelectedSong] = useState<SongMetadata | null>(null);
    const [isSongLoading, setIsSongLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [countdown, setCountdown] = useState<number | null>(null);


    const midiRef = useRef<Midi | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Cache for preloaded songs and charts
    // Now stores both chart and background events
    const preloadedDataRef = useRef<Map<string, { midi: Midi, chart: NoteData[], backgroundEvents: BackgroundAudioEvent[] }>>(new Map());

    // Music Orchestra Refs
    const musicSynthsRef = useRef<{
        kick: Tone.MembraneSynth;
        snare: Tone.NoiseSynth;
        hihat: Tone.MetalSynth;
        bass: Tone.MonoSynth;
        lead: Tone.PolySynth;
        volume: Tone.Volume;
    } | null>(null);

    // Now getting lastResultsRef from the hook
    const { isCameraReady, handPositionsRef, lastResultsRef, error: cameraError } = useMediaPipe(videoRef);

    // Initial Load: Fetch Metadata & Setup Audio
    useEffect(() => {
        const loadSongs = async () => {
            let loadedSongs: SongMetadata[] = [];

            // 1. Load from metadata.json
            try {
                const res = await fetch('./metadata.json');
                const data = await res.json();
                if (data.songs && Array.isArray(data.songs)) {
                    loadedSongs = data.songs;
                }
            } catch (err) {
                console.warn("Failed to load song metadata", err);
            }

            // 2. Auto-load from /songs/ folder using Vite's glob import
            const midiFiles = import.meta.glob('./songs/*.mid', { query: '?url', import: 'default', eager: true });

            const autoLoadedSongs: SongMetadata[] = Object.entries(midiFiles).map(([path, url]) => {
                const filename = path.split('/').pop() || '';
                const title = filename.replace('.mid', '').replace('.midi', '');
                return {
                    id: filename,
                    title: title,
                    artist: 'Unknown', // Default
                    filename: url as string, // Use the hashed URL from Vite
                    difficulty: 'Medium',
                    bpm: 120
                };
            });

            // Merge: Add auto-loaded songs if they aren't already in metadata.json
            const existingIds = new Set(loadedSongs.map(s => s.id));
            const newSongs = autoLoadedSongs.filter(s => !existingIds.has(s.id));

            const allSongs = [...loadedSongs, ...newSongs];

            setSongs(allSongs);
            allSongs.forEach(song => preloadSong(song));
        };

        loadSongs();

        // Audio Setup
        if (!musicSynthsRef.current) {
            setupAudio();
        }

        // Global Cleanup on unmount
        return () => {
            try {
                Tone.Transport.stop();
                Tone.Transport.cancel();
            } catch (e) {
                console.warn("Error cleaning up Transport on unmount", e);
            }
        }
    }, []);

    // Separate effect for Game Loop cleanup to prevent stopping transport on state changes
    useEffect(() => {
        if (gameStatus !== GameStatus.PLAYING && Tone.Transport.state === 'started') {
            try {
                Tone.Transport.stop();
                Tone.Transport.cancel();
            } catch (e) {
                console.warn("Error stopping Transport", e);
            }
        }
    }, [gameStatus]);

    // Camera State handling
    useEffect(() => {
        if (gameStatus === GameStatus.LOADING && isCameraReady) {
            setGameStatus(GameStatus.IDLE);
        }
    }, [isCameraReady, gameStatus]);

    const preloadSong = async (song: SongMetadata) => {
        if (preloadedDataRef.current.has(song.id)) return;

        try {
            const midi = await loadMidi(song.filename);
            const { chart, backgroundEvents } = generateChartFromMidi(midi, song.difficulty);
            preloadedDataRef.current.set(song.id, { midi, chart, backgroundEvents });
            console.log(`Preloaded ${song.title}`);
        } catch (e) {
            console.warn(`Skipping preload for ${song.title} - File not found or invalid.`);
        }
    };

    const setupAudio = () => {
        // Music Synths (Orchestra)
        // We route them all through a Volume node to control overall song level
        const songVol = new Tone.Volume(-2).toDestination();

        const kick = new Tone.MembraneSynth({
            pitchDecay: 0.05,
            octaves: 10,
            oscillator: { type: "sine" },
            envelope: { attack: 0.001, decay: 0.4, sustain: 0.01, release: 1.4 },
        }).connect(songVol);

        const snare = new Tone.NoiseSynth({
            noise: { type: "white" },
            envelope: { attack: 0.001, decay: 0.2, sustain: 0 },
        }).connect(songVol);

        const hihat = new Tone.MetalSynth({
            envelope: { attack: 0.001, decay: 0.1, release: 0.01 },
            harmonicity: 5.1,
            modulationIndex: 32,
            resonance: 4000,
            octaves: 1.5,
        }).connect(songVol);
        hihat.volume.value = -15;

        const bass = new Tone.MonoSynth({
            oscillator: { type: "square" },
            envelope: { attack: 0.1, decay: 0.3, release: 2 },
            filterEnvelope: { attack: 0.001, decay: 0.1, sustain: 0.5, baseFrequency: 200, octaves: 2.6 }
        }).connect(songVol);
        bass.volume.value = -6;

        // Lead (Melody) - Increased Polyphony and Volume to cut through
        const lead = new Tone.PolySynth(Tone.Synth, {
            oscillator: { type: "triangle" },
            // Shorter release to clean up voices faster
            envelope: { attack: 0.02, decay: 0.1, sustain: 0.3, release: 0.5 }
        });
        lead.maxPolyphony = 32;
        lead.connect(songVol);
        lead.volume.value = -4; // Boosted slightly

        musicSynthsRef.current = { kick, snare, hihat, bass, lead, volume: songVol };
    };


    // Game Logic Handlers
    const handleNoteHit = useCallback((note: NoteData, goodCut: boolean) => {
        let points = 100;
        if (goodCut) points += 50;

        // --- KEYSOUNDING LOGIC ---
        // Play the note sound immediately when hit
        if (musicSynthsRef.current && note.audio) {
            const { instrument, name, duration, velocity } = note.audio;
            const synth = musicSynthsRef.current[instrument];
            if (synth) {
                try {
                    // Dynamic Mixing:
                    // Hit notes play loudly (1.5x) to pop out from the background mix
                    const hitVelocity = Math.min(1, velocity * 1.5);

                    if (instrument === 'snare' || instrument === 'hihat') {
                        (synth as Tone.NoiseSynth).triggerAttackRelease(duration, undefined, hitVelocity);
                    } else {
                        (synth as Tone.PolySynth | Tone.MonoSynth | Tone.MembraneSynth).triggerAttackRelease(name, duration, undefined, hitVelocity);
                    }
                } catch (e) {
                    // Ignore trigger errors during frantic play
                }
            }
        }

        // Haptic feedback for impact
        if (navigator.vibrate) {
            navigator.vibrate(goodCut ? 40 : 20);
        }

        setCombo(c => {
            const newCombo = c + 1;
            if (newCombo > 30) setMultiplier(8);
            else if (newCombo > 20) setMultiplier(4);
            else if (newCombo > 10) setMultiplier(2);
            else setMultiplier(1);
            return newCombo;
        });

        setScore(s => s + (points * multiplier));
        setHealth(h => Math.min(100, h + 2));
    }, [multiplier]);

    // New Handler for Long Note Holds
    const handleNoteHold = useCallback((note: NoteData) => {
        // Small score increment every frame while holding
        setScore(s => s + (2 * multiplier));

        // Gentle haptic buzz
        if (Math.random() > 0.8 && navigator.vibrate) {
            navigator.vibrate(5);
        }
    }, [multiplier]);

    const handleNoteMiss = useCallback((note: NoteData) => {
        // No Sound Played on Miss! This creates the "missing note" effect.

        setCombo(0);
        setMultiplier(1);
        setHealth(h => {
            const newHealth = h - 15;
            if (newHealth <= 0) {
                // Using setTimeout to avoid state updates during render cycle if this comes from useFrame
                setTimeout(() => endGame(false), 0);
                return 0;
            }
            return newHealth;
        });
    }, []);

    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const url = URL.createObjectURL(file);
        const customSong: SongMetadata = {
            id: `custom-${Date.now()}`,
            title: file.name.replace('.mid', '').replace('.midi', ''),
            artist: "Custom Upload",
            filename: url,
            difficulty: 'Medium', // Default for custom songs
            bpm: 120 // Placeholder, will be read from MIDI
        };

        handleSongSelect(customSong);
    };

    const handleSongSelect = async (song: SongMetadata) => {
        setErrorMessage(null);
        // CRITICAL: Ensure AudioContext is resumed immediately on user interaction
        try {
            await Tone.start();
            if (Tone.context.state !== 'running') {
                await Tone.context.resume();
            }
        } catch (e) {
            console.error("Failed to resume audio context:", e);
        }

        setIsSongLoading(true);
        setSelectedSong(song);

        try {
            // Re-init synths if they were lost or disposed
            if (!musicSynthsRef.current) setupAudio();

            let midi: Midi;
            let chart: NoteData[];
            let backgroundEvents: BackgroundAudioEvent[];

            // Check Cache
            const cached = preloadedDataRef.current.get(song.id);
            if (cached) {
                midi = cached.midi;
                chart = cached.chart;
                backgroundEvents = cached.backgroundEvents;
            } else {
                // Load fresh if not in cache (e.g. custom song)
                midi = await loadMidi(song.filename);
                const processed = generateChartFromMidi(midi, song.difficulty);
                chart = processed.chart;
                backgroundEvents = processed.backgroundEvents;
            }

            midiRef.current = midi;

            if (midi.header.tempos.length > 0) {
                Tone.Transport.bpm.value = midi.header.tempos[0].bpm;
            } else {
                Tone.Transport.bpm.value = song.bpm;
            }

            setIsSongLoading(false);
            startGame(midi, chart, backgroundEvents);

        } catch (e: any) {
            console.error("Critical audio initialization failure", e);
            setIsSongLoading(false);
            setSelectedSong(null);
            setErrorMessage(`Could not load song: ${e.message}. Please try a different file.`);
        }
    };

    const startGame = async (midi: Midi, chartData: NoteData[], backgroundEvents: BackgroundAudioEvent[]) => {
        if (!isCameraReady || !midi || !musicSynthsRef.current) return;

        // Double check Audio Context state right before starting
        if (Tone.context.state !== 'running') {
            await Tone.context.resume();
        }

        try {
            Tone.Transport.stop();
            Tone.Transport.cancel();
            Tone.Transport.position = 0;
        } catch (e) { console.warn("Transport cleanup error", e); }

        // Reset Game State
        setScore(0);
        setCombo(0);
        setMultiplier(1);
        setHealth(100);

        const freshChart = chartData.map(note => ({
            ...note,
            time: note.time + LEAD_IN_TIME
        }));

        setGameChart(freshChart);
        setGameStatus(GameStatus.PLAYING);

        // Start Music Immediately (Lead-in time handles the delay)
        startMusic(midi, backgroundEvents);

        // Start Countdown Visuals
        setCountdown(LEAD_IN_TIME);

        const countdownInterval = setInterval(() => {
            setCountdown(prev => {
                if (prev === null || prev <= 1) {
                    clearInterval(countdownInterval);
                    return null;
                }
                return prev - 1;
            });
        }, 1000);
    };

    const startMusic = (midi: Midi, backgroundEvents: BackgroundAudioEvent[]) => {
        if (!musicSynthsRef.current) return;

        const { kick, snare, hihat, bass, lead } = musicSynthsRef.current;


        // --- SCHEDULE BACKGROUND TRACKS ---
        // These play automatically. To enhance keysounding:
        // 1. Melody (lead) is played quietly (0.4x) so the user's hits pop out.
        // 2. Drums/Bass play normally (0.8x) to keep the beat solid.

        const lastScheduled = {
            kick: -100,
            snare: -100,
            hihat: -100,
            bass: -100
        };

        const MONO_BUFFER = 0.08;

        backgroundEvents.forEach(note => {
            const time = note.time + LEAD_IN_TIME;
            let duration = Math.max(0.1, Number(note.duration) || 0.1);

            // Velocity Control for Keysounding Mix
            let baseVel = Math.max(0.1, Math.min(1, note.velocity || 0.7));
            let mixVolume = 0.8; // Default background volume

            if (note.instrument === 'lead') {
                mixVolume = 0.4; // Much quieter for melody to let player shine
            }

            const finalVelocity = baseVel * mixVolume;

            if (note.instrument === 'kick') {
                if (time - lastScheduled.kick >= MONO_BUFFER) {
                    Tone.Transport.schedule((t) => {
                        try { kick.triggerAttackRelease("C1", "8n", t, finalVelocity); } catch (e) { }
                    }, time);
                    lastScheduled.kick = time;
                }
            }
            else if (note.instrument === 'snare') {
                if (time - lastScheduled.snare >= MONO_BUFFER) {
                    Tone.Transport.schedule((t) => {
                        try { snare.triggerAttackRelease("16n", t, finalVelocity); } catch (e) { }
                    }, time);
                    lastScheduled.snare = time;
                }
            }
            else if (note.instrument === 'hihat') {
                if (time - lastScheduled.hihat >= 0.04) {
                    Tone.Transport.schedule((t) => {
                        try { hihat.triggerAttackRelease("32n", t, finalVelocity); } catch (e) { }
                    }, time);
                    lastScheduled.hihat = time;
                }
            }
            else if (note.instrument === 'bass') {
                if (time - lastScheduled.bass >= MONO_BUFFER) {
                    Tone.Transport.schedule((t) => {
                        if (note.name) try { bass.triggerAttackRelease(note.name, duration, t, finalVelocity); } catch (e) { }
                    }, time);
                    lastScheduled.bass = time;
                }
            }
            else {
                // Lead/Other (PolySynth)
                Tone.Transport.schedule((t) => {
                    if (note.name) try { lead.triggerAttackRelease(note.name, duration, t, finalVelocity); } catch (e) { }
                }, time);
            }
        });

        // Schedule end
        Tone.Transport.schedule((time) => {
            endGame(true);
        }, midi.duration + LEAD_IN_TIME + 2);

        Tone.Transport.start();
    };

    const endGame = (victory: boolean) => {
        setGameStatus(victory ? GameStatus.VICTORY : GameStatus.GAME_OVER);
        try {
            Tone.Transport.stop();
            Tone.Transport.cancel();
        } catch (e) { console.warn("Error stopping transport on game end", e); }
    };

    const goToSelection = () => {
        setGameStatus(GameStatus.SONG_SELECTION);
    };

    const goToMenu = () => {
        setGameStatus(GameStatus.IDLE);
        setSelectedSong(null);
        setErrorMessage(null);
    };

    const getCurrentTime = useCallback(() => {
        return Tone.Transport.seconds;
    }, []);

    const loadingMessage = !isCameraReady ? "Waiting for Camera..." : "Loading Assets...";

    return (
        <div className="relative w-full h-screen bg-black overflow-hidden font-sans select-none">
            {/* Hidden Video for Processing */}
            <video
                ref={videoRef}
                className="absolute opacity-0 pointer-events-none"
                playsInline
                muted
                autoPlay
                style={{ width: '640px', height: '480px' }}
            />

            {/* 3D Canvas */}
            <Canvas shadows dpr={[1, 2]}>
                {gameStatus === GameStatus.PLAYING && (
                    <GameScene
                        gameStatus={gameStatus}
                        getCurrentTime={getCurrentTime}
                        handPositionsRef={handPositionsRef}
                        chart={gameChart}
                        onNoteHit={handleNoteHit}
                        onNoteMiss={handleNoteMiss}
                        onNoteHold={handleNoteHold}
                        onSongEnd={() => endGame(true)}
                    />
                )}
            </Canvas>

            {/* Webcam Mini-Map Preview */}
            <WebcamPreview
                videoRef={videoRef}
                resultsRef={lastResultsRef}
                isCameraReady={isCameraReady}
            />

            {/* UI Overlay */}
            <div className="absolute inset-0 pointer-events-none flex flex-col z-10">

                {/* HUD (Only visible when playing) */}
                {gameStatus === GameStatus.PLAYING && (
                    <>
                        {/* Top HUD */}
                        <div className="absolute top-0 left-0 right-0 flex justify-between items-start p-6 text-white w-full pointer-events-none">
                            {/* Health Bar (Top Left) */}
                            <div className="w-1/3 max-w-xs pointer-events-auto">
                                <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-bold">System Integrity</div>
                                <div className="h-3 bg-gray-900/80 rounded-full overflow-hidden border border-gray-700/50 backdrop-blur-sm">
                                    <div
                                        className={`h-full transition-all duration-300 ease-out ${health > 50 ? 'bg-green-500' : health > 20 ? 'bg-yellow-500' : 'bg-red-500 shadow-[0_0_10px_red]'}`}
                                        style={{ width: `${health}%` }}
                                    />
                                </div>
                            </div>

                            {/* Score & Combo (Top Center) */}
                            <div className="flex flex-col items-center transform -translate-y-2">
                                <div className="text-6xl font-black tracking-tighter drop-shadow-[0_0_10px_rgba(255,255,255,0.5)] font-mono">
                                    {score.toLocaleString()}
                                </div>
                                {combo > 5 && (
                                    <div className="text-2xl font-bold text-blue-400 animate-pulse mt-2">
                                        {combo}x COMBO
                                    </div>
                                )}
                            </div>

                            {/* Multiplier Indicator (Top Right) */}
                            <div className="w-1/3 flex justify-end">
                                <div className="flex flex-col items-end">
                                    <div className="text-xs text-gray-400 mb-1 uppercase tracking-wider font-bold">Multiplier</div>
                                    <div className="text-3xl font-black text-yellow-400 border-2 border-yellow-400/30 rounded-lg px-3 py-1 bg-black/40 backdrop-blur-md">
                                        x{multiplier}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Bottom HUD (Progress Bar) */}
                        <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center justify-center pointer-events-none">
                            <div className="bg-black/50 backdrop-blur-md p-4 rounded-2xl border border-white/10 w-full max-w-2xl flex flex-col items-center gap-2">
                                <div className="text-sm font-bold text-white truncate">{selectedSong?.title} <span className="text-gray-400 font-normal mx-2">//</span> {selectedSong?.artist}</div>
                                {midiRef.current && (
                                    <SongProgress
                                        duration={midiRef.current.duration + LEAD_IN_TIME}
                                        getCurrentTime={getCurrentTime}
                                        isPlaying={gameStatus === GameStatus.PLAYING && countdown === null}
                                    />
                                )}
                            </div>
                        </div>
                    </>
                )}

                {/* Countdown Overlay */}
                {countdown !== null && (
                    <div className="absolute inset-0 flex items-center justify-center z-50 pointer-events-none">
                        <div className="text-[15rem] font-black text-white animate-ping opacity-80 drop-shadow-[0_0_30px_rgba(59,130,246,0.8)]">
                            {countdown}
                        </div>
                    </div>
                )}

                {/* Loading Screen */}
                {gameStatus === GameStatus.LOADING && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black text-white pointer-events-auto">
                        <Loader2 className="w-16 h-16 animate-spin text-blue-500 mb-6" />
                        <div className="text-2xl font-light tracking-widest animate-pulse">{loadingMessage}</div>
                        {cameraError && (
                            <div className="mt-4 text-red-400 bg-red-900/20 p-4 rounded border border-red-500/30">
                                Error: {cameraError}
                            </div>
                        )}
                    </div>
                )}

                {/* Idle / Start Screen */}
                {gameStatus === GameStatus.IDLE && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-sm pointer-events-auto">
                        <div className="relative mb-12 group">
                            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg blur opacity-25 group-hover:opacity-50 transition duration-1000"></div>
                            <h1 className="relative text-8xl font-black text-white tracking-tighter italic transform -skew-x-6">
                                AVERAGE <span className="text-blue-500">HERO</span>
                            </h1>
                        </div>

                        <button
                            onClick={goToSelection}
                            className="group relative px-12 py-4 bg-white text-black text-2xl font-bold tracking-widest uppercase overflow-hidden hover:bg-blue-400 transition-colors duration-300 skew-x-[-10deg]"
                        >
                            <span className="relative z-10 inline-block skew-x-[10deg]">Start Game</span>
                            <div className="absolute inset-0 bg-blue-500 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        </button>

                        <div className="mt-12 flex gap-8 text-gray-500">
                            <div className="flex items-center gap-2"><Hand size={20} /> Use Hands</div>
                            <div className="flex items-center gap-2"><Music size={20} /> Feel the Beat</div>
                            <div className="flex items-center gap-2"><Sparkles size={20} /> Slash Notes</div>
                        </div>
                    </div>
                )}

                {/* Song Selection Screen */}
                {gameStatus === GameStatus.SONG_SELECTION && (
                    <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black p-8 pt-20 overflow-y-auto pointer-events-auto">
                        <div className="max-w-5xl mx-auto">
                            <div className="flex justify-between items-center mb-8">
                                <button
                                    onClick={goToMenu}
                                    className="flex items-center text-gray-400 hover:text-white transition-colors"
                                >
                                    <ChevronLeft className="mr-2" /> Back to Title
                                </button>
                            </div>

                            {errorMessage && (
                                <div className="mb-6 bg-red-900/30 border border-red-500/50 p-4 rounded-lg flex items-center text-red-200 animate-in fade-in slide-in-from-top-2">
                                    <AlertCircle className="mr-2 shrink-0" />
                                    {errorMessage}
                                </div>
                            )}

                            <h2 className="text-4xl font-bold text-white mb-8 flex items-center">
                                <Music className="mr-4 text-blue-500" size={40} /> Select Track
                            </h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {songs.length > 0 ? songs.map((song) => (
                                    <button
                                        key={song.id}
                                        onClick={() => handleSongSelect(song)}
                                        disabled={isSongLoading}
                                        className="group relative bg-gray-800/50 border border-gray-700 hover:border-blue-500 hover:bg-gray-800 p-6 rounded-xl text-left transition-all duration-200 hover:-translate-y-1 shadow-lg hover:shadow-blue-500/20"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${song.difficulty === 'Hard' ? 'bg-red-500/20 text-red-400' :
                                                song.difficulty === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                                    'bg-green-500/20 text-green-400'
                                                }`}>
                                                {song.difficulty}
                                            </div>
                                            <div className="text-gray-500 text-xs font-mono">{song.bpm} BPM</div>
                                        </div>
                                        <div className="text-xl font-bold text-white mb-1 group-hover:text-blue-400 transition-colors">{song.title}</div>
                                        <div className="text-sm text-gray-400">{song.artist}</div>

                                        {isSongLoading && selectedSong?.id === song.id && (
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-xl backdrop-blur-sm">
                                                <Loader2 className="animate-spin text-white" />
                                            </div>
                                        )}
                                    </button>
                                )) : (
                                    <div className="col-span-full flex flex-col items-center justify-center py-12 text-gray-500 border border-gray-800 rounded-xl bg-gray-900/30 border-dashed">
                                        <FileAudio className="w-12 h-12 mb-4 opacity-50" />
                                        <p className="text-lg font-medium text-gray-400">No songs configured</p>
                                        <p className="text-sm mt-1 text-gray-600">Update metadata.json or upload a MIDI file below.</p>
                                    </div>
                                )}

                                {/* Upload Custom Song Button */}
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="group border-2 border-dashed border-gray-700 hover:border-blue-500 hover:bg-blue-500/5 p-6 rounded-xl flex flex-col items-center justify-center text-center min-h-[160px] transition-all duration-200"
                                >
                                    <Upload className="w-10 h-10 text-gray-500 group-hover:text-blue-400 mb-3 transition-colors" />
                                    <div className="text-lg font-bold text-gray-300 group-hover:text-white">Import MIDI</div>
                                    <div className="text-xs text-gray-500 mt-1">Upload .mid files from device</div>
                                </button>
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept=".mid,.midi"
                                    onChange={handleFileUpload}
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* Game Over / Victory Screen */}
                {(gameStatus === GameStatus.VICTORY || gameStatus === GameStatus.GAME_OVER) && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md z-50 pointer-events-auto animate-in fade-in duration-500">
                        <div className="text-center mb-12">
                            <h2 className={`text-7xl font-black tracking-tighter italic mb-4 ${gameStatus === GameStatus.VICTORY ? 'text-green-500' : 'text-red-500'
                                }`}>
                                {gameStatus === GameStatus.VICTORY ? 'STAGE CLEARED' : 'SYSTEM FAILURE'}
                            </h2>
                            <div className="text-2xl text-white font-light tracking-widest uppercase">
                                Final Score
                            </div>
                            <div className="text-6xl font-mono font-bold text-white mt-2">
                                {score.toLocaleString()}
                            </div>
                        </div>

                        <div className="flex gap-6">
                            <button
                                onClick={() => selectedSong ? handleSongSelect(selectedSong) : goToSelection()}
                                className="px-8 py-3 bg-white text-black font-bold uppercase tracking-widest hover:bg-gray-200 transition-colors rounded"
                            >
                                <div className="flex items-center gap-2"><RefreshCw size={18} /> Retry</div>
                            </button>
                            <button
                                onClick={goToMenu}
                                className="px-8 py-3 border border-white/30 text-white font-bold uppercase tracking-widest hover:bg-white/10 transition-colors rounded"
                            >
                                Menu
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div >
    );
};

export default App;
