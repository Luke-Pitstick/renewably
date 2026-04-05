import math
import json
from functools import lru_cache
from pathlib import Path
from typing import Literal

import joblib
import modal
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

app = modal.App("energy-predictor")

BACKEND_DIR = Path(__file__).resolve().parent
MODEL_DIR = BACKEND_DIR.parent / "ml" / "models"
SOLAR_MODEL_FILE = MODEL_DIR / "solar_xgboost_model.pkl"
WIND_MODEL_FILE = MODEL_DIR / "wind_xgboost_model.pkl"
VOLUME_SOLAR_MODEL_PATH = "/models/solar_xgboost_model.pkl"
VOLUME_WIND_MODEL_PATH = "/models/wind_xgboost_model.pkl"
FALLBACK_SOLAR_MODEL_PATH = "/seed_models/solar_xgboost_model.pkl"
FALLBACK_WIND_MODEL_PATH = "/seed_models/wind_xgboost_model.pkl"

image = modal.Image.debian_slim().pip_install(
    "fastapi",
    "pydantic",
    "joblib",
    "xgboost",
    "scikit-learn",
    "pandas",
    "numpy",
)
image = image.add_local_file(
    local_path=SOLAR_MODEL_FILE,
    remote_path=FALLBACK_SOLAR_MODEL_PATH,
)
image = image.add_local_file(
    local_path=WIND_MODEL_FILE,
    remote_path=FALLBACK_WIND_MODEL_PATH,
)

volume = modal.Volume.from_name("energy-models", create_if_missing=True)

web_app = FastAPI()
web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# First Solar Series 7 TR1 datasheet lists a nominal power range of 525-550 W,
# so use the midpoint as a representative module for optimization cost modeling.
SERIES7_NOMINAL_POWER_WDC = 537.5
# NREL 2024 ATB utility-scale PV assumptions use an ILR of 1.34, 2023 CAPEX of
# $1.56/W_AC, and fixed O&M of $22/kW_AC-year. We treat the Series 7 lifetime
# cost as 30 years of utility-scale ownership for one representative module.
PV_ILR = 1.34
PV_CAPEX_USD_PER_WAC = 1.56
PV_FIXED_OM_USD_PER_KWAC_YEAR = 22.0
PV_LIFETIME_YEARS = 30
SERIES7_EQUIVALENT_POWER_KWAC = (SERIES7_NOMINAL_POWER_WDC / PV_ILR) / 1000
SOLAR_LIFETIME_COST_USD_PER_KWAC = (
    SERIES7_EQUIVALENT_POWER_KWAC * PV_CAPEX_USD_PER_WAC * 1000
    + SERIES7_EQUIVALENT_POWER_KWAC
    * PV_FIXED_OM_USD_PER_KWAC_YEAR
    * PV_LIFETIME_YEARS
) / SERIES7_EQUIVALENT_POWER_KWAC
# NREL ATB land-based wind representative capital cost and O&M assumptions.
WIND_CAPEX_USD_PER_KW = 1370.0
WIND_FIXED_OM_USD_PER_KW_YEAR = 39.0
WIND_LIFETIME_YEARS = 30
WIND_LIFETIME_COST_USD_PER_KW = (
    WIND_CAPEX_USD_PER_KW + WIND_FIXED_OM_USD_PER_KW_YEAR * WIND_LIFETIME_YEARS
)
OPTIMIZATION_BUILD_BLOCK_KW = 1.0
DEFAULT_ELEVATION_METERS = 0.0
DEFAULT_SAMPLE_COUNT = 10_000
MIN_MODEL_PROBABILITY = 0.05
HOURS_PER_YEAR = 8760.0


def jm2_to_kwh(irradiation_jm2: float) -> float:
    return irradiation_jm2 / 3_600_000


def estimate_series7_energy(
    irradiation_kwh_m2: float,
    area: float = 2.80,
    efficiency: float = 0.197,
    performance_ratio: float = 0.85,
) -> float:
    return irradiation_kwh_m2 * area * efficiency * performance_ratio


def _weibull_pdf(v: np.ndarray, k: float, c: float) -> np.ndarray:
    return (k / c) * (v / c) ** (k - 1) * np.exp(-(v / c) ** k)


def _adjust_to_hub_height(
    v_ref: float,
    z_ref: float = 10,
    z_hub: float = 100,
    alpha: float = 0.14,
) -> float:
    return v_ref * (z_hub / z_ref) ** alpha


