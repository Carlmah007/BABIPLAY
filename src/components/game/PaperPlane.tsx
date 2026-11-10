import { useEffect, useRef } from 'react'
import lottie, { type AnimationItem } from 'lottie-web/build/player/lottie_light'
import planeAnimation from '../../assets/paper-plane.json'

interface PaperPlaneProps {
  playing?: boolean
  size?: number
  className?: string
}

/** Animation Lottie « avion en papier » utilisée dans Aviator. */
export function PaperPlane({ playing = true, size = 96, className }: PaperPlaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<AnimationItem | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const animation = lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      animationData: planeAnimation,
    })
    animationRef.current = animation
    return () => {
      animation.destroy()
      animationRef.current = null
    }
  }, [])

  useEffect(() => {
    const animation = animationRef.current
    if (!animation) return
    if (playing) animation.play()
    else animation.pause()
  }, [playing])

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className={className}
      style={{ width: size, height: size }}
    />
  )
}
