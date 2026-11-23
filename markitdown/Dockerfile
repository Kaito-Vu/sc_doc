FROM python:3.12-slim
# OCR for scanned PDFs: ocrmypdf + tesseract (Vietnamese + English) + ghostscript.
RUN apt-get update \
  && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-vie tesseract-ocr-eng ghostscript \
  && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir "markitdown[pdf]" ocrmypdf
COPY server.py /app/server.py
ENV HOME=/tmp
USER nobody
EXPOSE 8000
CMD ["python", "/app/server.py"]
