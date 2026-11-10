import { useEffect, useState } from 'react'

export type ScrollVisibility = 'top' | 'up' | 'down'

/**
 * Détecte le sens du défilement pour masquer les barres vers le bas
 * et les réafficher vers le haut.
 */
export function useScrollVisibility(threshold = 6): ScrollVisibility {
  const [visibility, setVisibility] = useState<ScrollVisibility>('top')

  useEffect(() => {
    let lastY = window.scrollY
    let frame = 0

    const onScroll = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(() => {
        const y = window.scrollY
        const delta = y - lastY
        if (y <= 24) {
          setVisibility('top')
        } else if (Math.abs(delta) >= threshold) {
          setVisibility(delta > 0 ? 'down' : 'up')
        }
        lastY = y
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(frame)
    }
  }, [threshold])

  return visibility
}
