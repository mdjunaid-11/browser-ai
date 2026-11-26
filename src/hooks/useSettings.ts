import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  AppSettings,
  DeviceAssessment,
  DeviceCapabilities,
  OperatingMode,
} from '../types'
import { assessDevice } from '../ai/models/modelCompatibility'
import {
  detectDeviceCapabilities,
} from '../services/device/deviceCapabilities'
import {
  applyTheme,
  clearSettings,
  createDefaultSettings,
  loadSettings,
  normalizeSettings,
  saveSettings,
  settingsForMode,
} from '../services/storage/settings'

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings())
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null)
  const [detecting, setDetecting] = useState(true)
  const [detectionError, setDetectionError] = useState<string | null>(null)

  const detect = useCallback(async () => {
    setDetecting(true)
    setDetectionError(null)
    try {
      const caps = await detectDeviceCapabilities()
      setCapabilities(caps)
    } catch (error) {
      setDetectionError(
        error instanceof Error
          ? error.message
          : 'Device capabilities could not be detected.',
      )
    } finally {
      setDetecting(false)
    }
  }, [])

  useEffect(() => {
    // Device detection must start once on mount; state is owned by this hook.
    // eslint-disable-next-line react/set-state-in-effect
    void detect()
  }, [detect])

  useEffect(() => {
    saveSettings(settings)
    applyTheme(settings.theme)
    document.documentElement.dataset.reduceMotion = settings.reduceMotion
      ? 'true'
      : 'false'
  }, [settings])

  useEffect(() => {
    if (settings.theme !== 'system') return
    let media: MediaQueryList
    try {
      media = window.matchMedia('(prefers-color-scheme: light)')
    } catch {
      return
    }
    const listener = () => applyTheme('system')
    media.addEventListener?.('change', listener)
    return () => media.removeEventListener?.('change', listener)
  }, [settings.theme])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((previous) => normalizeSettings({ ...previous, ...patch }))
  }, [])

  const setMode = useCallback(
    (mode: OperatingMode) => {
      setSettings((previous) =>
        settingsForMode(mode, capabilities, previous),
      )
    },
    [capabilities],
  )

  const resetSettings = useCallback(() => {
    clearSettings()
    setSettings(createDefaultSettings())
  }, [])

  const completeOnboarding = useCallback(() => {
    setSettings((previous) => ({ ...previous, onboarded: true }))
  }, [])

  const assessment: DeviceAssessment | null = useMemo(
    () => (capabilities ? assessDevice(capabilities) : null),
    [capabilities],
  )

  return {
    settings,
    setSettings,
    updateSettings,
    setMode,
    resetSettings,
    completeOnboarding,
    capabilities,
    assessment,
    detecting,
    detectionError,
    refreshCapabilities: detect,
  }
}
