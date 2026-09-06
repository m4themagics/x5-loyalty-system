import { useEffect, useState } from 'react'

export type CharacterMood = 'idle' | 'happy' | 'surprised'

const POSE_SRC = {
  idle: '/assets/character/idle.webp',
  blink: '/assets/character/blink.webp',
  happy: '/assets/character/happy.webp',
  surprised: '/assets/character/surprised.webp',
} as const

/**
 * Косметика поверх персонажа. Накладки нарисованы на том же холсте, что и позы, поэтому слои
 * просто складываются стопкой и не требуют вычисления координат.
 *
 * Носибельны только три предмета каталога: остальные двадцать один — техника и посуда.
 * Одежда ничего не добавляет к скидке. Это видимый статус, а не награда: ценность выдачи
 * определяется рецептом, а не внешним видом персонажа.
 */
const WEARABLES = [
  { itemId: 'baker-apron', src: '/assets/character/wear/baker-apron.webp', needsFreeHands: false },
  { itemId: 'chef-knife', src: '/assets/character/wear/chef-knife.webp', needsFreeHands: true },
  { itemId: 'golden-chef-hat', src: '/assets/character/wear/golden-chef-hat.webp', needsFreeHands: false },
] as const

const BLINK_PAUSE_MIN_MS = 3_200
const BLINK_PAUSE_MAX_MS = 6_400
const BLINK_HOLD_MS = 150

/**
 * Маскот в шапке профиля. Поза отражает то, что сейчас происходит с наградой, а моргание
 * работает только в спокойном состоянии, чтобы не спорить с радостью и удивлением.
 */
export function ProfileCharacter({
  mood,
  ownedItemIds,
}: {
  mood: CharacterMood
  ownedItemIds: readonly string[]
}) {
  const [isBlinking, setIsBlinking] = useState(false)

  useEffect(() => {
    if (mood !== 'idle') return
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
  }, [mood])

  const owned = new Set(ownedItemIds)
  // Предмет в лапе рисуется только в спокойной позе: в радости и удивлении руки заняты.
  const worn = WEARABLES.filter((wearable) =>
    owned.has(wearable.itemId) && (!wearable.needsFreeHands || mood === 'idle'))

  return (
    <div className="profile-character" data-mood={mood}>
      <img
        alt="Игровой персонаж профиля"
        className="profile-character-pose"
        src={POSE_SRC[mood === 'idle' && isBlinking ? 'blink' : mood]}
      />
      {worn.map((wearable) => (
        <img
          alt=""
          aria-hidden="true"
          className="profile-character-wear"
          key={wearable.itemId}
          src={wearable.src}
        />
      ))}
    </div>
  )
}
