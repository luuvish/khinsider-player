import { useRef, useEffect, useCallback } from 'react';
import { usePlayerStore } from '@/stores/playerStore';
import { Container } from '@/components/ui';
import { PlayerInfo } from './PlayerInfo';
import { PlayerControls } from './PlayerControls';
import { PlayerProgress } from './PlayerProgress';
import { PlayerVolume } from './PlayerVolume';
import { MiniPlayer } from './MiniPlayer';

export function Player() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    currentTrack,
    currentAlbum,
    isPlaying,
    currentTime,
    duration,
    volume,
    isLoading,
    setAudioElement,
    pause,
    resume,
    stop,
    next,
    previous,
    seek,
    setVolume,
    updateTime,
  } = usePlayerStore();

  useEffect(() => {
    if (audioRef.current) {
      setAudioElement(audioRef.current);
    }
    return () => setAudioElement(null);
  }, [setAudioElement]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      updateTime(audioRef.current.currentTime, audioRef.current.duration || 0);
    }
  }, [updateTime]);

  const handleEnded = useCallback(() => {
    next();
  }, [next]);

  const handlePlayPause = useCallback(() => {
    if (isPlaying) {
      pause();
    } else {
      resume();
    }
  }, [isPlaying, pause, resume]);

  return (
    <>
      {/* Hidden audio element */}
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={handleTimeUpdate}
      />

      {/* Desktop Player */}
      <div className="fixed bottom-0 inset-x-0 z-50 hidden sm:block">
        <div className="bg-neutral-900/95 backdrop-blur-lg border-t border-neutral-800">
          <Container>
            <div className="flex items-center h-20 gap-6">
              {/* Left: Track Info */}
              <div className="w-64 flex-shrink-0">
                <PlayerInfo track={currentTrack} album={currentAlbum} />
              </div>

              {/* Center: Controls + Progress */}
              <div className="flex-1 flex flex-col items-center gap-2">
                <PlayerControls
                  isPlaying={isPlaying}
                  isLoading={isLoading}
                  onPlayPause={handlePlayPause}
                  onNext={next}
                  onPrevious={previous}
                  onStop={stop}
                  hasTrack={!!currentTrack}
                />
                <PlayerProgress
                  currentTime={currentTime}
                  duration={duration}
                  onSeek={seek}
                  disabled={!currentTrack}
                />
              </div>

              {/* Right: Volume */}
              <div className="w-40 flex-shrink-0 flex justify-end">
                <PlayerVolume volume={volume} onVolumeChange={setVolume} />
              </div>
            </div>
          </Container>
        </div>
      </div>

      {/* Mobile Mini Player */}
      <div className="fixed bottom-0 inset-x-0 z-50 sm:hidden">
        <MiniPlayer
          track={currentTrack}
          album={currentAlbum}
          isPlaying={isPlaying}
          isLoading={isLoading}
          onPlayPause={handlePlayPause}
        />
      </div>
    </>
  );
}