def _simple_power_curve(
    v: float,
    cut_in: float = 3.0,
    rated: float = 12.0,
    cut_out: float = 25.0,
    rated_power: float = 3000.0,
) -> float:
    if v < cut_in or v >= cut_out:
        return 0.0
    if v < rated:
        return rated_power * ((v**3 - cut_in**3) / (rated**3 - cut_in**3))
    return rated_power


def estimate_aep_from_mean_speed(
    mean_speed_10m: float,
    k: float = 2.0,
    z_ref: float = 10,
    z_hub: float = 100,
    alpha: float = 0.14,
    rated_power_kw: float = 3000.0,
) -> dict[str, float]:
    mean_speed_hub = _adjust_to_hub_height(mean_speed_10m, z_ref, z_hub, alpha)
    c = mean_speed_hub / math.gamma(1 + 1 / k)

    v = np.linspace(0, 40, 4001)
    pdf = _weibull_pdf(v, k, c)
    power = np.array(
        [_simple_power_curve(float(x), rated_power=rated_power_kw) for x in v]
    )

    avg_power_kw = np.trapezoid(power * pdf, v)
    aep_kwh = avg_power_kw * 8760

    return {
        "mean_speed_hub_mps": mean_speed_hub,
        "average_power_kw": float(avg_power_kw),
        "annual_energy_kwh": float(aep_kwh),
        "capacity_factor": float(avg_power_kw / rated_power_kw),
    }


class BoundingBoxRequest(BaseModel):
    xmin: float
    ymin: float
    xmax: float
    ymax: float


class SolarRequest(BaseModel):
    lat: float
    lon: float
    elevation: float


class WindRequest(BaseModel):
    lat: float
    lon: float
    elevation: float


class OptimizationRequest(BaseModel):
    mode: Literal["cash", "power"]
    target_value: float = Field(gt=0)
    bounding_box: BoundingBoxRequest
    sample_count: int = Field(default=DEFAULT_SAMPLE_COUNT, ge=100, le=10_000)
    elevation: float = Field(default=DEFAULT_ELEVATION_METERS)


def _sample_points_in_bbox(
    bounding_box: BoundingBoxRequest,
    sample_count: int,
    elevation: float,
) -> pd.DataFrame:
    rng = np.random.default_rng()
    lons = rng.uniform(bounding_box.xmin, bounding_box.xmax, sample_count)
    lats = rng.uniform(bounding_box.ymin, bounding_box.ymax, sample_count)

    return pd.DataFrame(
        {
            "lat": lats,
            "lon": lons,
            "elevation": np.full(sample_count, elevation, dtype=float),
        }
    )


def _convert_solar_to_power_kwh(solar_values: np.ndarray) -> np.ndarray:
    converter = np.vectorize(
        lambda value: estimate_series7_energy(
            jm2_to_kwh(max(float(value), 0.0))
        ),
        otypes=[float],
    )
    panel_hourly_output_kwh = converter(solar_values)
    return panel_hourly_output_kwh / SERIES7_EQUIVALENT_POWER_KWAC


@lru_cache(maxsize=2048)
def _wind_energy_from_speed(mean_speed_10m: float) -> float:
    return float(
        estimate_aep_from_mean_speed(mean_speed_10m=max(mean_speed_10m, 0.0))[
            "annual_energy_kwh"
        ]
    )


def _convert_wind_to_power_kwh(wind_values: np.ndarray) -> np.ndarray:
    rounded = np.round(np.maximum(wind_values, 0.0), 2)
    return np.array(
        [
            _wind_energy_from_speed(float(value)) / HOURS_PER_YEAR / 3000.0
            for value in rounded
        ],
        dtype=float,
    )


