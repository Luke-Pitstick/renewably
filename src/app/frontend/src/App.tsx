import { useState } from 'react'
import './App.css'
import { ArcGISMap } from './ArcGISMap'

const menuItems = [
  { label: 'Live map', value: 'Map' },
  { label: 'Generation', value: 'Output' },
  { label: 'Forecasts', value: 'Forecast' },
  { label: 'Projects', value: 'Pipeline' },
]

const stateHighlights = [
  { state: 'California', mix: 'Solar heavy', intensity: '182 gCO2eq/kWh' },
  { state: 'Texas', mix: 'Wind + gas', intensity: '356 gCO2eq/kWh' },
  { state: 'Iowa', mix: 'Wind surplus', intensity: '128 gCO2eq/kWh' },
]

function App() {
  const [activeMenu, setActiveMenu] = useState('Map')
  const [solarVisible, setSolarVisible] = useState(true)
  const [windVisible, setWindVisible] = useState(true)
  const activeLayerCount = Number(solarVisible) + Number(windVisible)

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

        <nav className="menu" aria-label="Primary">
          {menuItems.map((item) => (
            <button
              key={item.value}
              type="button"
              className={item.value === activeMenu ? 'menu-item active' : 'menu-item'}
              onClick={() => setActiveMenu(item.value)}
            >
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </button>
          ))}
        </nav>

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
          <ArcGISMap solarVisible={solarVisible} windVisible={windVisible} />

          <div className="map-overlay overlay-left">
            <p className="panel-label">Solar irradiation</p>
            <div className="legend-bar" aria-hidden="true" />
            <div className="legend-values">
              <span>Lower resource</span>
              <span>Strong resource</span>
              <span>Peak resource</span>
            </div>
          </div>

          <div className="map-overlay overlay-right">
            <p className="panel-label">Recommended focus</p>
            <h3>Southwest solar corridor</h3>
            <p>
              Strong irradiance, low winter volatility, and large utility-scale
              siting opportunities.
            </p>
          </div>

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
