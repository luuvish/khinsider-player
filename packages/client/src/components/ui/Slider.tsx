import { forwardRef, useCallback, useRef, useState, type MouseEvent, type TouchEvent } from 'react';
import { cn } from '../../lib/cn';

export interface SliderProps {
  value: number;
  max?: number;
  min?: number;
  step?: number;
  onChange?: (value: number) => void;
  onChangeEnd?: (value: number) => void;
  disabled?: boolean;
  className?: string;
  showProgress?: boolean;
  size?: 'sm' | 'md';
  label?: string;
}

const Slider = forwardRef<HTMLDivElement, SliderProps>(
  (
    {
      value,
      max = 100,
      min = 0,
      step = 1,
      onChange,
      onChangeEnd,
      disabled = false,
      className,
      showProgress = true,
      size = 'md',
      label,
    },
    ref
  ) => {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isHovered, setIsHovered] = useState(false);

    const percentage = ((value - min) / (max - min)) * 100;

    const calculateValue = useCallback(
      (clientX: number) => {
        if (!trackRef.current) return value;

        const rect = trackRef.current.getBoundingClientRect();
        const position = (clientX - rect.left) / rect.width;
        const clampedPosition = Math.max(0, Math.min(1, position));
        const newValue = min + clampedPosition * (max - min);

        // Round to step
        const steppedValue = Math.round(newValue / step) * step;
        return Math.max(min, Math.min(max, steppedValue));
      },
      [max, min, step, value]
    );

    const handleMouseDown = useCallback(
      (e: MouseEvent) => {
        if (disabled) return;
        e.preventDefault();
        setIsDragging(true);

        const newValue = calculateValue(e.clientX);
        onChange?.(newValue);

        const handleMouseMove = (e: globalThis.MouseEvent) => {
          const newValue = calculateValue(e.clientX);
          onChange?.(newValue);
        };

        const handleMouseUp = (e: globalThis.MouseEvent) => {
          setIsDragging(false);
          const finalValue = calculateValue(e.clientX);
          onChangeEnd?.(finalValue);
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
      },
      [calculateValue, disabled, onChange, onChangeEnd]
    );

    const handleTouchStart = useCallback(
      (e: TouchEvent) => {
        if (disabled) return;
        setIsDragging(true);

        const touch = e.touches[0];
        const newValue = calculateValue(touch.clientX);
        onChange?.(newValue);
      },
      [calculateValue, disabled, onChange]
    );

    const handleTouchMove = useCallback(
      (e: TouchEvent) => {
        if (disabled || !isDragging) return;

        const touch = e.touches[0];
        const newValue = calculateValue(touch.clientX);
        onChange?.(newValue);
      },
      [calculateValue, disabled, isDragging, onChange]
    );

    const handleTouchEnd = useCallback(() => {
      if (disabled) return;
      setIsDragging(false);
      onChangeEnd?.(value);
    }, [disabled, onChangeEnd, value]);

    return (
      <div
        ref={ref}
        className={cn(
          'relative w-full',
          disabled && 'opacity-50 cursor-not-allowed',
          className
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        aria-label={label}
        role="slider"
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-disabled={disabled}
      >
        {/* Track */}
        <div
          ref={trackRef}
          className={cn(
            'relative w-full rounded-full bg-neutral-700 cursor-pointer',
            size === 'sm' ? 'h-1' : 'h-1.5',
            disabled && 'cursor-not-allowed'
          )}
          onMouseDown={handleMouseDown}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Progress */}
          {showProgress && (
            <div
              className={cn(
                'absolute left-0 top-0 h-full rounded-full bg-accent-500',
                'transition-[width] duration-75'
              )}
              style={{ width: `${percentage}%` }}
            />
          )}

          {/* Thumb */}
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2',
              'rounded-full bg-white shadow-md',
              'transition-transform duration-75',
              size === 'sm' ? 'h-3 w-3' : 'h-4 w-4',
              (isDragging || isHovered) && 'scale-110',
              disabled && 'cursor-not-allowed'
            )}
            style={{ left: `${percentage}%` }}
          />
        </div>
      </div>
    );
  }
);

Slider.displayName = 'Slider';

export { Slider };
