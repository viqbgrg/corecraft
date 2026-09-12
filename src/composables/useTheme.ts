import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

type ThemePreference = 'light' | 'dark' | 'system'
const storageKey = 'corecraft.theme.v1'

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // System preferences still work when browser storage is unavailable.
  }
  return 'system'
}

export function useTheme() {
  const preference = ref<ThemePreference>(readPreference())
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  const systemDark = ref(mediaQuery.matches)
  const resolvedTheme = computed(() =>
    preference.value === 'system' ? (systemDark.value ? 'dark' : 'light') : preference.value,
  )

  watch(
    resolvedTheme,
    (theme) => {
      document.documentElement.dataset.theme = theme
      const canvas = getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', canvas)
    },
    { immediate: true, flush: 'sync' },
  )
  watch(preference, (theme) => {
    try {
      localStorage.setItem(storageKey, theme)
    } catch {
      // Keep the selection active for this visit even if it cannot be saved.
    }
  })

  function syncSystem(event: MediaQueryListEvent) {
    systemDark.value = event.matches
  }
  onMounted(() => mediaQuery.addEventListener('change', syncSystem))
  onUnmounted(() => mediaQuery.removeEventListener('change', syncSystem))

  return { preference, resolvedTheme }
}
