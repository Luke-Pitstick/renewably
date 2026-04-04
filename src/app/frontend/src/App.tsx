import { startTransition, useState } from 'react'
import './App.css'
import { ArcGISMap } from './ArcGISMap'

type OptimizationMode = 'cash' | 'power'
type SidebarSectionKey = 'optimization' | 'layers'
type MapLayerKey = 'solar' | 'wind'

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

function App() {
  const [mapLayer, setMapLayer] = useState<MapLayerKey>('solar')
  const solarVisible = mapLayer === 'solar'
  const windVisible = mapLayer === 'wind'
  const [openSections, setOpenSections] = useState<
    Record<SidebarSectionKey, boolean>
  >({
    optimization: true,
    layers: true,
  })
  const [optimizationMode, setOptimizationMode] =
    useState<OptimizationMode>('cash')
  const [optimizationValue, setOptimizationValue] = useState('')
  const [boundingBoxSelectionActive, setBoundingBoxSelectionActive] =
    useState(false)
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSearchRequest, setLocationSearchRequest] =
    useState<LocationSearchRequest | null>(null)
  const [editSelectionRequest, setEditSelectionRequest] =
    useState<EditSelectionRequest | null>(null)
  const mapLayerBadgeLabel = mapLayer === 'solar' ? 'Solar' : 'Wind'
  const inputLabel =
    optimizationMode === 'cash' ? 'Available budget' : 'Target power need'
  const inputPlaceholder =
    optimizationMode === 'cash' ? 'Enter max budget' : 'Enter required power'
  const inputUnit = optimizationMode === 'cash' ? 'USD' : 'kWh'
  const boundingBoxSummary = boundingBox
    ? 'Area selected on map'
    : 'No area selected'
  const hasBoundingBox = boundingBox !== null
  const legendTitle = solarVisible ? 'Solar irradiation' : 'Wind speed'
  const legendUnit = solarVisible ? 'kWh/m²/day' : 'm/s'
  const legendLabels = solarVisible
    ? ['Lower resource', 'Strong resource', 'Peak resource']
    : ['Lower wind', 'Strong wind', 'Peak wind']
  const toggleSection = (section: SidebarSectionKey) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }))
  }

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

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <header className="sidebar-header">
          <div className="brand-block">
            <div className="brand-block-text">
              <p className="eyebrow">Renewably</p>
              <h1>Grid intelligence</h1>
            </div>
          </div>
        </header>

        <div className="sidebar-body">
          <div className="sidebar-section-eyebrow" aria-hidden="true">
            Tools
          </div>

          <section
            className={
              openSections.optimization
                ? 'sidebar-panel sidebar-panel--optimization sidebar-panel--expanded'
                : 'sidebar-panel sidebar-panel--optimization'
            }
          >
            <button
              type="button"
              className="sidebar-panel-toggle"
              aria-expanded={openSections.optimization}
              aria-controls="sidebar-optimization-panel"
              onClick={() => toggleSection('optimization')}
            >
              <div className="sidebar-panel-heading">
                <div className="sidebar-panel-title-group">
                  <p className="panel-label">Optimization</p>
                  <span className="badge">Draft</span>
                </div>
                <span
                  className={
                    openSections.optimization
                      ? 'panel-toggle-icon panel-toggle-icon-open'
                      : 'panel-toggle-icon'
                  }
                  aria-hidden="true"
                />
              </div>
            </button>

            {openSections.optimization ? (
              <div
                id="sidebar-optimization-panel"
                className="sidebar-panel-content"
              >
                <div
                  className="mode-switch"
                  role="tablist"
                  aria-label="Optimization mode"
                >
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

              <div className="selection-summary">
                <span className="panel-label">Selected bounds</span>
                <p className="selection-hint">
                  Click to trace corners, then drag or edit the finished shape.
                </p>
                <strong>{boundingBoxSummary}</strong>
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
                    ? 'Cancel Area Drawing'
                    : 'Draw Selection Area'}
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
                  Edit Selection
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
                  Delete Selection
                </button>
                <button type="button" className="sidebar-submit">
                  Submit Optimization Request
                </button>
                </div>
              </div>
            ) : null}
          </section>

          <section className="sidebar-panel sidebar-panel--layers">
            <button
              type="button"
              className="sidebar-panel-toggle"
              aria-expanded={openSections.layers}
              aria-controls="sidebar-layers-panel"
              onClick={() => toggleSection('layers')}
            >
              <div className="sidebar-panel-heading">
                <div className="sidebar-panel-title-group">
                  <p className="panel-label">Map layers</p>
                  <span className="badge">{mapLayerBadgeLabel}</span>
                </div>
                <span
                  className={
                    openSections.layers
                      ? 'panel-toggle-icon panel-toggle-icon-open'
                      : 'panel-toggle-icon'
                  }
                  aria-hidden="true"
                />
              </div>
            </button>

            {openSections.layers ? (
              <div
                id="sidebar-layers-panel"
                className="sidebar-panel-content"
                role="radiogroup"
                aria-label="Map layer"
              >
                <div className="sidebar-layer-list">
                  <label className="sidebar-layer-card">
                    <div className="sidebar-layer-card-text">
                      <strong>Solar irradiation</strong>
                      <p>Heatmap from annual solar averages</p>
                    </div>
                    <input
                      type="radio"
                      name="map-layer"
                      checked={mapLayer === 'solar'}
                      onChange={() => {
                        startTransition(() => {
                          setMapLayer('solar')
                        })
                      }}
                    />
                  </label>
                  <label className="sidebar-layer-card">
                    <div className="sidebar-layer-card-text">
                      <strong>Wind speed</strong>
                      <p>Point layer from annual wind speed data</p>
                    </div>
                    <input
                      type="radio"
                      name="map-layer"
                      checked={mapLayer === 'wind'}
                      onChange={() => {
                        startTransition(() => {
                          setMapLayer('wind')
                        })
                      }}
                    />
                  </label>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      </aside>

      <section className="map-stage">
        <div className="map-frame">
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
                placeholder="Search areas"
                aria-label="Search areas"
              />
            </label>
            <button type="submit" className="map-search-button">
              Search
            </button>
          </form>

          <ArcGISMap
            solarVisible={solarVisible}
            windVisible={windVisible}
            boundingBox={boundingBox}
            boundingBoxSelectionActive={boundingBoxSelectionActive}
            editSelectionRequest={editSelectionRequest}
            onBoundingBoxSelectionChange={setBoundingBoxSelectionActive}
            onBoundingBoxSelect={setBoundingBox}
            locationSearchRequest={locationSearchRequest}
          />

          <div className="map-overlay overlay-legend">
            <div className="legend-header">
              <p className="panel-label">{legendTitle}</p>
              <span className="legend-unit">{legendUnit}</span>
            </div>
            <div
              className={
                solarVisible ? 'legend-bar' : 'legend-bar wind-legend-bar'
              }
              aria-hidden="true"
            />
            <div className="legend-values">
              {legendLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
