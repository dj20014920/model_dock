/**
 * LM Arena 설정 컴포넌트
 * 사용자가 모드와 모델을 선택할 수 있는 UI 제공
 */

import { FC, useState, useEffect } from 'react'
import { LMARENA_MODELS, type LMArenaModel, type LMArenaMode } from '~app/bots/lmarena'
import { fetchAvailableModels, groupModelsByOrganization } from '~app/bots/lmarena/api'
import type { ModelInfo } from '~app/bots/lmarena/api'
import { startAutoSync, forceSyncModels, getSyncStatus } from '~app/bots/lmarena/sync'
import type { SyncStatus } from '~app/bots/lmarena/sync'

interface LMArenaSettingsProps {
  onModeChange: (mode: LMArenaMode) => void
  onModelChange: (model: LMArenaModel) => void
  onModelAChange: (model: LMArenaModel) => void
  onModelBChange: (model: LMArenaModel) => void
  currentMode: LMArenaMode
  currentModel?: LMArenaModel
  currentModelA?: LMArenaModel
  currentModelB?: LMArenaModel
}

export const LMArenaSettings: FC<LMArenaSettingsProps> = ({
  onModeChange,
  onModelChange,
  onModelAChange,
  onModelBChange,
  currentMode,
  currentModel,
  currentModelA,
  currentModelB,
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [dynamicModels, setDynamicModels] = useState<ModelInfo[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [useDynamicModels, setUseDynamicModels] = useState(true)

  // 자동 동기화 시작
  useEffect(() => {
    startAutoSync()
    loadDynamicModels()
    updateSyncStatus()

    // 주기적으로 상태 업데이트
    const interval = setInterval(updateSyncStatus, 60000) // 1분마다
    return () => clearInterval(interval)
  }, [])

  // 동적 모델 로드
  const loadDynamicModels = async () => {
    setIsLoading(true)
    try {
      const models = await fetchAvailableModels()
      setDynamicModels(models)
    } catch (error) {
      console.error('Failed to load dynamic models:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 동기화 상태 업데이트
  const updateSyncStatus = () => {
    setSyncStatus(getSyncStatus())
  }

  // 수동 동기화
  const handleManualSync = async () => {
    setIsLoading(true)
    try {
      const count = await forceSyncModels()
      await loadDynamicModels()
      updateSyncStatus()
      alert(`✅ ${count}개 모델 동기화 완료!`)
    } catch (error) {
      alert('❌ 동기화 실패')
      console.error(error)
    } finally {
      setIsLoading(false)
    }
  }

  // 사용할 모델 목록 결정
  const modelEntries = useDynamicModels && dynamicModels.length > 0
    ? dynamicModels.map(m => [m.id, m.name] as [string, string])
    : (Object.entries(LMARENA_MODELS) as [LMArenaModel, string][])

  // 조직별 그룹화
  const groupedModels = useDynamicModels && dynamicModels.length > 0
    ? groupModelsByOrganization(dynamicModels)
    : null

  return (
    <div className="lmarena-settings">
      <button
        className="settings-toggle"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
      >
        ⚙️ LM Arena 설정 {isExpanded ? '▼' : '▶'}
      </button>

      {isExpanded && (
        <div className="settings-panel">
          {/* 동기화 상태 및 제어 */}
          <div className="sync-controls">
            <div className="sync-status">
              <span className="status-label">
                {useDynamicModels ? '🔄 동적 모델' : '📋 기본 모델'} 
                ({modelEntries.length}개)
              </span>
              {syncStatus && useDynamicModels && (
                <span className="status-info">
                  마지막 동기화: {syncStatus.lastSync 
                    ? new Date(syncStatus.lastSync).toLocaleString('ko-KR')
                    : '없음'}
                </span>
              )}
            </div>
            <div className="sync-buttons">
              <button
                className="sync-button"
                onClick={() => setUseDynamicModels(!useDynamicModels)}
                disabled={isLoading}
              >
                {useDynamicModels ? '기본 목록' : '동적 목록'}
              </button>
              {useDynamicModels && (
                <button
                  className="sync-button primary"
                  onClick={handleManualSync}
                  disabled={isLoading}
                >
                  {isLoading ? '⏳ 동기화 중...' : '🔄 지금 동기화'}
                </button>
              )}
            </div>
          </div>
          {/* 모드 선택 */}
          <div className="setting-group">
            <label className="setting-label">대화 모드</label>
            <select
              className="setting-select"
              value={currentMode}
              onChange={(e) => onModeChange(e.target.value as LMArenaMode)}
            >
              <option value="direct">Direct Chat (특정 모델 선택)</option>
              <option value="battle">Battle (익명 모델 대결)</option>
              <option value="side-by-side">Side-by-Side (두 모델 비교)</option>
            </select>
          </div>

          {/* Direct 모드: 단일 모델 선택 */}
          {currentMode === 'direct' && (
            <div className="setting-group">
              <label className="setting-label">모델 선택</label>
              {groupedModels ? (
                <select
                  className="setting-select"
                  value={currentModel}
                  onChange={(e) => onModelChange(e.target.value as LMArenaModel)}
                >
                  {Object.entries(groupedModels).map(([org, models]) => (
                    <optgroup key={org} label={org}>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              ) : (
                <select
                  className="setting-select"
                  value={currentModel}
                  onChange={(e) => onModelChange(e.target.value as LMArenaModel)}
                >
                  {modelEntries.map(([key, name]) => (
                    <option key={key} value={key}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* Side-by-Side 모드: 두 모델 선택 */}
          {currentMode === 'side-by-side' && (
            <>
              <div className="setting-group">
                <label className="setting-label">모델 A</label>
                {groupedModels ? (
                  <select
                    className="setting-select"
                    value={currentModelA}
                    onChange={(e) => onModelAChange(e.target.value as LMArenaModel)}
                  >
                    {Object.entries(groupedModels).map(([org, models]) => (
                      <optgroup key={org} label={org}>
                        {models.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <select
                    className="setting-select"
                    value={currentModelA}
                    onChange={(e) => onModelAChange(e.target.value as LMArenaModel)}
                  >
                    {modelEntries.map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div className="setting-group">
                <label className="setting-label">모델 B</label>
                {groupedModels ? (
                  <select
                    className="setting-select"
                    value={currentModelB}
                    onChange={(e) => onModelBChange(e.target.value as LMArenaModel)}
                  >
                    {Object.entries(groupedModels).map(([org, models]) => (
                      <optgroup key={org} label={org}>
                        {models.map(m => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                ) : (
                  <select
                    className="setting-select"
                    value={currentModelB}
                    onChange={(e) => onModelBChange(e.target.value as LMArenaModel)}
                  >
                    {modelEntries.map(([key, name]) => (
                      <option key={key} value={key}>
                        {name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}

          {/* Battle 모드 안내 */}
          {currentMode === 'battle' && (
            <div className="setting-info">
              <p>🎲 Battle 모드에서는 두 익명 모델이 무작위로 선택됩니다.</p>
              <p>대화 후 어느 모델이 더 나은지 투표할 수 있습니다.</p>
            </div>
          )}
        </div>
      )}

      <style>{`
        .lmarena-settings {
          margin: 16px 0;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
          overflow: hidden;
        }

        .settings-toggle {
          width: 100%;
          padding: 12px 16px;
          background: #f5f5f5;
          border: none;
          text-align: left;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: background 0.2s;
        }

        .settings-toggle:hover {
          background: #eeeeee;
        }

        .settings-panel {
          padding: 16px;
          background: white;
        }

        .setting-group {
          margin-bottom: 16px;
        }

        .setting-group:last-child {
          margin-bottom: 0;
        }

        .setting-label {
          display: block;
          margin-bottom: 8px;
          font-size: 13px;
          font-weight: 500;
          color: #333;
        }

        .setting-select {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d0d0d0;
          border-radius: 6px;
          font-size: 14px;
          background: white;
          cursor: pointer;
          transition: border-color 0.2s;
        }

        .setting-select:hover {
          border-color: #999;
        }

        .setting-select:focus {
          outline: none;
          border-color: #4a90e2;
          box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
        }

        .setting-info {
          padding: 12px;
          background: #f0f7ff;
          border-radius: 6px;
          font-size: 13px;
          color: #555;
        }

        .setting-info p {
          margin: 4px 0;
        }

        .setting-info p:first-child {
          margin-top: 0;
        }

        .setting-info p:last-child {
          margin-bottom: 0;
        }

        .sync-controls {
          margin-bottom: 16px;
          padding: 12px;
          background: #f8f9fa;
          border-radius: 6px;
          border: 1px solid #e0e0e0;
        }

        .sync-status {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 8px;
        }

        .status-label {
          font-size: 13px;
          font-weight: 600;
          color: #333;
        }

        .status-info {
          font-size: 11px;
          color: #666;
        }

        .sync-buttons {
          display: flex;
          gap: 8px;
        }

        .sync-button {
          flex: 1;
          padding: 6px 12px;
          border: 1px solid #d0d0d0;
          border-radius: 4px;
          background: white;
          font-size: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }

        .sync-button:hover:not(:disabled) {
          background: #f5f5f5;
          border-color: #999;
        }

        .sync-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .sync-button.primary {
          background: #4a90e2;
          color: white;
          border-color: #4a90e2;
        }

        .sync-button.primary:hover:not(:disabled) {
          background: #357abd;
          border-color: #357abd;
        }

        .setting-select optgroup {
          font-weight: 600;
          font-style: normal;
          color: #333;
        }

        .setting-select option {
          font-weight: 400;
          padding-left: 8px;
        }
      `}</style>
    </div>
  )
}
