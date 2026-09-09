import { useEffect, useState } from 'react'

export type CharacterMood = 'idle' | 'happy' | 'surprised'

const POSE_SRC = {
  idle: '/assets/character/idle.webp',
  blink: '/assets/character/blink.webp',
  happy: '/assets/character/happy.webp',
  surprised: '/assets/character/surprised.webp',
} as const

/**
 * Cosmetics: every combination is drawn as a complete figure rather than an overlay on the
 * character. That way an item always sits correctly and the hand holds it properly — overlays
 * produced a second paw and broken outlines.
 *
 * Order matters: the fullest outfit comes first. Clothing adds nothing to the discount; it is
 * visible status, not a reward.
 */
const OUTFITS = [
  {
    itemIds: ['baker-apron', 'chef-knife'],
    src: '/assets/character/outfit-apron-knife.webp',
    happySrc: '/assets/character/outfit-apron-knife-happy.webp',
  },
  {
    itemIds: ['chef-knife'],
    src: '/assets/character/outfit-knife.webp',
    happySrc: '/assets/character/outfit-knife-happy.webp',
  },
  {
    itemIds: ['baker-apron'],
    src: '/assets/character/outfit-apron.webp',
    happySrc: '/assets/character/outfit-apron-happy.webp',
  },
] as const

const BLINK_PAUSE_MIN_MS = 3_200
const BLINK_PAUSE_MAX_MS = 6_400
const BLINK_HOLD_MS = 150

/**
 * Every outfit has its own idle and happy frames. Undressing the character to reach a pose is
 * not allowed: it looks like a glitch. There is no surprised frame for outfits, so idle stays.
 */
function findOutfit(wornItemIds: readonly string[]) {
  const worn = new Set(wornItemIds)
  return OUTFITS.find((outfit) => outfit.itemIds.every((itemId) => worn.has(itemId))) ?? null
}

/**
 * The mascot in the profile header. The pose reflects what is happening with the reward, and
 * blinking only runs in the plain idle state: there is no blinking frame for outfits.
 */
export function ProfileCharacter({
  mood,
  wornItemIds,
}: {
  mood: CharacterMood
  wornItemIds: readonly string[]
}) {
  const [isBlinking, setIsBlinking] = useState(false)
  const outfit = findOutfit(wornItemIds)
  const canBlink = mood === 'idle' && outfit === null

  useEffect(() => {
    if (!canBlink) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let timer = 0
    function pause() {
      return BLINK_PAUSE_MIN_MS + Math.random() * (BLINK_PAUSE_MAX_MS - BLINK_PAUSE_MIN_MS)
    }
    function closeEyes() {
      setIsBlinking(true)
      timer = window.setTimeout(openEyes, BLINK_HOLD_MS)
    }
    function openEyes() {
      setIsBlinking(false)
      timer = window.setTimeout(closeEyes, pause())
    }

    timer = window.setTimeout(closeEyes, pause())
    // Leaving the idle pose clears a pending blink so it does not resurface on return.
    return () => {
      window.clearTimeout(timer)
      setIsBlinking(false)
    }
  }, [canBlink])

  const src = outfit !== null
    ? mood === 'happy' ? outfit.happySrc : outfit.src
    : POSE_SRC[canBlink && isBlinking ? 'blink' : mood]

  return (
    <div className="profile-character" data-mood={mood} data-dressed={outfit !== null}>
      <img alt="Profile game character" className="profile-character-pose" src={src} />
    </div>
  )
}
