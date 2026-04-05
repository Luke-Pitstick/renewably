import { startTransition, useState } from 'react'
import './App.css'
import { ArcGISMap } from './ArcGISMap'

type AppScreen = 'home' | 'workspace'
type OptimizationMode = 'cash' | 'power'

type BoundingBox = {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
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
  mode: OptimizationMode
  sample_count: number
  total_cost_usd?: number
  total_actual_cost_usd?: number
  total_expected_power_kwh?: number
  total_power_kwh?: number
  total_raw_power_kwh?: number
  total_effective_cost_usd?: number
  power_basis?: string
  power_window_hours?: number
  points?: OptimizationPoint[]
}

const BRAND_SIGNALS = [
  {
    value: 'Grid-aware',
    label: 'Resource, terrain, and transmission cues in one canvas',
  },
  {
    value: 'Polygon-first',
    label: 'Go from sketching a candidate site to an optimization brief',
  },
  {
    value: 'Early-stage',
    label: 'Built for origination, screening, and siting conversations',
  },
]

const BRAND_PILLARS = [
  {
    title: 'Screen faster',
    copy:
      'Overlay solar irradiation, wind speed, terrain, and infrastructure without jumping between tools.',
  },
  {
    title: 'Think spatially',
    copy:
      'Draw the actual project footprint, adjust it on-map, and keep the workflow tied to a real polygon.',
  },
  {
    title: 'Brief clearly',
    copy:
      'Turn a rough area into a cleaner optimization request instead of a loose collection of screenshots.',
  },
]

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ??
  'http://127.0.0.1:8000'

function formatModeLabel(mode: OptimizationMode) {
  return mode === 'cash' ? 'Cash optimization' : 'Power optimization'
}

