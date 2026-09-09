import { Typography } from '@/components/typography'
import { useState } from 'react'

import { navigateHomeScreen, type HomeScreen } from './navigation'
import { ProfileScreen } from './ProfileScreen'

import './pyaterochka-home.css'

const quickActions = [
  { icon: '🍎🧾', label: ['Purchase', 'history'], tone: 'blue' },
  { icon: '⭐', label: ['Rate', 'products'], tone: 'yellow' },
  { icon: '🔥', label: ['My', 'savings'], tone: 'orange' },
  { icon: '🐑', label: ['Win', 'RUB 1,500,000'], tone: 'violet' },
  { icon: '🔪', badge: '5', label: ['Knives', 'for RUB 1'], tone: 'gray' },
] as const

const navigation = [
  { id: 'home', label: 'Home' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'orange', label: 'Orange' },
  { id: 'profile', label: 'Profile' },
] as const

export function PyaterochkaHome() {
  const [screen, setScreen] = useState<HomeScreen>('home')

  const handleNavigation = (target: (typeof navigation)[number]['id']) => {
    const nextScreen = navigateHomeScreen(screen, target)
    if (nextScreen === screen) return
    window.scrollTo(0, 0)
    setScreen(nextScreen)
  }

  return (
    <div className="pyaterochka-app">
      {screen === 'home' ? (
        <>
          <main className="app-content">
        <section className="sky-section" aria-label="Loyalty card">
          <div className="cloud cloud-left" />
          <div className="cloud cloud-right" />

          <header className="mobile-header">
            <div className="status-row" aria-label="Status bar">
              <Typography as="span" variant="body" className="status-time">
                14:12
              </Typography>
              <LocationArrow />
              <div className="status-network">
                <SignalBars />
                <Typography as="span" variant="body" className="status-lte">
                  LTE
                </Typography>
                <div className="battery">
                  <Typography as="span" variant="body" className="battery-value">
                    78
                  </Typography>
                </div>
              </div>
            </div>

            <div className="location-row">
              <div className="round-switch faded" aria-hidden="true">
                <WalkingIcon />
              </div>
              <button className="round-switch store" type="button" aria-label="Choose a store">
                <StoreIcon />
              </button>
              <Typography as="span" variant="body" className="location-name">
                St Petersb... 4 bldg A
              </Typography>
              <ChevronRight />
              <div className="header-actions">
                <button type="button" aria-label="Notifications">
                  <BellIcon />
                </button>
                <button type="button" aria-label="Help">
                  <HelpIcon />
                </button>
              </div>
            </div>
          </header>

          <div className="cards-viewport">
            <div className="cards-track">
              <LoyaltyCard />
              <OrangeCard />
            </div>
          </div>

          <div className="character-promo">
            <BlueRabbit />
            <div className="character-copy">
              <Typography as="span" variant="body" className="character-title">
                Smeshariki
              </Typography>
              <Typography as="span" variant="body" className="character-subtitle">
                As a gift
              </Typography>
            </div>
            <Typography as="span" variant="body" className="butterfly" aria-hidden="true">🦋</Typography>
            <button className="want-button" type="button">
              <Typography as="span" variant="body" className="want-label">
                I want it
              </Typography>
              <ChevronRight />
            </button>
          </div>
          <div className="meadow" aria-hidden="true">
            <Typography as="span" variant="body">🌼</Typography>
          </div>
        </section>

        <section className="quick-panel" aria-label="Quick actions">
          <div className="quick-list">
            {quickActions.map((action) => (
              <button className="quick-action" type="button" key={action.label.join('-')}>
                <span className={`quick-icon quick-icon-${action.tone}`} aria-hidden="true">
                  <Typography as="span" variant="body" className="quick-emoji">{action.icon}</Typography>
                  {'badge' in action ? <Typography as="span" variant="body" className="quick-badge">{action.badge}</Typography> : null}
                </span>
                <Typography as="span" variant="body" className="quick-label">
                  {action.label[0]}
                  <br />
                  {action.label[1]}
                </Typography>
              </button>
            ))}
          </div>
        </section>

        <section className="offers-section" aria-label="Collections and offers">
          <div className="offer-peek" aria-hidden="true" />
          <article className="season-offer">
            <div className="offer-pattern" aria-hidden="true" />
            <Typography as="h2" variant="h2" className="offer-title">
              Golden season
              <br />
              of savings
            </Typography>
            <Typography as="span" variant="body" className="offer-subtitle">
              Up to 40% off
            </Typography>
            <button className="selection-button" type="button">
              <Typography as="span" variant="body" className="selection-label">
                See selection
              </Typography>
            </button>
            <div className="products-illustration" aria-hidden="true">
              <Typography as="span" variant="body" className="leaf leaf-one">🍂</Typography>
              <Typography as="span" variant="body" className="leaf leaf-two">🍁</Typography>
              <div className="pickle-pack">
                <Typography as="span" variant="body">Ryaba</Typography>
                <Typography as="small" variant="bodyXs">pickles</Typography>
              </div>
              <div className="meat-pack">
                <Typography as="span" variant="body">Deli</Typography>
                <Typography as="small" variant="bodyXs">pork loin</Typography>
              </div>
              <PriceTag className="price-one" price="159" />
              <PriceTag className="price-two" price="169" />
            </div>
          </article>

          <div className="round-offers" aria-hidden="true">
            <Typography as="span" variant="body" className="round-offer orange">🍊</Typography>
            <Typography as="span" variant="body" className="round-offer purple">Berry</Typography>
            <Typography as="span" variant="body" className="round-offer cream">🥛</Typography>
            <Typography as="span" variant="body" className="round-offer lime">🥗</Typography>
          </div>
        </section>
          </main>

          <div className="floating-coupon">
            <Typography as="span" variant="body" className="coupon-icon" aria-hidden="true">%</Typography>
            <Typography as="span" variant="body" className="coupon-copy">
              Promo code −RUB 500 on orders over RUB 1,000 •
            </Typography>
            <Typography as="strong" variant="emphasis" className="coupon-code">
              RAYS500
            </Typography>
          </div>
        </>
      ) : (
        <ProfileScreen />
      )}

      <nav className="bottom-nav" aria-label="Main navigation">
        {navigation.map((item) => (
          <button
            aria-current={item.id === screen ? 'page' : undefined}
            className={`nav-item ${item.id === screen ? 'active' : ''}`}
            key={item.id}
            onClick={() => handleNavigation(item.id)}
            type="button"
          >
            <NavIcon name={item.id} />
            <Typography as="span" variant="body" className="nav-label">
              {item.label}
            </Typography>
          </button>
        ))}
      </nav>
    </div>
  )
}

