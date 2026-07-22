import { useState, useEffect } from 'react';
import { Image, Box } from '@mantine/core';

interface CoverImageProps {
  src?: string | null;
  alt?: string;
  width?: number | string;
  height?: number | string;
  radius?: string | number;
  fit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  sx?: any;
  className?: string;
}

export function CoverImage({
  src,
  alt = 'Manga cover',
  width = 32,
  height = 48,
  radius = 'xs',
  fit = 'cover',
  sx,
  className,
}: CoverImageProps) {
  const [hasError, setHasError] = useState(false);

  // Reset error state if src changes
  useEffect(() => {
    setHasError(false);
  }, [src]);

  const isInvalidSrc = !src || src.trim() === '' || src === '/cover-not-found.jpg';

  if (isInvalidSrc || hasError) {
    return (
      <Box
        className={className}
        sx={(theme) => ({
          width,
          height,
          borderRadius:
            radius === 'xs'
              ? theme.radius.xs
              : radius === 'sm'
              ? theme.radius.sm
              : radius === 'md'
              ? theme.radius.md
              : radius === 'lg'
              ? theme.radius.lg
              : radius === 'xl'
              ? theme.radius.xl
              : radius,
          overflow: 'hidden',
          backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[2],
          border: `1px solid ${theme.colorScheme === 'dark' ? theme.colors.dark[4] : theme.colors.gray[3]}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          position: 'relative',
          ...sx,
        })}
      >
        <Image
          src="/kaizen.png"
          alt={alt}
          width="75%"
          height="75%"
          fit="contain"
          withPlaceholder={false}
        />
      </Box>
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      width={width}
      height={height}
      radius={radius}
      fit={fit}
      className={className}
      sx={sx}
      onError={() => setHasError(true)}
      withPlaceholder
      placeholder={
        <Box
          sx={(theme) => ({
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colorScheme === 'dark' ? theme.colors.dark[6] : theme.colors.gray[2],
          })}
        >
          <Image src="/kaizen.png" alt="Kaizen" width="70%" height="70%" fit="contain" />
        </Box>
      }
    />
  );
}
