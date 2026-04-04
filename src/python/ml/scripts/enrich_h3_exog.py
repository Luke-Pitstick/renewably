"""
H3 Exogenous Variable Enrichment Script
========================================
Paste cells into your notebook after you have a Polars df
with columns: h3_index, lat, lng, has_turbine (or has_solar).

Adds: elevation, slope, aspect, roughness, wind speed,
land cover, population density, distance to transmission lines,
distance to roads.
"""

# %% Cell 0: Install dependencies (run once)
# !pip install rasterio scipy requests geopandas polars h3

# %% Cell 1: Imports & setup
import ee
import numpy as np
import polars as pl
import geopandas as gpd
import requests
import json
import os
import h3
from scipy.spatial import cKDTree
from shapely.geometry import Point
from tqdm import tqdm

ee.Initialize()

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(""), "..", "data"))
os.makedirs(DATA_DIR, exist_ok=True)

# Assumes wind_df or solar_df already exists as a Polars DataFrame
# with columns: h3_index, lat, lng, has_turbine/has_solar
# We'll call it `df` below — reassign as needed:
# df = wind_df  # or solar_df


# %% Cell 2: Helper — upload centroids to GEE as FeatureCollection
def centroids_to_ee_fc(df: pl.DataFrame) -> ee.FeatureCollection:
    """Convert H3 centroid lat/lng to an ee.FeatureCollection of points."""
    features = []
    for row in df.select("h3_index", "lat", "lng").iter_rows(named=True):
        feat = ee.Feature(
            ee.Geometry.Point([row["lng"], row["lat"]]),
            {"h3_index": row["h3_index"]},
        )
        features.append(feat)
    return ee.FeatureCollection(features)


# %% Cell 3: Elevation, slope, aspect, roughness (SRTM 30m via GEE)
def fetch_elevation_features(fc: ee.FeatureCollection) -> dict:
    """
    Sample SRTM elevation at each centroid.
    Also computes slope, aspect from the DEM.
    Returns dict of h3_index -> {elev, slope, aspect, roughness}.
    """
    dem = ee.Image("USGS/SRTMGL1_003")
    terrain = ee.Terrain.products(dem)  # bands: elevation, slope, aspect

    # Roughness: std dev of elevation in a 3x3 kernel (~90m)
    roughness = dem.reduceNeighborhood(
        reducer=ee.Reducer.stdDev(),
        kernel=ee.Kernel.square(3, "pixels"),
    ).rename("roughness")

    combined = terrain.addBands(roughness)

    sampled = combined.sampleRegions(
        collection=fc,
        scale=30,
        geometries=False,
    )

    results = sampled.getInfo()
    out = {}
    for feat in results["features"]:
        p = feat["properties"]
        out[p["h3_index"]] = {
            "h3_elev_mean": p.get("elevation"),
            "h3_slope_mean_deg": p.get("slope"),
            "h3_aspect_mean_deg": p.get("aspect"),
            "h3_roughness": p.get("roughness"),
        }
    return out


# %% Cell 4: Wind speed (ERA5 monthly via GEE)
def fetch_wind_features(fc: ee.FeatureCollection) -> dict:
    """
    Sample long-term mean wind speed at 10m from ERA5 monthly.
    We compute the mean over all months and also the std dev.
    """
    era5 = (
        ee.ImageCollection("ECMWF/ERA5_LAND/MONTHLY_AGGR")
        .select(["u_component_of_wind_10m", "v_component_of_wind_10m"])
    )

    # Compute wind speed magnitude for each month, then reduce
    def wind_speed(img):
        u = img.select("u_component_of_wind_10m")
        v = img.select("v_component_of_wind_10m")
        speed = u.pow(2).add(v.pow(2)).sqrt().rename("wind_speed_10m")
        return speed

    speeds = era5.map(wind_speed)
    mean_speed = speeds.mean().rename("wind_10m_avg")
    std_speed = speeds.reduce(ee.Reducer.stdDev()).rename("wind_10m_std")
    combined = mean_speed.addBands(std_speed)

    sampled = combined.sampleRegions(
        collection=fc,
        scale=11132,  # ERA5 ~0.1 deg
        geometries=False,
    )

    results = sampled.getInfo()
    out = {}
    for feat in results["features"]:
        p = feat["properties"]
        out[p["h3_index"]] = {
            "h3_wind_10m_avg": p.get("wind_10m_avg"),
            "h3_wind_10m_std": p.get("wind_10m_std"),
        }
    return out


