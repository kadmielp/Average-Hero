import React from 'react';
import { Hand } from 'lucide-react';
import { GameMode } from '../types';

interface PlayerModeIconProps {
    mode: GameMode;
    className?: string;
}

const PlayerModeIcon: React.FC<PlayerModeIconProps> = ({ mode, className = '' }) => {
    // Helper to render a hand icon
    const HandIcon = ({ type, color }: { type: 'left' | 'right', color: string }) => (
        <div className={`relative flex items-center justify-center w-8 h-8 rounded-full bg-white/10 border border-white/20 ${color}`}>
            <Hand
                size={18}
                className={`transform ${type === 'left' ? 'scale-x-[-1]' : ''}`}
                fill="currentColor"
                strokeWidth={2.5}
            />
        </div>
    );

    // Helper for Player Label
    const PlayerLabel = ({ label }: { label: string }) => (
        <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 mb-1">{label}</span>
    );

    const Container = ({ children }: { children: React.ReactNode }) => (
        <div className={`flex flex-col items-center gap-1 ${className}`}>
            {children}
        </div>
    );

    switch (mode) {
        case GameMode.STANDARD: // SOLO (DUAL)
            return (
                <Container>
                    <PlayerLabel label="P1" />
                    <div className="flex gap-2">
                        <HandIcon type="left" color="text-red-500" />
                        <HandIcon type="right" color="text-blue-500" />
                    </div>
                </Container>
            );

        case GameMode.RIGHT_HAND_ONLY: // SOLO (RIGHT)
            return (
                <Container>
                    <PlayerLabel label="P1" />
                    <div className="flex gap-2">
                        <div className="w-8" /> {/* Spacer for alignment */}
                        <HandIcon type="right" color="text-blue-500" />
                    </div>
                </Container>
            );

        case GameMode.LEFT_HAND_ONLY: // SOLO (LEFT)
            return (
                <Container>
                    <PlayerLabel label="P1" />
                    <div className="flex gap-2">
                        <HandIcon type="left" color="text-red-500" />
                        <div className="w-8" /> {/* Spacer for alignment */}
                    </div>
                </Container>
            );

        case GameMode.COOP_SPLIT: // CO-OP SPLIT
            return (
                <div className={`flex items-center gap-4 ${className}`}>
                    <div className="flex flex-col items-center gap-1">
                        <PlayerLabel label="P2" />
                        <HandIcon type="left" color="text-red-500" />
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="flex flex-col items-center gap-1">
                        <PlayerLabel label="P1" />
                        <HandIcon type="right" color="text-blue-500" />
                    </div>
                </div>
            );

        default:
            return null;
    }
};

export default PlayerModeIcon;
