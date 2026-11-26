import { useCallback, useEffect, useState } from 'react'
import type { ModelRuntimeStatus } from '../types'
import { modelManager } from '../ai/models/modelManager'

export function useModelStatus() {
  const [statuses, setStatuses] = useState<ModelRuntimeStatus[]>(() =>
    modelManager.getStatuses(),
  )

  const refresh = useCallback(() => {
    setStatuses(modelManager.getStatuses())
  }, [])

  useEffect(() => {
    return modelManager.onStatus(() => {
      setStatuses(modelManager.getStatuses())
    })
  }, [])

  const getStatus = (modelId: string): ModelRuntimeStatus | undefined =>
    statuses.find((status) => status.modelId === modelId)

  return { statuses, getStatus, refresh }
}
