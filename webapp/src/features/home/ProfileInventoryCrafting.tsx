import { Typography } from '@/components/typography'
import {
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  getCraftingGuidance,
  previewCraftedDiscount,
} from './profile-discount-crafting'
import type { InventoryEntry } from './profile-inventory'
import { profileItems, type ItemRarity } from './profile-items'

const SLOT_COUNT = 4
const rarityLabels: Record<ItemRarity, string> = {
  common: 'Обычный',
  epic: 'Эпический',
  legendary: 'Легендарный',
}

type DragState = {
  itemId: string
  pointerId: number
  startX: number
  startY: number
  x: number
  y: number
  dragging: boolean
}

type ProfileInventoryCraftingProps = {
  inventory: readonly InventoryEntry[]
  onCraft: (itemIds: readonly string[]) => void
  /** Пока активна скидка, второй купон собрать нельзя: ячейки прячем, инвентарь оставляем. */
  craftingDisabled?: boolean
}

export function ProfileInventoryCrafting({
  inventory,
  onCraft,
  craftingDisabled = false,
}: ProfileInventoryCraftingProps) {
  const [slots, setSlots] = useState<(string | null)[]>(
    Array.from({ length: SLOT_COUNT }, () => null),
  )
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const dragStateRef = useRef<DragState | null>(null)
  const suppressClickRef = useRef(false)
  const filledItemIds = slots.filter((itemId): itemId is string => itemId !== null)
  const guidance = useMemo(() => getCraftingGuidance(filledItemIds), [filledItemIds])
  const preview = useMemo(
    () => previewCraftedDiscount(filledItemIds),
    [filledItemIds],
  )

  const equippedCount = (itemId: string) => slots.filter(
    (slotItemId) => slotItemId === itemId,
  ).length
  const availableCount = (itemId: string) => (
    inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0
  ) - equippedCount(itemId)

  const putItemIntoSlot = (itemId: string, slotIndex: number) => {
    const currentSlotItem = slots[slotIndex]
    if (currentSlotItem === itemId) return
    if (availableCount(itemId) <= 0) return

    setSlots((currentSlots) => currentSlots.map((slotItemId, index) =>
      index === slotIndex ? itemId : slotItemId))
    setSelectedItemId(null)
  }

  const handleSlotClick = (slotIndex: number) => {
    if (selectedItemId !== null) {
      putItemIntoSlot(selectedItemId, slotIndex)
      return
    }

    setSlots((currentSlots) => currentSlots.map((itemId, index) =>
      index === slotIndex ? null : itemId))
  }

  const dropDesktopItem = (
    event: ReactDragEvent<HTMLButtonElement>,
    slotIndex: number,
  ) => {
    event.preventDefault()
    const itemId = event.dataTransfer.getData('application/x-pyaterochka-item')
    if (itemId !== '') putItemIntoSlot(itemId, slotIndex)
    suppressClickRef.current = false
    cancelDrag()
  }

  const beginDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    itemId: string,
  ) => {
    if (availableCount(itemId) <= 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const nextDragState = {
      itemId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    }
    dragStateRef.current = nextDragState
    setDragState(nextDragState)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const currentDragState = dragStateRef.current
    if (currentDragState === null || currentDragState.pointerId !== event.pointerId) return
    const distance = Math.hypot(
      event.clientX - currentDragState.startX,
      event.clientY - currentDragState.startY,
    )
    const nextDragState = {
      ...currentDragState,
      x: event.clientX,
      y: event.clientY,
      dragging: currentDragState.dragging || distance > 8,
    }
    if (nextDragState.dragging) suppressClickRef.current = true
    dragStateRef.current = nextDragState
    setDragState(nextDragState)
  }

  const finishDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const currentDragState = dragStateRef.current
    if (currentDragState?.dragging) {
      const target = document.elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-discount-slot]')
      const slotIndex = Number(target?.dataset.discountSlot)
      if (Number.isInteger(slotIndex)) {
        putItemIntoSlot(currentDragState.itemId, slotIndex)
      }
    }
    dragStateRef.current = null
    setDragState(null)
  }

  const cancelDrag = () => {
    dragStateRef.current = null
    setDragState(null)
  }

  const handleInventoryClick = (itemId: string) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false
      return
    }
    setInspectedItemId(itemId)
  }

  const inspectedItem = inspectedItemId === null
    ? null
    : profileItems.find((item) => item.id === inspectedItemId) ?? null

  const chooseInspectedItem = () => {
    if (inspectedItem === null || availableCount(inspectedItem.id) <= 0) return
    setSelectedItemId(inspectedItem.id)
    setInspectedItemId(null)
  }

  const createDiscount = () => {
    if (preview === null) return
    onCraft(filledItemIds)
    setSlots(Array.from({ length: SLOT_COUNT }, () => null))
    setSelectedItemId(null)
  }

  const draggedItem = dragState === null
    ? null
    : profileItems.find((item) => item.id === dragState.itemId) ?? null

  if (inventory.length === 0) {
    // Пустые сетки занимали пол-экрана и ничего не сообщали: показываем одну строку.
    return (
      <section className="profile-section equipment-section" aria-labelledby="equipment-title">
        <div className="collection-empty">
          <img alt="" src="/assets/pyaterochka-cardboard-chest.webp" />
          <div>
            <Typography as="h2" variant="h2" className="section-title" id="equipment-title">
              Коллекция пока пуста
            </Typography>
            <Typography as="span" variant="bodyXs" className="section-hint">
              Сюда попадают предметы из коробок и награды за задания. Четыре предмета одного
              набора превращаются в скидку.
            </Typography>
          </div>
        </div>
      </section>
    )
  }

  return (
    <>
      {craftingDisabled ? null : (
      <section className="profile-section equipment-section" aria-labelledby="equipment-title">
        <div className="profile-section-heading">
          <div>
            <Typography as="h2" variant="h2" className="section-title" id="equipment-title">
              Ячейки скидок
            </Typography>
            <Typography as="span" variant="bodyXs" className="section-hint">
              Собери 4 предмета
            </Typography>
          </div>
          <Typography as="span" variant="bodyXs" className="slots-counter">
            {filledItemIds.length}/{SLOT_COUNT}
          </Typography>
        </div>

        <Typography
          as="div"
          variant="body"
          aria-label={`${filledItemIds.length} из ${SLOT_COUNT} ячеек скидки заполнено`}
          className="empty-slots equipment-slots"
        >
          {slots.map((itemId, index) => {
            const item = profileItems.find((candidate) => candidate.id === itemId)
            return (
              <button
                aria-label={item === undefined
                  ? `Пустая ячейка скидки ${index + 1}`
                  : `${item.name} в ячейке ${index + 1}. Нажмите, чтобы убрать`}
                className={`discount-slot${item === undefined ? ' empty-slot' : ` filled-slot item-rarity-${item.rarity}`}`}
                data-discount-slot={index}
                key={index}
                onClick={() => handleSlotClick(index)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => dropDesktopItem(event, index)}
                type="button"
              >
                {item === undefined ? null : <img alt="" src={item.iconSrc} />}
              </button>
            )
          })}
        </Typography>

        <div className={`crafting-guidance${guidance.matchedCount >= 3 ? ' crafting-guidance-active' : ''}`}>
          <div>
            <Typography as="strong" variant="bodySmMedium" className="crafting-guidance-title">
              {preview?.title ?? guidance.title}
            </Typography>
            <Typography as="span" variant="bodyXs" className="crafting-guidance-copy">
              {preview === null
                ? guidance.description
                : `${preview.category} · сила ${preview.rarityScore}/12${preview.synergyBonus > 0 ? ` · бонус +${preview.synergyBonus}%` : ''}`}
            </Typography>
          </div>
          {preview === null && guidance.suggestedItemIds.length > 0 ? (
            <div className="crafting-suggestions" aria-label="Подходящие предметы">
              {guidance.suggestedItemIds.map((itemId) => {
                const item = profileItems.find((candidate) => candidate.id === itemId)
                return item === undefined ? null : (
                  <img alt={item.name} key={item.id} src={item.iconSrc} />
                )
              })}
            </div>
          ) : null}
        </div>

        <button
          className="create-discount-button"
          disabled={preview === null}
          onClick={createDiscount}
          type="button"
        >
          <Typography as="span" variant="control" className="create-discount-label">
            {preview === null ? `Добавьте ещё ${SLOT_COUNT - filledItemIds.length}` : `Создать скидку ${preview.percent}%`}
          </Typography>
        </button>
      </section>
      )}

      <section className="profile-section inventory-section" aria-labelledby="inventory-title">
        <div className="profile-section-heading">
          <div>
            <Typography as="h2" variant="h2" className="section-title" id="inventory-title">
              Инвентарь
            </Typography>
            <Typography as="span" variant="bodyXs" className="section-hint">
              Полученные вами предметы, которые можно использовать для создания скидки.
            </Typography>
          </div>
          <Typography as="span" variant="bodyXs" className="slots-counter">
            {inventory.length}/{profileItems.length}
          </Typography>
        </div>

        <Typography
          as="div"
          variant="body"
          aria-label={`Инвентарь: ${inventory.length} из ${profileItems.length} предметов`}
          className="empty-slots inventory-slots"
        >
          {inventory.map((entry) => {
            const item = profileItems.find((candidate) => candidate.id === entry.itemId)
            if (item === undefined) return null
            const available = availableCount(item.id)
            return (
              <button
                aria-label={`${item.name}, ${rarityLabels[item.rarity]}, доступно ${available} из ${entry.quantity}`}
                aria-pressed={selectedItemId === item.id}
                className={`inventory-item item-rarity-${item.rarity}${selectedItemId === item.id ? ' inventory-item-selected' : ''}${available <= 0 ? ' inventory-item-unavailable' : ''}`}
                draggable={available > 0}
                key={item.id}
                onClick={() => handleInventoryClick(item.id)}
                onPointerCancel={cancelDrag}
                onPointerDown={(event) => beginDrag(event, item.id)}
                onPointerMove={moveDrag}
                onPointerUp={finishDrag}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('application/x-pyaterochka-item', item.id)
                }}
                onDragEnd={() => {
                  suppressClickRef.current = false
                  cancelDrag()
                }}
                type="button"
              >
                <img alt="" src={item.iconSrc} />
                <Typography as="span" variant="bodyXs" className="inventory-item-count">
                  {available}/{entry.quantity}
                </Typography>
              </button>
            )
          })}
          {Array.from({ length: Math.max(0, 8 - inventory.length) }, (_, index) => (
            <span className="empty-slot" aria-label={`Пустая ячейка ${index + 1}`} key={index} />
          ))}
        </Typography>
      </section>

      {dragState?.dragging && draggedItem !== null ? (
        <div
          aria-hidden="true"
          className={`dragged-item-preview item-rarity-${draggedItem.rarity}`}
          style={{ left: dragState.x, top: dragState.y }}
        >
          <img alt="" src={draggedItem.iconSrc} />
        </div>
      ) : null}

      {inspectedItem !== null ? (
        <div
          aria-label={`Предмет «${inspectedItem.name}»`}
          aria-modal="true"
          className="inventory-item-overlay"
          role="dialog"
        >
          <div className={`inventory-item-card item-rarity-${inspectedItem.rarity}`}>
            <button
              aria-label="Закрыть описание предмета"
              className="inventory-item-card-close"
              onClick={() => setInspectedItemId(null)}
              type="button"
            >
              <Typography as="span" variant="body" aria-hidden="true">×</Typography>
            </button>
            <div className="inventory-item-card-icon">
              <img alt="" src={inspectedItem.iconSrc} />
            </div>
            <Typography as="span" variant="bodyXs" className="inventory-item-card-rarity">
              {rarityLabels[inspectedItem.rarity]}
            </Typography>
            <Typography as="h3" variant="h2" className="inventory-item-card-name">
              {inspectedItem.name}
            </Typography>
            <Typography as="p" variant="bodySm" className="inventory-item-card-description">
              {inspectedItem.description}
            </Typography>
            <button
              className="inventory-item-card-action"
              disabled={availableCount(inspectedItem.id) <= 0}
              onClick={chooseInspectedItem}
              type="button"
            >
              <Typography as="span" variant="control">
                {availableCount(inspectedItem.id) > 0 ? 'Выбрать предмет' : 'Все копии уже в ячейках'}
              </Typography>
            </button>
            <Typography as="span" variant="bodyXs" className="inventory-item-card-hint">
              После выбора нажмите на свободную ячейку
            </Typography>
          </div>
        </div>
      ) : null}
    </>
  )
}