function LoyaltyCard() {
  return (
    <article className="loyalty-card">
      <div className="loyalty-main">
        <Typography as="span" variant="body" className="x5-brand">
          <Typography as="strong" variant="emphasis" className="x5-brand-bold">X5</Typography>Club ›
        </Typography>
        <div className="points-row">
          <Typography as="span" variant="body" className="points-value">1 034</Typography>
          <span className="x5-symbol" aria-hidden="true" />
        </div>
        <Typography as="span" variant="body" className="points-money">RUB 103.40</Typography>
        <QrCode />
      </div>
      <div className="loyalty-footer">
        <div className="loyalty-benefit">
          <Typography as="span" variant="body" className="benefit-icon" aria-hidden="true">↩</Typography>
          <div>
            <Typography as="span" variant="body" className="benefit-title">Cashback</Typography>
            <Typography as="span" variant="body" className="benefit-value">1%</Typography>
          </div>
        </div>
        <div className="loyalty-benefit categories">
          <Typography as="span" variant="body" className="benefit-icon" aria-hidden="true">♣</Typography>
          <div>
            <Typography as="span" variant="body" className="benefit-title">Favourite categories</Typography>
            <Typography as="span" variant="body" className="benefit-value">3 up to 18%</Typography>
          </div>
        </div>
      </div>
    </article>
  )
}

function OrangeCard() {
  return (
    <article className="orange-card">
      <Typography as="span" variant="body" className="orange-brand">◒ orange</Typography>
      <Typography as="span" variant="body" className="orange-copy">7% cashback<br />on purchases&nbsp; ❕</Typography>
      <button type="button" className="return-button">
        <Typography as="span" variant="body" className="return-label">Return</Typography>
      </button>
    </article>
  )
}

function PriceTag({ className, price }: { className: string; price: string }) {
  return (
    <span className={`price-tag ${className}`}>
      <Typography as="span" variant="body" className="price-value">{price}</Typography>
      <Typography as="sup" variant="bodyXs">90</Typography>
    </span>
  )
}

function QrCode() {
  const size = 29
  const cells: Array<{ x: number; y: number }> = []
  const inFinder = (x: number, y: number, ox: number, oy: number) =>
    x >= ox && x < ox + 7 && y >= oy && y < oy + 7
  const finderOn = (x: number, y: number, ox: number, oy: number) => {
    const dx = x - ox
    const dy = y - oy
    return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4)
  }

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const finders = [[0, 0], [22, 0], [0, 22]] as const
      const finder = finders.find(([ox, oy]) => inFinder(x, y, ox, oy))
      const on = finder
        ? finderOn(x, y, finder[0], finder[1])
        : ((x * 17 + y * 13 + x * y * 3 + (x ^ y)) % 7 < 3)
      if (on) cells.push({ x, y })
    }
  }

  return (
    <div className="qr-shell" aria-label="Loyalty card QR code">
      <svg viewBox="0 0 29 29" role="img" aria-hidden="true">
        {cells.map((cell) => <rect key={`${cell.x}-${cell.y}`} x={cell.x} y={cell.y} width="1" height="1" />)}
      </svg>
    </div>
  )
}

