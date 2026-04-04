import { useState } from 'react'
import './App.css'
import { ArcGISMap } from './ArcGISMap'

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

function App() {
  const [solarVisible, setSolarVisible] = useState(true)
  const [windVisible, setWindVisible] = useState(true)
  const [optimizationMode, setOptimizationMode] =
    useState<OptimizationMode>('cash')
  const [optimizationValue, setOptimizationValue] = useState('')
  const [boundingBoxSelectionActive, setBoundingBoxSelectionActive] =
    useState(false)
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null)
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSearchRequest, setLocationSearchRequest] =
    useState<LocationSearchRequest | null>(null)
  const activeLayerCount = Number(solarVisible) + Number(windVisible)
  const inputLabel =
    optimizationMode === 'cash' ? 'Target power need' : 'Available budget'
  const inputPlaceholder =
    optimizationMode === 'cash' ? 'Enter required power' : 'Enter max budget'
  const inputUnit = optimizationMode === 'cash' ? 'kWh' : 'USD'
  const boundingBoxSummary = boundingBox
    ? 'Area selected on map'
    : 'No area selected'

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            R
          </div>
          <div>
            <p className="eyebrow">Renewably</p>
            <h1>Grid intelligence</h1>
          </div>
        </div>

        <section className="sidebar-panel">
          <div className="sidebar-panel-header">
            <p className="panel-label">Location search</p>
            <span className="badge">Map</span>
          </div>

          <label className="input-block">
            <span>Search location</span>
            <div className="search-row">
              <input
                type="text"
                value={locationQuery}
                onChange={(event) => setLocationQuery(event.target.value)}
                placeholder="Enter a city, state, or address"
              />
              <button
                type="button"
                className="search-button"
                onClick={() => {
                  const query = locationQuery.trim()
                  if (!query) {
                    return
                  }

                  setLocationSearchRequest({
                    id: Date.now(),
                    query,
                  })
                }}
              >
                Search
              </button>
            </div>
          </label>
        </section>

        <section className="sidebar-panel">
          <div className="sidebar-panel-header">
            <p className="panel-label">Optimization</p>
            <span className="badge">Draft</span>
          </div>

          <div className="mode-switch" role="tablist" aria-label="Optimization mode">
            <button
              type="button"
              className={optimizationMode === 'cash' ? 'mode-button active' : 'mode-button'}
              onClick={() => setOptimizationMode('cash')}
            >
              Cash optimization
            </button>
            <button
              type="button"
              className={optimizationMode === 'power' ? 'mode-button active' : 'mode-button'}
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
              Click points on the map to draw an area, then double-click your final point to finish.
            </p>
            <strong>{boundingBoxSummary}</strong>
          </div>

          <div className="action-stack">
            <button
              type="button"
              className={
                boundingBoxSelectionActive ? 'sidebar-action active' : 'sidebar-action'
              }
              onClick={() =>
                setBoundingBoxSelectionActive((current) => !current)
              }
            >
              {boundingBoxSelectionActive ? 'Cancel area drawing' : 'Draw selection area'}
            </button>
            <button type="button" className="sidebar-submit">
              Submit optimization request
            </button>
          </div>
        </section>

        <section className="sidebar-panel">
          <div className="sidebar-panel-header">
            <p className="panel-label">Map layers</p>
            <span className="badge">{activeLayerCount} active</span>
          </div>
          <label className="toggle-row">
            <div>
              <strong>Solar irradiation</strong>
              <p>Heatmap from annual solar averages</p>
            </div>
            <input
              type="checkbox"
              checked={solarVisible}
              onChange={(event) => setSolarVisible(event.target.checked)}
            />
          </label>
          <label className="toggle-row">
            <div>
              <strong>Wind speed</strong>
              <p>Point layer from annual wind speed data</p>
            </div>
            <input
              type="checkbox"
              checked={windVisible}
              onChange={(event) => setWindVisible(event.target.checked)}
            />
          </label>
        </section>
      </aside>

      <section className="map-stage">
        <div className="map-frame">
          <ArcGISMap
            solarVisible={solarVisible}
            windVisible={windVisible}
            boundingBoxSelectionActive={boundingBoxSelectionActive}
            onBoundingBoxSelectionChange={setBoundingBoxSelectionActive}
            onBoundingBoxSelect={setBoundingBox}
            locationSearchRequest={locationSearchRequest}
          />

          {solarVisible ? (
            <div className="map-overlay overlay-left">
              <p className="panel-label">Solar irradiation</p>
              <div className="legend-bar" aria-hidden="true" />
              <div className="legend-values">
                <span>Lower resource</span>
                <span>Strong resource</span>
                <span>Peak resource</span>
              </div>
            </div>
          ) : null}

          {windVisible ? (
            <div
              className={
                solarVisible ? 'map-overlay overlay-left overlay-left-secondary' : 'map-overlay overlay-left'
              }
            >
              <p className="panel-label">Wind speed</p>
              <div className="legend-bar wind-legend-bar" aria-hidden="true" />
              <div className="legend-values">
                <span>Lower wind</span>
                <span>Strong wind</span>
                <span>Peak wind</span>
              </div>
            </div>
          ) : null}

          <div className="map-overlay overlay-bottom">
            <div className="metric-chip">
              <span>Best solar</span>
              <strong>AZ · NV · NM</strong>
            </div>
            <div className="metric-chip">
              <span>Best wind</span>
              <strong>TX · IA · OK</strong>
            </div>
            <div className="metric-chip">
              <span>Grid stress</span>
              <strong>Southeast</strong>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export default App
