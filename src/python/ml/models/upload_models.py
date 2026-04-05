# upload_models.py
import modal

volume = modal.Volume.from_name("energy-models", create_if_missing=True)

with volume.batch_upload() as batch:
    batch.put_file("solar_xgboost_model.pkl", "/models/solar_xgboost_model.pkl")
    batch.put_file("wind_xgboost_model.pkl", "/models/wind_xgboost_model.pkl")

print("Uploaded model files.")