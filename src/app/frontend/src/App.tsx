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

const stateHighlights = [
  { state: 'California', mix: 'Solar heavy', intensity: '182 gCO2eq/kWh' },
  { state: 'Texas', mix: 'Wind + gas', intensity: '356 gCO2eq/kWh' },
  { state: 'Iowa', mix: 'Wind surplus', intensity: '128 gCO2eq/kWh' },
]

function App() {
  const [solarVisible, setSolarVisible] = useState(true)
  const [windVisible, setWindVisible] = useState(true)
  const [optimizationMode, setOptimizationMode] =
    useState<OptimizationMode>('cash')
  const [optimizationValue, setOptimizationValue] = useState('')
  const [boundingBoxSelectionActive, setBoundingBoxSelectionActive] =
    useState(false)
  const [boundingBox, setBoundingBox] = useState<BoundingBox | null>(null)
  const activeLayerCount = Number(solarVisible) + Number(windVisible)
  const inputLabel =
    optimizationMode === 'cash' ? 'Target power need' : 'Available budget'
  const inputPlaceholder =
    optimizationMode === 'cash' ? 'Enter required power in kWh' : 'Enter max budget in USD'
  const boundingBoxSummary = boundingBox
    ? `${boundingBox.xmin.toFixed(1)}, ${boundingBox.ymin.toFixed(1)} to ${boundingBox.xmax.toFixed(1)}, ${boundingBox.ymax.toFixed(1)}`
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
            <input
              type="text"
              value={optimizationValue}
              onChange={(event) => setOptimizationValue(event.target.value)}
              placeholder={inputPlaceholder}
            />
          </label>

          <div className="selection-summary">
            <span className="panel-label">Bounding box</span>
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
              {boundingBoxSelectionActive ? 'Cancel bounding box' : 'Place bounding box'}
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

        <section className="sidebar-panel">
          <p className="panel-label">National overview</p>
          <div className="panel-stat">
            <span>Renewable share</span>
            <strong>43.8%</strong>
          </div>
          <div className="panel-stat">
            <span>Demand served</span>
            <strong>512 GW</strong>
          </div>
          <div className="panel-stat">
            <span>Storage dispatch</span>
            <strong>61 GW</strong>
          </div>
        </section>

        <section className="sidebar-panel">
          <div className="sidebar-panel-header">
            <p className="panel-label">State snapshots</p>
            <span className="badge">Live</span>
          </div>
          <div className="state-list">
            {stateHighlights.map((item) => (
              <article key={item.state} className="state-card">
                <div>
                  <h2>{item.state}</h2>
                  <p>{item.mix}</p>
                </div>
                <strong>{item.intensity}</strong>
              </article>
            ))}
          </div>
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
