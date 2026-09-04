export type HomeScreen = 'home' | 'profile'
export type HomeNavigationTarget = HomeScreen | 'catalog' | 'orange'

export function navigateHomeScreen(
  currentScreen: HomeScreen,
  target: HomeNavigationTarget,
): HomeScreen {
  if (target === 'home' || target === 'profile') return target
  return currentScreen
}