# %% Cell 5: Land cover (NLCD 2021 via GEE)
def fetch_landcover_features(fc: ee.FeatureCollection) -> dict:
    """
    Sample NLCD 2021 land cover class at each centroid.
    Returns the dominant class code and simplified fractions
    (point sample, so it's the class at the centroid).
    """
    nlcd = ee.Image("USGS/NLCD_RELEASES/2021_REL/NLCD/2021").select("landcover")

    sampled = nlcd.sampleRegions(
        collection=fc,
        scale=30,
        geometries=False,
    )

    # NLCD class groupings
    forest_codes = {41, 42, 43}
    crop_codes = {81, 82}
    urban_codes = {21, 22, 23, 24}
    grass_codes = {71}
    water_codes = {11}

    results = sampled.getInfo()
    out = {}
    for feat in results["features"]:
        p = feat["properties"]
        lc = p.get("landcover", 0)
        out[p["h3_index"]] = {
            "h3_land_cover_code": lc,
            "h3_cover_is_forest": int(lc in forest_codes),
            "h3_cover_is_crop": int(lc in crop_codes),
            "h3_cover_is_urban": int(lc in urban_codes),
            "h3_cover_is_grass": int(lc in grass_codes),
            "h3_cover_is_water": int(lc in water_codes),
        }
    return out


# %% Cell 6: Population density (GPWv4 via GEE)
def fetch_population_features(fc: ee.FeatureCollection) -> dict:
    """
    Sample population density from GPWv4 (persons per km²).
    """
    pop = (
        ee.ImageCollection("CIESIN/GPWv411/GPW_Population_Density")
        .sort("system:time_start", False)
        .first()
        .select("population_density")
    )

    sampled = pop.sampleRegions(
        collection=fc,
        scale=927.67,  # GPWv4 native ~1km
        geometries=False,
    )

    results = sampled.getInfo()
    out = {}
    for feat in results["features"]:
        p = feat["properties"]
        out[p["h3_index"]] = {
            "h3_pop_density_km2": p.get("population_density"),
        }
    return out


# %% Cell 7: Distance to transmission lines (HIFLD — local download + KDTree)
def fetch_transmission_distances(df: pl.DataFrame) -> dict:
    """
    Download HIFLD transmission lines GeoJSON and compute distance
    from each H3 centroid to the nearest line vertex using a KDTree.
    """
    hifld_path = os.path.join(DATA_DIR, "transmission_lines.geojson")

    if not os.path.exists(hifld_path):
        print("Downloading HIFLD transmission lines (this may take a minute)...")
        url = (
            "https://services1.arcgis.com/Hp6G80Pky0om6HgA/arcgis/rest/services/"
            "Transmission_Lines/FeatureServer/0/query"
            "?where=1%3D1&outFields=*&f=geojson&resultRecordCount=50000"
        )
        # Paginate to get all features
        all_features = []
        offset = 0
        while True:
            resp = requests.get(url + f"&resultOffset={offset}", timeout=120)
            data = resp.json()
            feats = data.get("features", [])
            if not feats:
                break
            all_features.extend(feats)
            print(f"  Downloaded {len(all_features)} features...")
            offset += len(feats)
            if len(feats) < 50000:
                break

        geojson = {"type": "FeatureCollection", "features": all_features}
        with open(hifld_path, "w") as f:
            json.dump(geojson, f)
        print(f"Saved {len(all_features)} transmission line features.")

    print("Loading transmission lines...")
    gdf = gpd.read_file(hifld_path)

    # Extract all line vertices as points
    coords = []
    for geom in gdf.geometry:
        if geom is None:
            continue
        if geom.geom_type == "MultiLineString":
            for line in geom.geoms:
                coords.extend(line.coords)
        elif geom.geom_type == "LineString":
            coords.extend(geom.coords)
    coords = np.array(coords)  # shape (N, 2) in (lng, lat)
    print(f"  {len(coords)} transmission line vertices")

    # Build KDTree in radians for haversine-approximate distances
    coords_rad = np.radians(coords[:, ::-1])  # (lat, lng) in radians
    tree = cKDTree(coords_rad)

    # Query all H3 centroids
    lats = df["lat"].to_numpy()
    lngs = df["lng"].to_numpy()
    query_rad = np.radians(np.column_stack([lats, lngs]))
    dists, _ = tree.query(query_rad)

    # Convert radian distance to km (Earth radius ~6371 km)
    dists_km = dists * 6371.0

    h3_indices = df["h3_index"].to_list()
    return {
        h3_indices[i]: {"h3_dist_to_transmission_km": float(dists_km[i])}
        for i in range(len(h3_indices))
    }


