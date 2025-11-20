import React, { useEffect, useRef, useState } from 'react';

interface SongProgressProps {
    duration: number;
    getCurrentTime: () => number;
    isPlaying: boolean;
}

const SongProgress: React.FC<SongProgressProps> = ({ duration, getCurrentTime, isPlaying }) => {
    const progressRef = useRef<HTMLDivElement>(null);
    const [currentTimeDisplay, setCurrentTimeDisplay] = useState("0:00");

    useEffect(() => {
        let animationFrameId: number;

        const updateProgress = () => {
            if (!isPlaying) return;

            const time = getCurrentTime();
            const progress = Math.min(100, Math.max(0, (time / duration) * 100));

            if (progressRef.current) {
                progressRef.current.style.width = `${progress}%`;
            }

            // Update time display every frame is fine, or throttle if needed.
            // For now, let's just format it.
            const minutes = Math.floor(time / 60);
            const seconds = Math.floor(time % 60).toString().padStart(2, '0');
            setCurrentTimeDisplay(`${minutes}:${seconds}`);

            animationFrameId = requestAnimationFrame(updateProgress);
        };

        if (isPlaying) {
            animationFrameId = requestAnimationFrame(updateProgress);
        }

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [isPlaying, duration, getCurrentTime]);

    const totalMinutes = Math.floor(duration / 60);
    const totalSeconds = Math.floor(duration % 60).toString().padStart(2, '0');

    return (
        <div className="w-full max-w-md flex flex-col gap-1">
            <div className="flex justify-between text-xs text-gray-400 font-mono">
                <span>{currentTimeDisplay}</span>
                <span>{totalMinutes}:{totalSeconds}</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                    ref={progressRef}
                    className="h-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-all duration-75 ease-linear"
                    style={{ width: '0%' }}
                />
            </div>
        </div>
    );
};

export default SongProgress;
