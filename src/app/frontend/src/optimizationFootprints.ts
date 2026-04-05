export type OptimizationFootprintSite = {
  lat: number
  lon: number
  device_type: 'solar' | 'wind'
  installed_capacity_kw?: number
}

const METERS_PER_DEGREE_LAT = 111_320
const SOLAR_WIDTH_METERS = 260
const SOLAR_HEIGHT_METERS = 150
const WIND_RADIUS_METERS = 170

function metersToLatitudeDegrees(meters: number) {
  return meters / METERS_PER_DEGREE_LAT
}

function metersToLongitudeDegrees(meters: number, latitude: number) {
  const latitudeRadians = (latitude * Math.PI) / 180
  const metersPerDegreeLongitude =
    METERS_PER_DEGREE_LAT * Math.max(Math.cos(latitudeRadians), 0.15)

  return meters / metersPerDegreeLongitude
}

function footprintScale(installedCapacityKw?: number) {
  if (
    installedCapacityKw === undefined ||
    !Number.isFinite(installedCapacityKw) ||
    installedCapacityKw <= 0
  ) {
    return 1
  }

  return Math.max(0.85, Math.min(1.65, Math.sqrt(installedCapacityKw)))
}

function rotateOffsets(
  offsets: Array<[eastMeters: number, northMeters: number]>,
  angleDegrees: number,
) {
  const angleRadians = (angleDegrees * Math.PI) / 180
  const sinAngle = Math.sin(angleRadians)
  const cosAngle = Math.cos(angleRadians)

  return offsets.map(([eastMeters, northMeters]) => [
    eastMeters * cosAngle - northMeters * sinAngle,
    eastMeters * sinAngle + northMeters * cosAngle,
  ] as [number, number])
}

function offsetsToRing(
  site: OptimizationFootprintSite,
  offsets: Array<[eastMeters: number, northMeters: number]>,
) {
  const ring = offsets.map(([eastMeters, northMeters]) => [
    site.lon + metersToLongitudeDegrees(eastMeters, site.lat),
    site.lat + metersToLatitudeDegrees(northMeters),
  ])

  const [firstLon, firstLat] = ring[0]
  ring.push([firstLon, firstLat])
  return ring
}

function buildSolarFootprintRing(site: OptimizationFootprintSite) {
  const scale = footprintScale(site.installed_capacity_kw)
  const halfWidth = (SOLAR_WIDTH_METERS * scale) / 2
  const halfHeight = (SOLAR_HEIGHT_METERS * scale) / 2

  return offsetsToRing(
    site,
    rotateOffsets(
      [
        [-halfWidth, -halfHeight],
        [halfWidth, -halfHeight],
        [halfWidth, halfHeight],
        [-halfWidth, halfHeight],
      ],
      -14,
    ),
  )
}

function buildWindFootprintRing(site: OptimizationFootprintSite) {
  const radius = WIND_RADIUS_METERS * footprintScale(site.installed_capacity_kw)
  const vertexCount = 8
  const offsets = Array.from({ length: vertexCount }, (_, index) => {
    const angleRadians = ((22.5 + index * (360 / vertexCount)) * Math.PI) / 180
    return [
      Math.cos(angleRadians) * radius,
      Math.sin(angleRadians) * radius,
    ] as [number, number]
  })

  return offsetsToRing(site, offsets)
}

export function buildOptimizationFootprintRing(site: OptimizationFootprintSite) {
  return site.device_type === 'solar'
    ? buildSolarFootprintRing(site)
    : buildWindFootprintRing(site)
}