# %% Cell 8: Distance to major roads (TIGER primary roads — local download + KDTree)
def fetch_road_distances(df: pl.DataFrame) -> dict:
    """
    Download TIGER/Line primary roads shapefile and compute distance
    from each H3 centroid to the nearest road vertex.
    """
    roads_dir = os.path.join(DATA_DIR, "tiger_roads")
    roads_shp = os.path.join(roads_dir, "tl_2023_us_primaryroads.shp")

    if not os.path.exists(roads_shp):
        print("Downloading TIGER primary roads shapefile...")
        os.makedirs(roads_dir, exist_ok=True)
        url = "https://www2.census.gov/geo/tiger/TIGER2023/PRIMARYROADS/tl_2023_us_primaryroads.zip"
        resp = requests.get(url, timeout=120)
        zip_path = os.path.join(roads_dir, "roads.zip")
        with open(zip_path, "wb") as f:
            f.write(resp.content)
        import zipfile
        with zipfile.ZipFile(zip_path, "r") as z:
            z.extractall(roads_dir)
        print("Extracted roads shapefile.")

    print("Loading roads...")
    gdf = gpd.read_file(roads_shp)

    coords = []
    for geom in gdf.geometry:
        if geom is None:
            continue
        if geom.geom_type == "MultiLineString":
            for line in geom.geoms:
                coords.extend(line.coords)
        elif geom.geom_type == "LineString":
            coords.extend(geom.coords)
    coords = np.array(coords)
    print(f"  {len(coords)} road vertices")

    coords_rad = np.radians(coords[:, ::-1])  # (lat, lng) in radians
    tree = cKDTree(coords_rad)

    lats = df["lat"].to_numpy()
    lngs = df["lng"].to_numpy()
    query_rad = np.radians(np.column_stack([lats, lngs]))
    dists, _ = tree.query(query_rad)
    dists_km = dists * 6371.0

    h3_indices = df["h3_index"].to_list()
    return {
        h3_indices[i]: {"h3_dist_to_major_road_km": float(dists_km[i])}
        for i in range(len(h3_indices))
    }


# %% Cell 9: Run all enrichments and join to DataFrame
GEE_BATCH_SIZE = 5000  # GEE sampleRegions limit


def enrich_dataframe(df: pl.DataFrame) -> pl.DataFrame:
    """Run all enrichment steps and join results into the DataFrame.
    Batches GEE calls to handle large DataFrames (200k+ rows).
    """
    n = len(df)
    n_batches = (n + GEE_BATCH_SIZE - 1) // GEE_BATCH_SIZE

    # --- GEE-based enrichments (batched) ---
    elev_data = {}
    wind_data = {}
    lc_data = {}
    pop_data = {}

    print(f"=== GEE enrichment: {n} rows in {n_batches} batches of {GEE_BATCH_SIZE} ===")
    for i in tqdm(range(0, n, GEE_BATCH_SIZE), desc="GEE batches", total=n_batches):
        batch_df = df.slice(i, GEE_BATCH_SIZE)
        fc = centroids_to_ee_fc(batch_df)

        elev_data.update(fetch_elevation_features(fc))
        wind_data.update(fetch_wind_features(fc))
        lc_data.update(fetch_landcover_features(fc))
        pop_data.update(fetch_population_features(fc))

    # --- Local enrichments (no batching needed) ---
    print("\n=== 5/6 Distance to Transmission Lines (HIFLD) ===")
    trans_data = fetch_transmission_distances(df)

    print("\n=== 6/6 Distance to Major Roads (TIGER) ===")
    road_data = fetch_road_distances(df)

    # Merge all dicts into one per h3_index
    all_indices = df["h3_index"].to_list()
    records = []
    for idx in tqdm(all_indices, desc="Merging features"):
        row = {"h3_index": idx}
        for d in [elev_data, wind_data, lc_data, pop_data, trans_data, road_data]:
            row.update(d.get(idx, {}))
        records.append(row)

    exog_df = pl.DataFrame(records)

    # Join to original df
    enriched = df.join(exog_df, on="h3_index", how="left")
    print(f"\nDone! Shape: {enriched.shape}")
    print(f"Columns: {enriched.columns}")
    return enriched


# %% Cell 10: Execute
# Uncomment and run:
# df = wind_df  # or solar_df
# enriched_df = enrich_dataframe(df)
# enriched_df.head()