function formatRoundedValue(value: number) {
  return Math.round(value).toLocaleString()
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('home')
  const [topographyVisible, setTopographyVisible] = useState(true)
  const [solarVisible, setSolarVisible] = useState(false)
  const [windVisible, setWindVisible] = useState(true)
  const [solarFarmsVisible, setSolarFarmsVisible] = useState(false)
  const [windFarmsVisible, setWindFarmsVisible] = useState(false)
  const [powerLinesVisible, setPowerLinesVisible] = useState(false)
  const [layerMenuOpen, setLayerMenuOpen] = useState(false)
  const [workflowModalOpen, setWorkflowModalOpen] = useState(false)
  const [optimizationMode, setOptimizationMode] =
    useState<OptimizationMode>('cash')
  const [optimizationValue, setOptimizationValue] = useState('')
  const [boundingBoxSelectionActive, setBoundingBoxSelectionActive] =
    useState(false)
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [selectedAreaLabel, setSelectedAreaLabel] = useState<string | null>(null)
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

  const parameterValue = optimizationValue.trim()
  const optimizationTargetValue = Number(parameterValue)
  const parameterReady =
    parameterValue.length > 0 &&
    Number.isFinite(optimizationTargetValue) &&
    optimizationTargetValue > 0
  const hasBoundingBox = boundingBox !== null
  const canSubmitOptimization =
    parameterReady && hasBoundingBox && !optimizationSubmitting
  const activeLayerCount =
    Number(topographyVisible) +
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
  const modeSummary = formatModeLabel(optimizationMode)
  const parameterHero = parameterReady
    ? `${optimizationMode === 'cash' ? '$' : ''}${parameterValue}`
    : optimizationMode === 'cash'
      ? '$--'
      : '--'
  const parameterSummary = parameterReady
    ? `${optimizationMode === 'cash' ? '$' : ''}${parameterValue} ${inputUnit}`
    : 'Enter a positive numeric value'
  const areaSummary = hasBoundingBox
    ? 'Polygon selected'
    : selectedAreaLabel
      ? `Centered on ${selectedAreaLabel}`
      : 'No area selected'

  const clearOptimizationArtifacts = () => {
    setOptimizationResult(null)
    setOptimizationFocusRequest(null)
    setOptimizationStatusMessage('')
  }

  const launchWorkspace = (openWorkflow = false) => {
    startTransition(() => {
      setScreen('workspace')
      setWorkflowModalOpen(openWorkflow)
    })
  }

  const returnHome = () => {
    startTransition(() => {
      setScreen('home')
      setWorkflowModalOpen(false)
      setLayerMenuOpen(false)
      setBoundingBoxSelectionActive(false)
    })
  }

  const submitLocationSearch = () => {
    const query = locationQuery.trim()
    if (!query) {
      return
    }

    startTransition(() => {
      setSelectedAreaLabel(query)
      setLocationSearchRequest({
        id: Date.now(),
        query,
      })
    })
  }

  const beginPolygonDraw = () => {
    startTransition(() => {
      clearOptimizationArtifacts()
      setWorkflowModalOpen(false)
      setLayerMenuOpen(false)
      setSelectedAreaLabel(null)
      setBoundingBoxSelectionActive(true)
    })
  }

  const deleteSelection = () => {
    startTransition(() => {
      clearOptimizationArtifacts()
      setBoundingBoxSelectionActive(false)
      setBoundingBox(null)
      setWorkflowModalOpen(false)
    })
  }

  const openWorkflow = () => {
    if (hasBoundingBox) {
      setWorkflowModalOpen(true)
      return
    }

    beginPolygonDraw()
  }

  const closeOptimizationResults = () => {
    clearOptimizationArtifacts()
  }

  const handleBoundingBoxSelect = (nextBoundingBox: BoundingBox | null) => {
    startTransition(() => {
      clearOptimizationArtifacts()
      setBoundingBox(nextBoundingBox)

      if (nextBoundingBox) {
        setWorkflowModalOpen(true)
        setBoundingBoxSelectionActive(false)
      }
    })
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
      setWorkflowModalOpen(false)
      setBoundingBoxSelectionActive(false)

      const summary =
        optimizationMode === 'cash'
          ? `${result.selected_count} sites selected · expected output ${formatRoundedValue(result.total_expected_power_kwh ?? 0)} kWh`
          : `${result.selected_count} sites selected · actual cost ${formatRoundedValue(result.total_actual_cost_usd ?? 0)} USD`

      setOptimizationStatusMessage(summary)
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Optimization request failed'
      setOptimizationStatusMessage(message)
    } finally {
      setOptimizationSubmitting(false)
    }
  }

  if (screen === 'home') {
    return (
      <main className="app-shell app-shell-home">
        <div className="home-ambient home-ambient-north" aria-hidden="true" />
        <div className="home-ambient home-ambient-south" aria-hidden="true" />
        <div className="home-gridline" aria-hidden="true" />

        <div className="home-page">
          <header className="home-nav">
            <div className="brand-lockup">
              <span className="brand-mark" aria-hidden="true" />
              <div className="brand-type">
                <strong>Renewably Atlas</strong>
                <span>Grid-aware siting studio</span>
              </div>
            </div>

            <button
              type="button"
              className="home-nav-button"
              onClick={() => launchWorkspace(false)}
            >
              Enter Studio
            </button>
          </header>

          <section className="home-hero">
            <div className="home-copy">
              <p className="home-eyebrow">Utility-scale renewable development</p>
              <h1>
                Make solar and wind siting feel like a product decision, not a GIS
                scavenger hunt.
              </h1>
              <p className="home-lede">
                Renewably Atlas turns resource surfaces, terrain context,
                transmission lines, and polygon-based screening into a branded
                siting workflow for early-stage project teams.
              </p>

              <div className="home-actions">
                <button
                  type="button"
                  className="home-cta home-cta-primary"
                  onClick={() => launchWorkspace(false)}
                >
                  Launch Atlas
                </button>
                <button
                  type="button"
                  className="home-cta home-cta-secondary"
                  onClick={() => launchWorkspace(true)}
                >
                  Open Optimization Flow
                </button>
              </div>

              <div className="home-signal-row">
                {BRAND_SIGNALS.map((signal) => (
                  <article key={signal.value} className="home-signal-card">
                    <strong>{signal.value}</strong>
                    <span>{signal.label}</span>
                  </article>
                ))}
              </div>
            </div>

            <div className="home-billboard">
              <article className="home-billboard-card home-billboard-card-primary">
                <p className="section-label">Live Canvas</p>
                <h2>One map. Six layers. One optimization path.</h2>
                <p>
                  Screen resource quality, grid adjacency, and terrain without
                  breaking the flow between search, draw, and decision framing.
                </p>
                <div className="home-chip-row">
                  <span className="home-chip">Solar irradiation</span>
                  <span className="home-chip">Wind speed</span>
                  <span className="home-chip">Terrain</span>
                  <span className="home-chip">Transmission lines</span>
                </div>
              </article>

              <article className="home-billboard-card home-billboard-card-secondary">
                <p className="section-label">Brand Promise</p>
                <div className="home-brief-list">
                  <div>
                    <strong>Cleaner first impression</strong>
                    <span>
                      Designed like a real product, not a bare map proof-of-concept.
                    </span>
                  </div>
                  <div>
                    <strong>Spatial clarity</strong>
                    <span>
                      Draw the footprint, then tune the brief around a concrete
                      area.
                    </span>
                  </div>
                  <div>
                    <strong>Stakeholder-ready</strong>
                    <span>
                      Useful for origination reviews, site screening, and internal
                      demos.
                    </span>
                  </div>
                </div>
              </article>
            </div>
          </section>

          <section className="home-pillar-grid">
            {BRAND_PILLARS.map((pillar) => (
              <article key={pillar.title} className="home-pillar-card">
                <p className="section-label">Why it matters</p>
                <h3>{pillar.title}</h3>
                <p>{pillar.copy}</p>
              </article>
            ))}
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="map-stage map-stage-full">
        <div className="map-frame">
          <div className="workspace-brandbar">
            <button
              type="button"
              className="brand-lockup brand-lockup-button"
              onClick={returnHome}
            >
              <span className="brand-mark" aria-hidden="true" />
              <div className="brand-type">
                <strong>Renewably Atlas</strong>
                <span>Grid-aware siting studio</span>
              </div>
            </button>

            <div className="workspace-brand-side">
              <span className="workspace-chip">Live siting canvas</span>
              <button
                type="button"
                className="workspace-home-link"
                onClick={returnHome}
              >
                Home
              </button>
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
                aria-label="Search location"
              />
            </label>
            <button type="submit" className="map-search-button">
              Search
            </button>
          </form>

          <ArcGISMap
            topographyVisible={topographyVisible}
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
            onBoundingBoxSelect={handleBoundingBoxSelect}
            locationSearchRequest={locationSearchRequest}
          />

          <div className="map-overlay-cluster overlay-bottom-left">
            <div className="legend-stack">
              {solarVisible ? (
                <div className="map-overlay overlay-legend">
                  <div className="legend-header">
                    <p className="panel-label">Solar Irradiation</p>
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
                <div className="map-overlay overlay-legend">
                  <div className="legend-header">
                    <p className="panel-label">Wind Speed</p>
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

            <div className="map-layer-flyout">
              {layerMenuOpen ? (
                <div className="map-layer-panel" aria-label="Map layers">
                  <div className="map-layer-panel-header">
                    <div>
                      <p className="panel-label">Map Layers</p>
                      <strong>{activeLayerCount} active</strong>
                    </div>
                    <button
                      type="button"
                      className="map-layer-close"
                      onClick={() => setLayerMenuOpen(false)}
                      aria-label="Close map layers"
                    >
                      ×
                    </button>
                  </div>

                  <label className="map-layer-option">
                    <div className="map-layer-option-copy">
                      <strong>Terrain / elevation</strong>
                      <small>Hillshade context for slope and relief.</small>
                    </div>
                    <input
                      type="checkbox"
                      checked={topographyVisible}
                      onChange={() => {
                        startTransition(() => {
                          setTopographyVisible((current) => !current)
                        })
                      }}
                    />
                  </label>

                  <label className="map-layer-option">
                    <div className="map-layer-option-copy">
                      <strong>Solar irradiation</strong>
                      <small>Estimated solar resource intensity.</small>
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

                  <label className="map-layer-option">
                    <div className="map-layer-option-copy">
                      <strong>Wind speed</strong>
                      <small>Estimated wind resource intensity.</small>
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

                  <label className="map-layer-option">
                    <div className="map-layer-option-copy">
                      <strong>Solar farm sites</strong>
                      <small>Known solar farm locations.</small>
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

                  <label className="map-layer-option">
                    <div className="map-layer-option-copy">
                      <strong>Wind farm sites</strong>
                      <small>Known wind farm locations.</small>
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

                  <label className="map-layer-option">
                    <div className="map-layer-option-copy">
                      <strong>Major power lines</strong>
                      <small>Transmission line corridors.</small>
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
              ) : null}

              <button
                type="button"
                className="map-layer-trigger"
                aria-label="Toggle map layers"
                aria-expanded={layerMenuOpen}
                onClick={() => setLayerMenuOpen((current) => !current)}
              >
                <span className="layers-icon" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
                <span className="map-layer-count">{activeLayerCount}</span>
              </button>
            </div>
          </div>

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
                  onClick={closeOptimizationResults}
                  aria-label="Close optimization results"
                >
                  ×
                </button>
              </div>
              <div className="overlay-results-grid">
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
                      {formatRoundedValue(
                        optimizationResult.total_expected_power_kwh,
                      )}{' '}
                      kWh
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_raw_power_kwh !== undefined ? (
                  <div className="result-row">
                    <span>Raw output</span>
                    <strong>
                      {formatRoundedValue(optimizationResult.total_raw_power_kwh)}{' '}
                      kWh
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_cost_usd !== undefined ? (
                  <div className="result-row">
                    <span>Total cost</span>
                    <strong>
                      {formatRoundedValue(optimizationResult.total_cost_usd)} USD
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_power_kwh !== undefined ? (
                  <div className="result-row">
                    <span>Total output</span>
                    <strong>
                      {formatRoundedValue(optimizationResult.total_power_kwh)} kWh
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_actual_cost_usd !== undefined ? (
                  <div className="result-row">
                    <span>Actual cost</span>
                    <strong>
                      {formatRoundedValue(
                        optimizationResult.total_actual_cost_usd,
                      )}{' '}
                      USD
                    </strong>
                  </div>
                ) : null}
                {optimizationResult.total_effective_cost_usd !== undefined ? (
                  <div className="result-row">
                    <span>Effective cost</span>
                    <strong>
                      {formatRoundedValue(
                        optimizationResult.total_effective_cost_usd,
                      )}{' '}
                      USD
                    </strong>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="map-action-stack">
            <button
              type="button"
              className={
                boundingBoxSelectionActive
                  ? 'map-primary-action map-primary-action-active'
                  : 'map-primary-action'
              }
              onClick={openWorkflow}
            >
              {boundingBoxSelectionActive
                ? 'Drawing polygon...'
                : hasBoundingBox
                  ? 'Open settings'
                  : 'Draw polygon'}
            </button>
          </div>
        </div>
      </section>

      {workflowModalOpen ? (
        <div
          className="workflow-modal-backdrop"
          onClick={() => setWorkflowModalOpen(false)}
        >
          <section
            className="workflow-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="workflow-modal-header">
              <div>
                <p className="section-label">Renewably Workflow</p>
                <h2 className="workflow-modal-title">Optimization request</h2>
              </div>
              <button
                type="button"
                className="workflow-modal-close"
                onClick={() => setWorkflowModalOpen(false)}
                aria-label="Close workflow modal"
              >
                ×
              </button>
            </header>

            <section className="workflow-section">
              <div className="workflow-header">
                <div>
                  <p className="section-label">Mode Selection</p>
                  <h2 className="section-title">{modeSummary}</h2>
                </div>
                <span className="status-badge">Step 1</span>
              </div>

              <div
                className="segmented-control"
                role="tablist"
                aria-label="Optimization mode"
              >
                <button
                  type="button"
                  className={
                    optimizationMode === 'cash'
                      ? 'segment-button segment-button-active'
                      : 'segment-button'
                  }
                  onClick={() => setOptimizationMode('cash')}
                >
                  Cash optimization
                </button>
                <button
                  type="button"
                  className={
                    optimizationMode === 'power'
                      ? 'segment-button segment-button-active'
                      : 'segment-button'
                  }
                  onClick={() => setOptimizationMode('power')}
                >
                  Power optimization
                </button>
              </div>
            </section>

            <div className="sidebar-divider" />

            <section className="workflow-section">
              <div className="workflow-header">
                <div>
                  <p className="section-label">Parameters</p>
                  <h2 className="section-title">{inputLabel}</h2>
                </div>
                <span className="status-badge">
                  {parameterReady ? 'Ready' : 'Step 2'}
                </span>
              </div>

              <div className="parameter-hero">
                <strong>{parameterHero}</strong>
                <span>{inputUnit}</span>
              </div>

              <label className="field-block">
                <span className="field-label">{inputLabel}</span>
                <div className="field-shell">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={optimizationValue}
                    onChange={(event) => setOptimizationValue(event.target.value)}
                    placeholder={inputPlaceholder}
                  />
                  <span className="field-suffix">{inputUnit}</span>
                </div>
              </label>

              <p className="section-copy">
                Enter the primary constraint before submitting the selected polygon.
              </p>
            </section>

            <div className="sidebar-divider" />

            <section className="workflow-section">
              <div className="workflow-header">
                <div>
                  <p className="section-label">Area Selection</p>
                  <h2 className="section-title">{areaSummary}</h2>
                </div>
                <span className="status-badge">
                  {hasBoundingBox ? 'Ready' : 'Step 3'}
                </span>
              </div>

              <div className="selection-prompt">
                <div className="selection-prompt-line">
                  <strong>Draw polygon</strong>
                  <span>then adjust or search</span>
                </div>
                <p className="section-copy">
                  Search to move the map, then redraw or edit the polygon for the
                  final optimization area.
                </p>
              </div>

              <div className="action-grid">
                <button
                  type="button"
                  className={
                    boundingBoxSelectionActive
                      ? 'ghost-button ghost-button-active'
                      : 'ghost-button'
                  }
                  onClick={beginPolygonDraw}
                >
                  {boundingBoxSelectionActive
                    ? 'Drawing polygon...'
                    : hasBoundingBox
                      ? 'Redraw polygon'
                      : 'Draw polygon'}
                </button>
                <button
                  type="button"
                  className="ghost-button"
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
                  className="ghost-button ghost-button-danger"
                  disabled={!hasBoundingBox}
                  onClick={deleteSelection}
                >
                  Delete selection
                </button>
              </div>

              <label className="field-block">
                <span className="field-label">Search location</span>
                <div className="search-field-row">
                  <div className="field-shell">
                    <input
                      type="text"
                      value={locationQuery}
                      onChange={(event) => setLocationQuery(event.target.value)}
                      placeholder="Search city, state, or address"
                    />
                  </div>
                  <button
                    type="button"
                    className="ghost-button ghost-button-inline"
                    onClick={submitLocationSearch}
                  >
                    Search
                  </button>
                </div>
              </label>
            </section>

            <div className="sidebar-divider" />

            <section className="workflow-section">
              <div className="workflow-header">
                <div>
                  <p className="section-label">Submit</p>
                  <h2 className="section-title">Optimization request</h2>
                </div>
                <span className="status-badge">
                  {canSubmitOptimization ? 'Ready' : 'Step 4'}
                </span>
              </div>

              <div className="summary-list">
                <div className="summary-row">
                  <span>Mode</span>
                  <strong>{modeSummary}</strong>
                </div>
                <div className="summary-row">
                  <span>Parameter</span>
                  <strong>{parameterSummary}</strong>
                </div>
                <div className="summary-row">
                  <span>Area</span>
                  <strong>{areaSummary}</strong>
                </div>
                <div className="summary-row">
                  <span>Layers</span>
                  <strong>{activeLayerCount} active</strong>
                </div>
              </div>

              <button
                type="button"
                className="primary-button"
                disabled={!canSubmitOptimization}
                onClick={() => {
                  void submitOptimizationRequest()
                }}
              >
                {optimizationSubmitting
                  ? 'Submitting...'
                  : 'Submit Optimization Request'}
              </button>

              {optimizationStatusMessage ? (
                <p className="workflow-status">{optimizationStatusMessage}</p>
              ) : null}
            </section>
          </section>
        </div>
      ) : null}
    </main>
  )
}

export default App
