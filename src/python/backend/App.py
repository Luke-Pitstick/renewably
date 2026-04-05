# app.py
import modal
import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = modal.App("energy-predictor")

image = (
    modal.Image.debian_slim()
    .pip_install(
        "fastapi",
        "pydantic",
        "joblib",
        "xgboost",
        "scikit-learn",
        "pandas",
        "numpy"
    )
)

volume = modal.Volume.from_name("energy-models", create_if_missing=True)

web_app = FastAPI()

class SolarRequest(BaseModel):
    lat: float
    lon: float
    elevation: float

class WindRequest(BaseModel):
    lat: float
    lon: float
    elevation: float | None = None

@app.cls(
    image=image,
    volumes={"/models": volume},
    scaledown_window=300,
)
class ModelService:
    @modal.enter()
    def load_models(self):
        self.solar_model = joblib.load("/models/solar_xgboost_model.pkl")
        self.wind_model = joblib.load("/models/wind_xgboost_model.pkl")

    @modal.method()
    def predict_solar(self, lat: float, lon: float, elevation: float):
        X = pd.DataFrame([{
            "lat": lat,
            "lon": lon,
            "elevation": elevation
        }])
        pred = float(self.solar_model.predict(X)[0])
        return {"annual_mean_solar": pred}

    @modal.method()
    def predict_wind(self, lat: float, lon: float, elevation: float | None = None):
        row = {"lat": lat, "lon": lon}
        cols = ["lat", "lon"]

        # If your wind model was trained with elevation, include it
        if elevation is not None:
            row["elevation"] = elevation
            cols.append("elevation")

        X = pd.DataFrame([row])[cols]
        pred = float(self.wind_model.predict(X)[0])
        return {"annual_mean_wind_speed": pred}

model_service = ModelService()

@web_app.get("/health")
async def health():
    return {"status": "ok"}

@web_app.post("/predict/solar")
async def predict_solar(req: SolarRequest):
    try:
        return model_service.predict_solar.remote(req.lat, req.lon, req.elevation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@web_app.post("/predict/wind")
async def predict_wind(req: WindRequest):
    try:
        return model_service.predict_wind.remote(req.lat, req.lon, req.elevation)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.function(image=image)
@modal.asgi_app()
def fastapi_app():
    return web_app