def _infer_device_probabilities(
    solar_power_kwh: np.ndarray,
    wind_power_kwh: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    ones = np.ones_like(solar_power_kwh, dtype=float)
    return ones, ones.copy(), ones.copy()


def _summarize_array(values: np.ndarray) -> dict[str, float]:
    return {
        "min": float(np.min(values)),
        "max": float(np.max(values)),
        "mean": float(np.mean(values)),
    }


def _build_debug_stats(
    solar_values: np.ndarray,
    wind_values: np.ndarray,
    solar_power_kwh: np.ndarray,
    wind_power_kwh: np.ndarray,
    solar_probabilities: np.ndarray,
    wind_probabilities: np.ndarray,
    budget_usd: float | None = None,
) -> dict:
    solar_expected = solar_probabilities * solar_power_kwh
    wind_expected = wind_probabilities * wind_power_kwh
    solar_score = np.divide(
        solar_expected,
        SOLAR_LIFETIME_COST_USD_PER_KWAC,
        out=np.zeros_like(solar_expected, dtype=float),
        where=solar_expected > 0,
    )
    wind_score = np.divide(
        wind_expected,
        WIND_LIFETIME_COST_USD_PER_KW,
        out=np.zeros_like(wind_expected, dtype=float),
        where=wind_expected > 0,
    )
    affordable_solar_count = (
        int(
            np.count_nonzero(
                np.full(solar_power_kwh.shape, SOLAR_LIFETIME_COST_USD_PER_KWAC)
                <= budget_usd
            )
        )
        if budget_usd is not None
        else None
    )
    affordable_wind_count = (
        int(
            np.count_nonzero(
                np.full(wind_power_kwh.shape, WIND_LIFETIME_COST_USD_PER_KW)
                <= budget_usd
            )
        )
        if budget_usd is not None
        else None
    )

    return {
        "raw_predictions": {
            "solar": _summarize_array(solar_values),
            "wind": _summarize_array(wind_values),
        },
        "converted_power_kwh": {
            "solar": _summarize_array(solar_power_kwh),
            "wind": _summarize_array(wind_power_kwh),
        },
        "positive_counts": {
            "solar_predictions": int(np.count_nonzero(solar_values > 0)),
            "wind_predictions": int(np.count_nonzero(wind_values > 0)),
            "solar_power": int(np.count_nonzero(solar_power_kwh > 0)),
            "wind_power": int(np.count_nonzero(wind_power_kwh > 0)),
            "solar_expected_power": int(np.count_nonzero(solar_expected > 0)),
            "wind_expected_power": int(np.count_nonzero(wind_expected > 0)),
        },
        "affordable_counts": {
            "solar": affordable_solar_count,
            "wind": affordable_wind_count,
        },
        "score_comparison": {
            "solar_wins": int(np.count_nonzero(solar_score > wind_score)),
            "wind_wins": int(np.count_nonzero(wind_score > solar_score)),
            "ties": int(np.count_nonzero(np.isclose(solar_score, wind_score))),
            "solar_score": _summarize_array(solar_score),
            "wind_score": _summarize_array(wind_score),
            "top_solar_scores": [
                float(value)
                for value in np.sort(solar_score)[-5:][::-1]
            ],
            "top_wind_scores": [
                float(value)
                for value in np.sort(wind_score)[-5:][::-1]
            ],
        },
    }


def _select_budget_points(
    points: pd.DataFrame,
    solar_power_kwh: np.ndarray,
    wind_power_kwh: np.ndarray,
    solar_probabilities: np.ndarray,
    wind_probabilities: np.ndarray,
    budget_usd: float,
) -> tuple[list[dict], float, float, float]:
    candidates: list[dict] = []

    for index, row in points.iterrows():
        solar_expected = solar_probabilities[index] * solar_power_kwh[index]
        wind_expected = wind_probabilities[index] * wind_power_kwh[index]

        solar_density = (
            solar_expected / SOLAR_LIFETIME_COST_USD_PER_KWAC
            if solar_expected > 0
            else 0.0
        )
        wind_density = (
            wind_expected / WIND_LIFETIME_COST_USD_PER_KW
            if wind_expected > 0
            else 0.0
        )

        if solar_density <= 0 and wind_density <= 0:
            continue

        if solar_density >= wind_density:
            candidates.append(
                {
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                    "device_type": "solar",
                    "solar_power_kwh": float(solar_power_kwh[index]),
                    "wind_power_kwh": float(wind_power_kwh[index]),
                    "solar_probability": float(solar_probabilities[index]),
                    "wind_probability": float(wind_probabilities[index]),
                    "expected_power_kwh": float(solar_expected),
                    "device_cost_usd": SOLAR_LIFETIME_COST_USD_PER_KWAC,
                    "installed_capacity_kw": OPTIMIZATION_BUILD_BLOCK_KW,
                    "score": float(solar_density),
                }
            )
        else:
            candidates.append(
                {
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                    "device_type": "wind",
                    "solar_power_kwh": float(solar_power_kwh[index]),
                    "wind_power_kwh": float(wind_power_kwh[index]),
                    "solar_probability": float(solar_probabilities[index]),
                    "wind_probability": float(wind_probabilities[index]),
                    "expected_power_kwh": float(wind_expected),
                    "device_cost_usd": WIND_LIFETIME_COST_USD_PER_KW,
                    "installed_capacity_kw": OPTIMIZATION_BUILD_BLOCK_KW,
                    "score": float(wind_density),
                }
            )

    candidates.sort(key=lambda item: (item["score"], item["expected_power_kwh"]), reverse=True)

    remaining_budget = budget_usd
    chosen: list[dict] = []
    total_expected_power = 0.0
    total_raw_power = 0.0
    total_cost = 0.0

    for candidate in candidates:
        cost = candidate["device_cost_usd"]
        if cost > remaining_budget:
            continue

        remaining_budget -= cost
        total_cost += cost
        total_expected_power += candidate["expected_power_kwh"]
        total_raw_power += candidate["solar_power_kwh"] if candidate["device_type"] == "solar" else candidate["wind_power_kwh"]
        chosen.append(candidate)

    return chosen, total_raw_power, total_expected_power, total_cost


def _select_power_points(
    points: pd.DataFrame,
    solar_power_kwh: np.ndarray,
    wind_power_kwh: np.ndarray,
    solar_probabilities: np.ndarray,
    wind_probabilities: np.ndarray,
    target_power_kwh: float,
) -> tuple[list[dict], float, float, float]:
    candidates: list[dict] = []

    for index, row in points.iterrows():
        solar_probability = max(float(solar_probabilities[index]), MIN_MODEL_PROBABILITY)
        wind_probability = max(float(wind_probabilities[index]), MIN_MODEL_PROBABILITY)

        solar_effective_cost = SOLAR_LIFETIME_COST_USD_PER_KWAC / solar_probability
        wind_effective_cost = WIND_LIFETIME_COST_USD_PER_KW / wind_probability

        solar_cost_per_power = (
            solar_effective_cost / solar_power_kwh[index]
            if solar_power_kwh[index] > 0
            else math.inf
        )
        wind_cost_per_power = (
            wind_effective_cost / wind_power_kwh[index]
            if wind_power_kwh[index] > 0
            else math.inf
        )

        if solar_cost_per_power == math.inf and wind_cost_per_power == math.inf:
            continue

        if solar_cost_per_power <= wind_cost_per_power:
            candidates.append(
                {
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                    "device_type": "solar",
                    "solar_power_kwh": float(solar_power_kwh[index]),
                    "wind_power_kwh": float(wind_power_kwh[index]),
                    "solar_probability": float(solar_probabilities[index]),
                    "wind_probability": float(wind_probabilities[index]),
                    "effective_cost_usd": float(solar_effective_cost),
                    "device_cost_usd": SOLAR_LIFETIME_COST_USD_PER_KWAC,
                    "installed_capacity_kw": OPTIMIZATION_BUILD_BLOCK_KW,
                    "score": float(solar_cost_per_power),
                    "selected_power_kwh": float(solar_power_kwh[index]),
                }
            )
        else:
            candidates.append(
                {
                    "lat": float(row["lat"]),
                    "lon": float(row["lon"]),
                    "device_type": "wind",
                    "solar_power_kwh": float(solar_power_kwh[index]),
                    "wind_power_kwh": float(wind_power_kwh[index]),
                    "solar_probability": float(solar_probabilities[index]),
                    "wind_probability": float(wind_probabilities[index]),
                    "effective_cost_usd": float(wind_effective_cost),
                    "device_cost_usd": WIND_LIFETIME_COST_USD_PER_KW,
                    "installed_capacity_kw": OPTIMIZATION_BUILD_BLOCK_KW,
                    "score": float(wind_cost_per_power),
                    "selected_power_kwh": float(wind_power_kwh[index]),
                }
            )

    candidates.sort(key=lambda item: (item["score"], -item["selected_power_kwh"]))

    chosen: list[dict] = []
    accumulated_power = 0.0
    total_effective_cost = 0.0
    total_actual_cost = 0.0

    for candidate in candidates:
        chosen.append(candidate)
        accumulated_power += candidate["selected_power_kwh"]
        total_effective_cost += candidate["effective_cost_usd"]
        total_actual_cost += candidate["device_cost_usd"]
        if accumulated_power >= target_power_kwh:
            break

    return chosen, accumulated_power, total_effective_cost, total_actual_cost


@app.cls(
    image=image,
    volumes={"/models": volume},
    scaledown_window=300,
)
class ModelService:
    @modal.enter()
    def load_models(self):
        solar_model_path = (
            VOLUME_SOLAR_MODEL_PATH
            if Path(VOLUME_SOLAR_MODEL_PATH).exists()
            else FALLBACK_SOLAR_MODEL_PATH
        )
        wind_model_path = (
            VOLUME_WIND_MODEL_PATH
            if Path(VOLUME_WIND_MODEL_PATH).exists()
            else FALLBACK_WIND_MODEL_PATH
        )

        self.solar_model = joblib.load(solar_model_path)
        self.wind_model = joblib.load(wind_model_path)

    @modal.method()
    def predict_solar(self, lat: float, lon: float, elevation: float):
        X = pd.DataFrame([{"lat": lat, "lon": lon, "elevation": elevation}])
        pred = float(self.solar_model.predict(X)[0])
        return {"annual_mean_solar": pred}

    @modal.method()
    def predict_wind(self, lat: float, lon: float, elevation: float):
        X = pd.DataFrame([{"lat": lat, "lon": lon, "elevation": elevation}])
        pred = float(self.wind_model.predict(X)[0])
        return {"annual_mean_wind_speed": pred}

    @modal.method()
    def optimize(
        self,
        mode: Literal["cash", "power"],
        target_value: float,
        bounding_box: dict,
        sample_count: int = DEFAULT_SAMPLE_COUNT,
        elevation: float = DEFAULT_ELEVATION_METERS,
    ):
        points = _sample_points_in_bbox(
            BoundingBoxRequest(**bounding_box),
            sample_count,
            elevation,
        )

        model_inputs = points[["lat", "lon", "elevation"]]
        solar_values = self.solar_model.predict(model_inputs).astype(float)
        wind_values = self.wind_model.predict(model_inputs).astype(float)

        solar_power_kwh = _convert_solar_to_power_kwh(solar_values)
        wind_power_kwh = _convert_wind_to_power_kwh(wind_values)
        solar_probabilities, wind_probabilities, none_probabilities = _infer_device_probabilities(
            solar_power_kwh,
            wind_power_kwh,
        )
        debug_stats = _build_debug_stats(
            solar_values,
            wind_values,
            solar_power_kwh,
            wind_power_kwh,
            solar_probabilities,
            wind_probabilities,
            target_value if mode == "cash" else None,
        )
        print(
            "Optimization debug:",
            json.dumps(
                {
                    "mode": mode,
                    "target_value": target_value,
                    "sample_count": sample_count,
                    "debug": debug_stats,
                }
            ),
            flush=True,
        )

        if mode == "cash":
            selected_points, total_raw_power, total_expected_power, total_cost = _select_budget_points(
                points,
                solar_power_kwh,
                wind_power_kwh,
                solar_probabilities,
                wind_probabilities,
                target_value,
            )
            return {
                "mode": mode,
                "sample_count": sample_count,
                "assumed_elevation_m": elevation,
                "power_basis": "average_hourly_kwh",
                "power_window_hours": 1,
                "device_costs_usd": {
                    "solar": SOLAR_LIFETIME_COST_USD_PER_KWAC,
                    "wind": WIND_LIFETIME_COST_USD_PER_KW,
                },
                "device_unit_kw": OPTIMIZATION_BUILD_BLOCK_KW,
                "total_cost_usd": total_cost,
                "total_raw_power_kwh": total_raw_power,
                "total_expected_power_kwh": total_expected_power,
                "selected_count": len(selected_points),
                "points": selected_points,
                "third_model": "stub_probability_model",
                "debug": debug_stats,
            }

        selected_points, total_power, total_effective_cost, total_actual_cost = _select_power_points(
            points,
            solar_power_kwh,
            wind_power_kwh,
            solar_probabilities,
            wind_probabilities,
            target_value,
        )
        return {
            "mode": mode,
            "sample_count": sample_count,
            "assumed_elevation_m": elevation,
            "power_basis": "average_hourly_kwh",
            "power_window_hours": 1,
            "device_costs_usd": {
                "solar": SOLAR_LIFETIME_COST_USD_PER_KWAC,
                "wind": WIND_LIFETIME_COST_USD_PER_KW,
            },
            "device_unit_kw": OPTIMIZATION_BUILD_BLOCK_KW,
            "total_power_kwh": total_power,
            "total_effective_cost_usd": total_effective_cost,
            "total_actual_cost_usd": total_actual_cost,
            "selected_count": len(selected_points),
            "points": selected_points,
            "third_model": "stub_probability_model",
            "debug": debug_stats,
        }


model_service = ModelService()


@web_app.get("/health")
async def health():
    return {"status": "ok"}


@web_app.post("/predict/solar")
async def predict_solar(req: SolarRequest):
    try:
        return await model_service.predict_solar.remote.aio(
            req.lat,
            req.lon,
            req.elevation,
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@web_app.post("/predict/wind")
async def predict_wind(req: WindRequest):
    try:
        return await model_service.predict_wind.remote.aio(
            req.lat,
            req.lon,
            req.elevation,
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@web_app.post("/optimize")
async def optimize(req: OptimizationRequest):
    try:
        return await model_service.optimize.remote.aio(
            req.mode,
            req.target_value,
            req.bounding_box.model_dump(),
            req.sample_count,
            req.elevation,
        )
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@app.function(image=image)
@modal.asgi_app()
def fastapi_app():
    return web_app
