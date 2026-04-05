import { startTransition, useState } from 'react'
import './App.css'
import { ArcGISMap } from './ArcGISMap'

type OptimizationMode = 'cash' | 'power'

type BoundingBox = {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
}

type SelectionPolygon = {
  rings: number[][][]
}

type LocationSearchRequest = {
  id: number
  query: string
}

type EditSelectionRequest = {
  id: number
}

type OptimizationFocusRequest = {
  id: number
  boundingBox: BoundingBox
}

type OptimizationPoint = {
  lat: number
  lon: number
  device_type: 'solar' | 'wind'
  solar_power_kwh: number
  wind_power_kwh: number
  solar_probability?: number
  wind_probability?: number
  expected_power_kwh?: number
  selected_power_kwh?: number
  device_cost_usd?: number
  effective_cost_usd?: number
}

type OptimizationResponse = {
  selected_count: number
  mode: 'cash' | 'power'
  sample_count: number
  total_cost_usd?: number
  total_actual_cost_usd?: number
  total_expected_power_kwh?: number
  total_power_kwh?: number
  total_raw_power_kwh?: number
  total_effective_cost_usd?: number
  power_basis?: string
  points?: OptimizationPoint[]
}

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://127.0.0.1:8000'

function App() {
  const [solarVisible, setSolarVisible] = useState(false)
  const [windVisible, setWindVisible] = useState(true)
  const [solarFarmsVisible, setSolarFarmsVisible] = useState(false)
  const [windFarmsVisible, setWindFarmsVisible] = useState(false)
  const [powerLinesVisible, setPowerLinesVisible] = useState(false)
  const [optimizationPanelOpen, setOptimizationPanelOpen] = useState(false)
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [optimizationMode, setOptimizationMode] =
    useState<OptimizationMode>('cash')
  const [optimizationValue, setOptimizationValue] = useState('')
  const [boundingBoxSelectionActive, setBoundingBoxSelectionActive] =
    useState(false)
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null)
  const [selectionPolygon, setSelectionPolygon] =
    useState<SelectionPolygon | null>(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSearchRequest, setLocationSearchRequest] =
    useState<LocationSearchRequest | null>(null)
  const [editSelectionRequest, setEditSelectionRequest] =
    useState<EditSelectionRequest | null>(null)
  const [optimizationSubmitting, setOptimizationSubmitting] = useState(false)
  const [optimizationStatusMessage, setOptimizationStatusMessage] = useState('')
  const [optimizationResult, setOptimizationResult] =
    useState<OptimizationResponse | null>(null)
  const [optimizationFocusRequest, setOptimizationFocusRequest] =
    useState<OptimizationFocusRequest | null>(null)

  const activeLayerCount =
    Number(solarVisible) +
    Number(windVisible) +
    Number(solarFarmsVisible) +
    Number(windFarmsVisible) +
    Number(powerLinesVisible)

  const inputLabel =
    optimizationMode === 'cash' ? 'Available budget' : 'Target power need'
  const inputPlaceholder =
    optimizationMode === 'cash' ? 'Enter max budget' : 'Enter required power'
  const inputUnit = optimizationMode === 'cash' ? 'USD' : 'kWh'
  const boundingBoxSummary = boundingBox
    ? 'Polygon selected on map'
    : 'No area selected'
  const hasBoundingBox = boundingBox !== null
  const optimizationTargetValue = Number(optimizationValue)
  const canSubmitOptimization =
    hasBoundingBox &&
    Number.isFinite(optimizationTargetValue) &&
    optimizationTargetValue > 0 &&
    !optimizationSubmitting

  const submitLocationSearch = () => {
    const query = locationQuery.trim()
    if (!query) {
      return
    }

    startTransition(() => {
      setLocationSearchRequest({
        id: Date.now(),
        query,
      })
    })
  }

  const resetOptimizationWorkflow = () => {
    setOptimizationResult(null)
    setOptimizationFocusRequest(null)
    setOptimizationStatusMessage('')
    setOptimizationMode('cash')
    setOptimizationValue('')
    setBoundingBoxSelectionActive(false)
    setBoundingBox(null)
    setSelectionPolygon(null)
    setOptimizationPanelOpen(false)
  }

  const submitOptimizationRequest = async () => {
    if (!boundingBox || !canSubmitOptimization) {
      return
    }

    setOptimizationSubmitting(true)
    setOptimizationStatusMessage('Submitting optimization request...')

    try {
      const response = await fetch(`${API_BASE_URL}/optimize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: optimizationMode,
          target_value: optimizationTargetValue,
          bounding_box: boundingBox,
          polygon: selectionPolygon,
        }),
      })

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null)
        throw new Error(errorBody?.detail ?? 'Optimization request failed')
      }

      const result = (await response.json()) as OptimizationResponse
      setOptimizationResult(result)
      setOptimizationFocusRequest({
        id: Date.now(),
        boundingBox,
      })
      setOptimizationPanelOpen(false)
      setOptimizationStatusMessage(
        optimizationMode === 'cash'
          ? `${result.selected_count} sites selected · expected output ${Math.round(result.total_expected_power_kwh ?? 0).toLocaleString()} kWh`
          : `${result.selected_count} sites selected · total output ${Math.round(result.total_power_kwh ?? 0).toLocaleString()} kWh`,
      )
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Optimization request failed'
      setOptimizationStatusMessage(message)
    } finally {
      setOptimizationSubmitting(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="map-stage">
        <div className="map-frame">
          <div className="map-top-left">
            <div className="brand-banner">
              <div className="brand-mark" aria-hidden="true">
                R
              </div>
              <div className="brand-copy">
                <p className="eyebrow">Renewably Atlas</p>
                <h1>Grid intelligence studio</h1>
              </div>
            </div>

            <form
              className="map-search"
              onSubmit={(event) => {
                event.preventDefault()
                submitLocationSearch()
              }}
            >
              <label className="map-search-field">
                <span className="map-search-icon" aria-hidden="true">
                  ⌕
                </span>
                <input
                  type="text"
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                  placeholder="Search city, state, or address"
                  aria-label="Search city, state, or address"
                />
              </label>
              <button type="submit" className="map-search-button">
                Search
              </button>
            </form>
          </div>

          <ArcGISMap
            topographyVisible={false}
            solarVisible={solarVisible}
            windVisible={windVisible}
            solarFarmsVisible={solarFarmsVisible}
            windFarmsVisible={windFarmsVisible}
            powerLinesVisible={powerLinesVisible}
            optimizationSites={optimizationResult?.points ?? []}
            optimizationFocusRequest={optimizationFocusRequest}
            boundingBox={boundingBox}
            boundingBoxSelectionActive={boundingBoxSelectionActive}
            editSelectionRequest={editSelectionRequest}
            onBoundingBoxSelectionChange={setBoundingBoxSelectionActive}
            onBoundingBoxSelect={setBoundingBox}
            onSelectionPolygonSelect={setSelectionPolygon}
            locationSearchRequest={locationSearchRequest}
          />

          <div className="map-bottom-left">
            <div className="map-bottom-left-row">
              <div className="legend-stack">
                {solarVisible ? (
                  <div className="map-overlay overlay-legend overlay-legend-inline">
                    <div className="legend-header">
                      <p className="panel-label">Solar irradiation</p>
                      <span className="legend-unit">kWh/m²/day</span>
                    </div>
                    <div className="legend-bar" aria-hidden="true" />
                    <div className="legend-values">
                      <span>Lower resource</span>
                      <span>Strong resource</span>
                      <span>Peak resource</span>
                    </div>
                  </div>
                ) : null}

                {windVisible ? (
                  <div className="map-overlay overlay-legend overlay-legend-inline">
                    <div className="legend-header">
                      <p className="panel-label">Wind speed</p>
                      <span className="legend-unit">m/s</span>
                    </div>
                    <div className="legend-bar wind-legend-bar" aria-hidden="true" />
                    <div className="legend-values">
                      <span>Lower wind</span>
                      <span>Strong wind</span>
                      <span>Peak wind</span>
                    </div>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                className="layer-menu-toggle"
                onClick={() => setLayerMenuOpen((current) => !current)}
                aria-expanded={layerMenuOpen}
                aria-label="Toggle layer menu"
              >
                <span className="layer-menu-toggle-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="presentation">
                    <path
                      d="M12 3 4 7.4 12 11.8 20 7.4 12 3Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 11.1 12 15.5 20 11.1"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4 14.9 12 19.3 20 14.9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="layer-menu-toggle-count">{activeLayerCount}</span>
              </button>
            </div>

            {layerMenuOpen ? (
              <div className="map-overlay layer-dock">
                <div className="legend-header">
                  <div>
                    <p className="panel-label">Map layers</p>
                    <span className="legend-unit">{activeLayerCount} active</span>
                  </div>
                  <button
                    type="button"
                    className="overlay-close-button"
                    onClick={() => setLayerMenuOpen(false)}
                    aria-label="Close layer menu"
                  >
                    ×
                  </button>
                </div>

                <div className="floating-layer-list">
                  <label className="floating-layer-card">
                    <div className="floating-layer-copy">
                      <strong>Solar irradiation</strong>
                      <p>Estimated solar resource intensity.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={solarVisible}
                      onChange={() => {
                        startTransition(() => {
                          setSolarVisible((current) => !current)
                        })
                      }}
                    />
                  </label>

                  <label className="floating-layer-card">
                    <div className="floating-layer-copy">
                      <strong>Wind speed</strong>
                      <p>Estimated wind resource intensity.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={windVisible}
                      onChange={() => {
                        startTransition(() => {
                          setWindVisible((current) => !current)
                        })
                      }}
                    />
                  </label>

                  <label className="floating-layer-card">
                    <div className="floating-layer-copy">
                      <strong>Solar farm sites</strong>
                      <p>Known solar farm locations.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={solarFarmsVisible}
                      onChange={() => {
                        startTransition(() => {
                          setSolarFarmsVisible((current) => !current)
                        })
                      }}
                    />
                  </label>

                  <label className="floating-layer-card">
                    <div className="floating-layer-copy">
                      <strong>Wind farm sites</strong>
                      <p>Known wind farm locations.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={windFarmsVisible}
                      onChange={() => {
                        startTransition(() => {
                          setWindFarmsVisible((current) => !current)
                        })
                      }}
                    />
                  </label>

                  <label className="floating-layer-card">
                    <div className="floating-layer-copy">
                      <strong>Major power lines</strong>
                      <p>Transmission line corridors.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={powerLinesVisible}
                      onChange={() => {
                        startTransition(() => {
                          setPowerLinesVisible((current) => !current)
                        })
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </div>

          {optimizationPanelOpen ? (
            <div className="map-overlay optimization-sheet">
              <div className="legend-header overlay-results-header">
                <div>
                  <p className="panel-label">Renewably workflow</p>
                  <h2 className="sheet-title">Optimization request</h2>
                </div>
                <button
                  type="button"
                  className="overlay-close-button"
                  onClick={() => setOptimizationPanelOpen(false)}
                  aria-label="Close optimization request"
                >
                  ×
                </button>
              </div>

              <div className="sheet-body">
                <div className="sheet-section-head">
                  <span className="panel-label">Mode selection</span>
                  <span className="sheet-step">Step 1</span>
                </div>
                <div className="mode-switch" role="tablist" aria-label="Optimization mode">
                  <button
                    type="button"
                    className={
                      optimizationMode === 'cash'
                        ? 'mode-button active'
                        : 'mode-button'
                    }
                    onClick={() => setOptimizationMode('cash')}
                  >
                    Cash optimization
                  </button>
                  <button
                    type="button"
                    className={
                      optimizationMode === 'power'
                        ? 'mode-button active'
                        : 'mode-button'
                    }
                    onClick={() => setOptimizationMode('power')}
                  >
                    Power optimization
                  </button>
                </div>

                <div className="sheet-section-head">
                  <span className="panel-label">Parameters</span>
                  <span className="sheet-step">Step 2</span>
                </div>
                <label className="input-block">
                  <span>{inputLabel}</span>
                  <div className="input-row">
                    <input
                      type="text"
                      value={optimizationValue}
                      onChange={(event) => setOptimizationValue(event.target.value)}
                      placeholder={inputPlaceholder}
                    />
                    <span className="input-unit">{inputUnit}</span>
                  </div>
                </label>

                <div className="sheet-section-head">
                  <span className="panel-label">Area selection</span>
                  <span className="sheet-step">
                    {hasBoundingBox ? 'Ready' : 'Step 3'}
                  </span>
                </div>
                <div className="selection-summary">
                  <strong>{boundingBoxSummary}</strong>
                  <p className="selection-hint">
                    Search to move the map, then draw or edit the polygon for the
                    final optimization area.
                  </p>
                </div>

                <div className="action-stack">
                  <button
                    type="button"
                    className={
                      boundingBoxSelectionActive
                        ? 'sidebar-action active'
                        : 'sidebar-action'
                    }
                    onClick={() =>
                      setBoundingBoxSelectionActive((current) => !current)
                    }
                  >
                    {boundingBoxSelectionActive
                      ? 'Cancel polygon'
                      : hasBoundingBox
                        ? 'Redraw polygon'
                        : 'Draw polygon'}
                  </button>
                  <button
                    type="button"
                    className="sidebar-action"
                    disabled={!hasBoundingBox}
                    onClick={() => {
                      if (!hasBoundingBox) {
                        return
                      }

                      startTransition(() => {
                        setBoundingBoxSelectionActive(false)
                        setEditSelectionRequest({
                          id: Date.now(),
                        })
                      })
                    }}
                  >
                    Edit selection
                  </button>
                  <button
                    type="button"
                    className="sidebar-action sidebar-action-danger"
                    disabled={!hasBoundingBox}
                    onClick={() => {
                      startTransition(() => {
                        setBoundingBoxSelectionActive(false)
                        setBoundingBox(null)
                      })
                    }}
                  >
                    Delete selection
                  </button>
                  <button
                    type="button"
                    className="sidebar-submit"
                    disabled={!canSubmitOptimization}
                    onClick={() => {
                      void submitOptimizationRequest()
                    }}
                  >
                    {optimizationSubmitting
                      ? 'Submitting...'
                      : 'Submit optimization request'}
                  </button>
                </div>

                <p className="optimization-status">{optimizationStatusMessage}</p>
              </div>
            </div>
          ) : null}

          {optimizationResult ? (
            <div className="map-overlay overlay-optimization-results">
              <div className="legend-header overlay-results-header">
                <div>
                  <p className="panel-label">Optimization results</p>
                  <span className="legend-unit">Live</span>
                </div>
                <button
                  type="button"
                  className="overlay-close-button"
                  onClick={resetOptimizationWorkflow}
                  aria-label="Close optimization results"
                >
                  ×
                </button>
              </div>
              <div className="sidebar-results overlay-results-grid">
                <div className="result-row">
                  <span>Mode</span>
                  <strong>
                    {optimizationResult.mode === 'cash'
                      ? 'Budget target'
                      : 'Power target'}
                  </strong>
                </div>
                <div className="result-row">
                  <span>Sampled points</span>
                  <strong>{optimizationResult.sample_count.toLocaleString()}</strong>
                </div>
                <div className="result-row">
                  <span>Selected sites</span>
                  <strong>{optimizationResult.selected_count.toLocaleString()}</strong>
                </div>
                {optimizationResult.power_basis === 'average_hourly_kwh' ? (
                  <div className="result-row">
                    <span>Output basis</span>
                    <strong>Average hourly kWh</strong>
                  </div>
                ) : null}
                {optimizationResult.total_expected_power_kwh !== undefined ? (
                  <div className="result-row">
                    <span>Expected output</span>
                    <strong>
                      {Math.round(
                        optimizationResult.total_expected_power_kwh,
                      ).toLocaleString()}{' '}
                      kWh
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_raw_power_kwh !== undefined ? (
                  <div className="result-row">
                    <span>Raw output</span>
                    <strong>
                      {Math.round(
                        optimizationResult.total_raw_power_kwh,
                      ).toLocaleString()}{' '}
                      kWh
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_cost_usd !== undefined ? (
                  <div className="result-row">
                    <span>Total cost</span>
                    <strong>
                      {Math.round(
                        optimizationResult.total_cost_usd,
                      ).toLocaleString()}{' '}
                      USD
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_power_kwh !== undefined ? (
                  <div className="result-row">
                    <span>Total output</span>
                    <strong>
                      {Math.round(
                        optimizationResult.total_power_kwh,
                      ).toLocaleString()}{' '}
                      kWh
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_actual_cost_usd !== undefined ? (
                  <div className="result-row">
                    <span>Actual cost</span>
                    <strong>
                      {Math.round(
                        optimizationResult.total_actual_cost_usd,
                      ).toLocaleString()}{' '}
                      USD
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_effective_cost_usd !== undefined ? (
                  <div className="result-row">
                    <span>Effective cost</span>
                    <strong>
                      {Math.round(
                        optimizationResult.total_effective_cost_usd,
                      ).toLocaleString()}{' '}
                      USD
                    </strong>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="map-bottom-right">
            {!optimizationResult ? (
              <button
                type="button"
                className="optimization-fab"
                onClick={() => setOptimizationPanelOpen(true)}
              >
                Optimization request
              </button>
            ) : null}

            {optimizationStatusMessage && !optimizationResult ? (
              <p className="map-status-pill">{optimizationStatusMessage}</p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
