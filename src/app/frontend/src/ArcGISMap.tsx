import { useEffect, useRef } from 'react'

type ArcGISMapProps = {
  solarVisible: boolean
  windVisible: boolean
  boundingBoxSelectionActive: boolean
  locationSearchRequest: {
    id: number
    query: string
  } | null
  onBoundingBoxSelectionChange: (active: boolean) => void
  onBoundingBoxSelect: (boundingBox: {
    xmin: number
    ymin: number
    xmax: number
    ymax: number
  }) => void
}

type LayerHandle = {
  visible: boolean
}

type MapHandle = {
  add: (layer: unknown) => void
}

type GraphicsLayerHandle = {
  removeAll: () => void
}

type SketchHandle = {
  create: (tool: string) => void
  cancel: () => void
  on: (eventName: string, callback: (event: Record<string, unknown>) => void) => {
    remove: () => void
  }
}

type ViewHandle = {
  destroy: () => void
  zoom: number
  goTo: (target: unknown, options?: { animate?: boolean }) => Promise<unknown>
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

export function ArcGISMap({
  solarVisible,
  windVisible,
  boundingBoxSelectionActive,
  locationSearchRequest,
  onBoundingBoxSelectionChange,
  onBoundingBoxSelect,
}: ArcGISMapProps) {
  const mapElementRef = useRef<HTMLDivElement | null>(null)
  const solarLayerRef = useRef<LayerHandle | null>(null)
  const windLayerRef = useRef<LayerHandle | null>(null)
  const viewRef = useRef<ViewHandle | null>(null)
  const graphicsLayerRef = useRef<GraphicsLayerHandle | null>(null)
  const sketchViewModelRef = useRef<SketchHandle | null>(null)

  const updateZoom = (delta: number) => {
    if (!viewRef.current) {
      return
    }

    const nextZoom = Math.max(3, Math.min(11, viewRef.current.zoom + delta))
    viewRef.current.goTo({ zoom: nextZoom }, { animate: true }).catch(() => {})
  }

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
            'esri/layers/GraphicsLayer',
            'esri/widgets/Sketch/SketchViewModel',
          ],
          (...loaded: unknown[]) => {
            if (cancelled || !mapElementRef.current) {
              return
            }

            const [
              MapCtor,
              MapViewCtor,
              GeoJSONLayerCtor,
              GraphicsLayerCtor,
              SketchViewModelCtor,
            ] = loaded as [
              new (...args: unknown[]) => MapHandle,
              new (...args: unknown[]) => ViewHandle,
              new (...args: unknown[]) => LayerHandle,
              new (...args: unknown[]) => GraphicsLayerHandle,
              new (...args: unknown[]) => SketchHandle,
            ]

            const solarLayer = new GeoJSONLayerCtor({
              url: '/data/us_solar_surface.geojson',
              title: 'Solar irradiation',
              visible: solarVisible,
              popupEnabled: false,
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
              opacity: 0.56,
            })

            const windLayer = new GeoJSONLayerCtor({
              url: '/data/us_wind_surface.geojson',
              title: 'Wind speed',
              visible: windVisible,
              popupEnabled: false,
              renderer: {
                type: 'class-breaks',
                field: 'wind_value',
                defaultSymbol: {
                  type: 'simple-fill',
                  color: 'rgba(67, 124, 161, 0.46)',
                  outline: {
                    color: 'rgba(255, 255, 255, 0)',
                    width: 0,
                  },
                },
                classBreakInfos: [
                  {
                    minValue: 1.6,
                    maxValue: 2.1,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(78, 120, 160, 0.44)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Lower wind resource',
                  },
                  {
                    minValue: 2.1,
                    maxValue: 2.7,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(79, 165, 189, 0.5)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Moderate wind resource',
                  },
                  {
                    minValue: 2.7,
                    maxValue: 3.3,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(94, 212, 192, 0.56)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Balanced wind resource',
                  },
                  {
                    minValue: 3.3,
                    maxValue: 4.0,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(160, 232, 162, 0.62)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Strong wind resource',
                  },
                  {
                    minValue: 4.0,
                    maxValue: 4.6,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(214, 255, 114, 0.68)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Very strong wind resource',
                  },
                  {
                    minValue: 4.6,
                    maxValue: 5.0,
                    symbol: {
                      type: 'simple-fill',
                      color: 'rgba(255, 189, 89, 0.76)',
                      outline: { color: 'rgba(255,255,255,0)', width: 0 },
                    },
                    label: 'Peak wind resource',
                  },
                ],
              },
              opacity: 0.5,
            })

            solarLayerRef.current = solarLayer
            windLayerRef.current = windLayer

            const map = new MapCtor({
              basemap: 'dark-gray-vector',
            })

            map.add(solarLayer)
            map.add(windLayer)

            const graphicsLayer = new GraphicsLayerCtor()
            map.add(graphicsLayer)
            graphicsLayerRef.current = graphicsLayer

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
                components: ['attribution'],
              },
              highlightOptions: {
                color: '#c6ff7e',
                haloOpacity: 0.9,
                fillOpacity: 0.15,
              },
            })

            viewRef.current = view

            const sketchViewModel = new SketchViewModelCtor({
              view,
              layer: graphicsLayer,
              defaultCreateOptions: {
                mode: 'click',
              },
              polygonSymbol: {
                type: 'simple-fill',
                color: [214, 255, 114, 0.1],
                outline: {
                  color: [214, 255, 114, 0.95],
                  width: 2,
                },
              },
            })

            sketchViewModel.on('create', (event) => {
              const state = event.state

              if (state === 'start') {
                graphicsLayer.removeAll()
              }

              if (state !== 'complete') {
                return
              }

              const graphic = event.graphic as {
                geometry?: {
                  extent?: {
                    xmin: number
                    ymin: number
                    xmax: number
                    ymax: number
                  }
                }
              }

              const extent = graphic.geometry?.extent
              if (!extent) {
                onBoundingBoxSelectionChange(false)
                return
              }

              onBoundingBoxSelect({
                xmin: extent.xmin,
                ymin: extent.ymin,
                xmax: extent.xmax,
                ymax: extent.ymax,
              })
              onBoundingBoxSelectionChange(false)
            })

            sketchViewModelRef.current = sketchViewModel
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
      graphicsLayerRef.current = null
      sketchViewModelRef.current = null
      viewRef.current = null
      view?.destroy()
    }
  }, [onBoundingBoxSelect, onBoundingBoxSelectionChange])

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

  useEffect(() => {
    if (!sketchViewModelRef.current || !graphicsLayerRef.current) {
      return
    }

    if (boundingBoxSelectionActive) {
      graphicsLayerRef.current.removeAll()
      sketchViewModelRef.current.cancel()
      sketchViewModelRef.current.create('polygon')
      return
    }

    sketchViewModelRef.current.cancel()
  }, [boundingBoxSelectionActive])

  useEffect(() => {
    if (!locationSearchRequest || !viewRef.current || !window.require) {
      return
    }

    window.require(
      ['esri/rest/locator'],
      (...loaded: unknown[]) => {
        const [locator] = loaded as [
          {
            addressToLocations: (url: string, params: { address: { SingleLine: string } }) => Promise<
              Array<{
                location?: {
                  longitude: number
                  latitude: number
                }
                extent?: {
                  xmin: number
                  ymin: number
                  xmax: number
                  ymax: number
                }
              }>
            >
          },
        ]

        locator
          .addressToLocations('https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer', {
            address: {
              SingleLine: locationSearchRequest.query,
            },
          })
          .then((results) => {
            const firstResult = results[0]
            if (!firstResult || !viewRef.current) {
              return
            }

            if (firstResult.extent) {
              viewRef.current.goTo(firstResult.extent, { animate: true }).catch(() => {})
              return
            }

            const point = firstResult.location
            if (!point) {
              return
            }

            viewRef.current
              .goTo(
                {
                  center: [point.longitude, point.latitude],
                  zoom: 9,
                },
                { animate: true },
              )
              .catch(() => {})
          })
          .catch(() => {})
      },
    )
  }, [locationSearchRequest])

  return (
    <>
      <div ref={mapElementRef} className="arcgis-map" aria-label="United States map" />
      <div className="map-zoom-controls" aria-label="Map zoom controls">
        <button type="button" className="zoom-button" onClick={() => updateZoom(1)}>
          +
        </button>
        <button type="button" className="zoom-button" onClick={() => updateZoom(-1)}>
          -
        </button>
      </div>
    </>
  )
}
