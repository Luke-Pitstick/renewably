import { useEffect, useRef } from 'react'

type ArcGISMapProps = {
  solarVisible: boolean
  windVisible: boolean
}

type LayerHandle = {
  visible: boolean
}

type MapHandle = {
  add: (layer: unknown) => void
}

type ViewHandle = {
  destroy: () => void
}

declare global {
  interface Window {
    require?: (modules: string[], callback: (...loaded: unknown[]) => void) => void
    __arcgisPromise?: Promise<void>
  }
}

function loadArcGISApi() {
  if (window.require) {
    return Promise.resolve()
  }

  if (window.__arcgisPromise) {
    return window.__arcgisPromise
  }

  window.__arcgisPromise = new Promise<void>((resolve, reject) => {
    const css = document.createElement('link')
    css.rel = 'stylesheet'
    css.href = 'https://js.arcgis.com/4.30/esri/themes/dark/main.css'
    document.head.appendChild(css)

    const script = document.createElement('script')
    script.src = 'https://js.arcgis.com/4.30/'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Unable to load ArcGIS API'))
    document.body.appendChild(script)
  })

  return window.__arcgisPromise
}

export function ArcGISMap({ solarVisible, windVisible }: ArcGISMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const solarLayerRef = useRef<LayerHandle | null>(null)
  const windLayerRef = useRef<LayerHandle | null>(null)

  useEffect(() => {
    let view: ViewHandle | null = null
    let cancelled = false

    loadArcGISApi()
      .then(() => {
        if (cancelled || !mapElementRef.current || !window.require) {
          return
        }

        window.require(
          [
            'esri/Map',
            'esri/views/MapView',
            'esri/layers/GeoJSONLayer',
          ],
          (...loaded: unknown[]) => {
            if (cancelled || !mapElementRef.current) {
              return
            }

            const [MapCtor, MapViewCtor, GeoJSONLayerCtor] = loaded as [
              new (...args: unknown[]) => MapHandle,
              new (...args: unknown[]) => ViewHandle,
              new (...args: unknown[]) => LayerHandle,
            ]

            const solarLayer = new GeoJSONLayerCtor({
              url: '/data/us_solar_surface.geojson',
              title: 'Solar irradiation',
              visible: solarVisible,
              renderer: {
                type: 'class-breaks',
                field: 'solar_value',
                defaultSymbol: {
                  type: 'simple-fill',
                  color: 'rgba(61, 116, 100, 0.55)',
                  outline: {
                    color: 'rgba(255, 255, 255, 0)',
                    width: 0,
                  },
                },
                classBreakInfos: [
                  {
                    minValue: 3770000,
                    maxValue: 4100000,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(61, 116, 100, 0.50)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Lower solar resource',
                  },
                  {
                    minValue: 4100000,
                    maxValue: 4400000,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(92, 149, 97, 0.56)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Moderate solar resource',
                  },
                  {
                    minValue: 4400000,
                    maxValue: 4700000,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(126, 192, 106, 0.62)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Balanced solar resource',
                  },
                  {
                    minValue: 4700000,
                    maxValue: 5000000,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(214, 255, 114, 0.68)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Strong solar resource',
                  },
                  {
                    minValue: 5000000,
                    maxValue: 5250000,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(255, 189, 89, 0.74)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Very strong solar resource',
                  },
                  {
                    minValue: 5250000,
                    maxValue: 5600000,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(255, 112, 76, 0.82)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Peak solar resource',
                  },
                ],
              },
              popupTemplate: {
                title: 'Solar irradiation sample',
                content: 'Interpolated annual mean solar value: {solar_value}',
              },
              opacity: 0.88,
            })

            const windLayer = new GeoJSONLayerCtor({
              url: '/data/us_wind_speed_lower48.geojson',
              title: 'Wind speed',
              visible: windVisible,
              renderer: {
                type: 'simple',
                symbol: {
                  type: 'simple-marker',
                  style: 'circle',
                  color: '#8fe081',
                  outline: {
                    color: 'rgba(5, 15, 13, 0.7)',
                    width: 0.8,
                  },
                },
                visualVariables: [
                  {
                    type: 'size',
                    field: 'annual_mean_wind_speed',
                    minDataValue: 1,
                    maxDataValue: 8,
                    minSize: 4,
                    maxSize: 18,
                  },
                  {
                    type: 'color',
                    field: 'annual_mean_wind_speed',
                    stops: [
                      { value: 1, color: '#8bd3ff' },
                      { value: 3, color: '#68f0cb' },
                      { value: 5, color: '#d6ff72' },
                      { value: 7, color: '#ffad5a' },
                    ],
                  },
                ],
              },
              popupTemplate: {
                title: 'Wind speed sample',
                content:
                  'Annual mean wind speed: {annual_mean_wind_speed} m/s<br/>Year: {year}',
              },
            })

            solarLayerRef.current = solarLayer
            windLayerRef.current = windLayer

            const map = new MapCtor({
              basemap: 'dark-gray-vector',
            })

            map.add(solarLayer)
            map.add(windLayer)

            view = new MapViewCtor({
              container: mapElementRef.current,
              map,
              center: [-98.5795, 39.8283],
              zoom: 4,
              constraints: {
                minZoom: 3,
                maxZoom: 11,
              },
              ui: {
                components: ['zoom', 'attribution'],
              },
              highlightOptions: {
                color: '#c6ff7e',
                haloOpacity: 0.9,
                fillOpacity: 0.15,
              },
            })
          },
        )
      })
      .catch((error) => {
        console.error(error)
      })

    return () => {
      cancelled = true
      solarLayerRef.current = null
      windLayerRef.current = null
      view?.destroy()
    }
  }, [])

  useEffect(() => {
    if (solarLayerRef.current) {
      solarLayerRef.current.visible = solarVisible
    }
  }, [solarVisible])

  useEffect(() => {
    if (windLayerRef.current) {
      windLayerRef.current.visible = windVisible
    }
  }, [windVisible])

  return <div ref={mapElementRef} className="arcgis-map" aria-label="United States map" />
}