function BlueRabbit() {
  return (
    <svg className="blue-rabbit" viewBox="0 0 118 137" aria-hidden="true">
      <path fill="#75d6ef" stroke="#26738d" strokeWidth="3" d="M45 70C34 43 32 7 42 4c10-3 13 29 15 50C61 27 72-1 80 4c8 5-2 42-9 64 20 5 31 23 26 43-6 22-34 31-57 20-20-9-27-31-17-46 5-8 12-13 22-15Z" />
      <ellipse cx="60" cy="91" rx="35" ry="33" fill="#86e2f3" />
      <ellipse cx="45" cy="84" rx="6" ry="9" fill="white" /><ellipse cx="69" cy="84" rx="6" ry="9" fill="white" />
      <circle cx="47" cy="86" r="3" /><circle cx="67" cy="86" r="3" />
      <ellipse cx="57" cy="96" rx="7" ry="5" fill="#ec3975" />
      <path d="M45 102q13 17 27 0" fill="white" stroke="#7e2454" strokeWidth="3" />
      <path d="M30 70q27-13 55 0" fill="none" stroke="#4d246f" strokeWidth="7" />
      <path d="M30 68l18 5 3-13-19-3Z M62 60l4 13 19-5-3-11Z" fill="#342238" stroke="#4d246f" strokeWidth="3" />
    </svg>
  )
}

function SignalBars() {
  return <svg className="signal-bars" viewBox="0 0 28 18" aria-hidden="true"><rect x="1" y="11" width="4" height="6" rx="2"/><rect x="8" y="7" width="4" height="10" rx="2"/><rect x="15" y="3" width="4" height="14" rx="2"/><rect x="22" y="0" width="4" height="17" rx="2" opacity=".28"/></svg>
}

function LocationArrow() {
  return <svg className="location-arrow" viewBox="0 0 18 18" aria-hidden="true"><path d="M1 7.5 16 1l-6.5 15-2.2-6.1L1 7.5Z" fill="currentColor"/></svg>
}

function StoreIcon() {
  return <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 4h18l2 7c0 2-1.5 3.5-3.4 3.5-1.3 0-2.4-.7-3-1.8-.5 1.1-1.6 1.8-3 1.8s-2.5-.7-3-1.8c-.6 1.1-1.7 1.8-3 1.8C7.6 14.5 6 13 6 11L5 4Zm3 12h14v8H8v-8Zm4 2v6h6v-6h-6Z" fill="currentColor"/></svg>
}

function WalkingIcon() {
  return <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="17" cy="5" r="3" fill="currentColor"/><path d="m12 10 5-2 3 5 4 2-1 3-5-2-2-3-2 6-5 6-2-2 4-6 1-4-4 2-2 5-3-1 3-8 6-2Z" fill="currentColor"/></svg>
}

function BellIcon() {
  return <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 25a3 3 0 0 0 3-3h-6a3 3 0 0 0 3 3Zm9-6-2-3v-5c0-4-2.3-7-5.8-7.8V2h-2.4v1.2C9.3 4 7 7 7 11v5l-2 3v2h18v-2Z" fill="currentColor"/></svg>
}

function HelpIcon() {
  return <svg viewBox="0 0 28 28" aria-hidden="true"><path d="M14 2C7 2 4 7 4 13c0 4 2 7 5 9l2 4 3-3c7 0 10-4 10-10S21 2 14 2Z" fill="currentColor"/><path d="M12 18h3v3h-3v-3Zm.2-3.2c0-3.2 3.8-3.2 3.8-5.1 0-1-.8-1.6-2-1.6-1.2 0-2 .8-2.5 1.7L9.2 8.4C10.2 6.5 11.9 5 14.5 5 17.3 5 19 6.7 19 9c0 3.2-3.7 3.6-3.7 5.8h-3.1Z" fill="white"/></svg>
}

function ChevronRight() {
  return <svg className="chevron" viewBox="0 0 12 20" aria-hidden="true"><path d="m2 2 7 8-7 8" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
}

function NavIcon({ name }: { name: string }) {
  if (name === 'home') return <svg viewBox="0 0 28 28" aria-hidden="true"><path d="m3 13 11-9 11 9v11a2 2 0 0 1-2 2h-6v-8h-6v8H5a2 2 0 0 1-2-2V13Z" fill="currentColor"/></svg>
  if (name === 'catalog') return <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="currentColor"/><path d="m18 18 7 6M8 10h8M8 14h5" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></svg>
  if (name === 'orange') return <svg viewBox="0 0 28 28" aria-hidden="true"><rect x="3" y="7" width="22" height="16" rx="3" fill="currentColor"/><rect x="6" y="11" width="16" height="3" rx="1.5" fill="white"/></svg>
  return <svg viewBox="0 0 28 28" aria-hidden="true"><circle cx="14" cy="9" r="6" fill="currentColor"/><path d="M3 26c1-6 5-9 11-9s10 3 11 9H3Z" fill="currentColor"/></svg>
}
