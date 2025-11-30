import { useState, useCallback } from 'react';
import { Slider } from '@/components/ui';
import { IconButton } from '@/components/ui';
import { Volume2, VolumeX, Volume1 } from '@/lib/icons';

interface PlayerVolumeProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
}

export function PlayerVolume({ volume, onVolumeChange }: PlayerVolumeProps) {
  const [previousVolume, setPreviousVolume] = useState(volume || 1);

  const handleMuteToggle = useCallback(() => {
    if (volume > 0) {
      setPreviousVolume(volume);
      onVolumeChange(0);
    } else {
      onVolumeChange(previousVolume);
    }
  }, [volume, previousVolume, onVolumeChange]);

  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  return (
    <div className="flex items-center gap-2">
      <IconButton
        icon={VolumeIcon}
        onClick={handleMuteToggle}
        label={volume === 0 ? 'Unmute' : 'Mute'}
        size="sm"
        variant="ghost"
      />

      <Slider
        value={volume * 100}
        max={100}
        min={0}
        step={1}
        onChange={(val) => onVolumeChange(val / 100)}
        size="sm"
        label="Volume"
        className="w-24"
      />
    </div>
  );
}
