import { useEffect, useRef, useCallback, useState } from 'react'
import { useLocalStorage } from '@/hooks/use-local-storage'

export interface AutoRefreshSettings {
  enabled: boolean
  intervalMinutes: number
}

const DEFAULT_SETTINGS: AutoRefreshSettings = {
  enabled: false,
  intervalMinutes: 20
}

export function useAutoRefresh(
  onRefresh: () => Promise<void>,
  settings?: AutoRefreshSettings
) {
  const [autoRefreshSettings, setAutoRefreshSettings] = useLocalStorage<AutoRefreshSettings>(
    'auto-refresh-settings',
    DEFAULT_SETTINGS
  )
  const [nextRefreshTime, setNextRefreshTime] = useLocalStorage<number>('next-refresh-time', 0)
  const [, setTick] = useState(0)
  const intervalRef = useRef<number | null>(null)
  const currentSettings = settings || autoRefreshSettings || DEFAULT_SETTINGS

  const scheduleNextRefresh = useCallback(() => {
    const intervalMs = currentSettings.intervalMinutes * 60 * 1000
    const nextTime = Date.now() + intervalMs
    setNextRefreshTime(nextTime)
  }, [currentSettings.intervalMinutes, setNextRefreshTime])

  const executeRefresh = useCallback(async () => {
    if (!currentSettings.enabled) return
    
    try {
      await onRefresh()
      scheduleNextRefresh()
    } catch (error) {
      console.error('Auto-refresh failed:', error)
      scheduleNextRefresh()
    }
  }, [currentSettings.enabled, onRefresh, scheduleNextRefresh])

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }

    if (!currentSettings.enabled) {
      setNextRefreshTime(0)
      return
    }

    if (!nextRefreshTime || nextRefreshTime < Date.now()) {
      scheduleNextRefresh()
    }

    const checkInterval = setInterval(() => {
      setTick(t => t + 1)
      
      if (nextRefreshTime && Date.now() >= nextRefreshTime) {
        executeRefresh()
      }
    }, 1000)

    intervalRef.current = checkInterval as unknown as number

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [currentSettings.enabled, nextRefreshTime, executeRefresh, scheduleNextRefresh, setNextRefreshTime])

  const getTimeUntilNextRefresh = useCallback((): string => {
    if (!currentSettings.enabled || !nextRefreshTime) return 'Disabled'
    
    const now = Date.now()
    const diff = nextRefreshTime - now
    
    if (diff < 0) return 'Refreshing soon...'
    
    const minutes = Math.floor(diff / 60000)
    const seconds = Math.floor((diff % 60000) / 1000)
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`
    }
    return `${seconds}s`
  }, [currentSettings.enabled, nextRefreshTime])

  const toggleAutoRefresh = useCallback((enabled: boolean) => {
    setAutoRefreshSettings((current) => ({
      ...(current || DEFAULT_SETTINGS),
      enabled
    }))
    if (enabled) {
      scheduleNextRefresh()
    } else {
      setNextRefreshTime(0)
    }
  }, [setAutoRefreshSettings, scheduleNextRefresh, setNextRefreshTime])

  const updateInterval = useCallback((minutes: number) => {
    setAutoRefreshSettings((current) => ({
      ...(current || DEFAULT_SETTINGS),
      intervalMinutes: minutes
    }))
    if (currentSettings.enabled) {
      scheduleNextRefresh()
    }
  }, [setAutoRefreshSettings, currentSettings.enabled, scheduleNextRefresh])

  return {
    settings: currentSettings,
    nextRefreshTime,
    getTimeUntilNextRefresh,
    toggleAutoRefresh,
    updateInterval,
    scheduleNextRefresh
  }
}
