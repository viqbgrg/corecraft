import { computed, ref } from 'vue'

const key = 'corecraft.progress.v1'
interface Completion {
  completedAt: string
}
function read(): Record<string, Completion> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, Completion] => {
        const v: unknown = entry[1]
        return (
          typeof v === 'object' &&
          v !== null &&
          'completedAt' in v &&
          typeof v.completedAt === 'string' &&
          Number.isFinite(Date.parse(v.completedAt))
        )
      }),
    )
  } catch {
    return {}
  }
}
const completions = ref<Record<string, Completion>>(read())
const persistent = ref(true)
export function useProgress() {
  function complete(id: string) {
    completions.value = { ...completions.value, [id]: { completedAt: new Date().toISOString() } }
    try {
      localStorage.setItem(key, JSON.stringify(completions.value))
    } catch {
      persistent.value = false
    }
  }
  return { completions, completedIds: computed(() => Object.keys(completions.value)), complete, persistent }
}
