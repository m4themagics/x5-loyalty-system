import { useEffect, useState } from 'react'

export type CharacterMood = 'idle' | 'happy' | 'surprised'

const POSE_SRC = {
  idle: '/assets/character/idle.webp',
  blink: '/assets/character/blink.webp',
  happy: '/assets/character/happy.webp',
  surprised: '/assets/character/surprised.webp',
} as const

/**
 * Косметика: каждая комбинация нарисована целой фигурой, а не накладкой поверх персонажа.
 * Так предмет всегда сидит правильно и рука держит его как надо — накладки давали
 * вторую лапу и обрывки контура.
 *
 * Порядок важен: сначала самый полный набор. Одежда ничего не добавляет к скидке,
 * это видимый статус, а не награда.
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
 * У каждой одежды свои кадры покоя и радости. Раздевать персонажа ради позы нельзя:
 * это выглядит как сбой. Отдельного кадра удивления в одежде нет — там остаётся спокойный.
 */
function findOutfit(wornItemIds: readonly string[]) {
  const worn = new Set(wornItemIds)
  return OUTFITS.find((outfit) => outfit.itemIds.every((itemId) => worn.has(itemId))) ?? null
}

/**
 * Маскот в шапке профиля. Поза отражает то, что сейчас происходит с наградой, а моргание
 * работает только в спокойном состоянии без одежды: моргающего кадра в одежде нет.
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
    // Уходя из спокойной позы, гасим незакрытое моргание, чтобы оно не всплыло при возврате.
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
      <img alt="Игровой персонаж профиля" className="profile-character-pose" src={src} />
    </div>
  )
}
