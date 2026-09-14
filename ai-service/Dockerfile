FROM python:3.12-slim

WORKDIR /app

# Prevent Python from writing .pyc files and enable unbuffered output for real-time logs
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy microservice application files and trained ML model artifact
COPY main.py .
COPY fraud_model.joblib .

# Expose default port
EXPOSE 8000

# Run FastAPI service via uvicorn respecting dynamic PORT environment variable
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
