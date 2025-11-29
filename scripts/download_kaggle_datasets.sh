#!/bin/bash
# Download Kaggle Datasets
# Requires: pip install kaggle
# Setup: Place kaggle.json in ~/.kaggle/ with your API credentials

PROJECT_ROOT="/Users/zohebw/Desktop/DATA 236/Project/Kayak---DATA-236-Final-Project"
DATA_DIR="$PROJECT_ROOT/data/kaggle"
cd "$PROJECT_ROOT"

echo "📥 Downloading Kaggle Datasets"
echo "==============================="
echo ""

# Create data directory
mkdir -p "$DATA_DIR"

# Check if kaggle is installed
if ! command -v kaggle &> /dev/null; then
    echo "⚠️  Kaggle CLI not found. Installing..."
    pip install kaggle
fi

# Check for kaggle credentials
if [ ! -f ~/.kaggle/kaggle.json ]; then
    echo "❌ Kaggle credentials not found!"
    echo ""
    echo "Setup instructions:"
    echo "1. Go to https://www.kaggle.com/account"
    echo "2. Create API token (download kaggle.json)"
    echo "3. Place it in ~/.kaggle/kaggle.json"
    echo "4. Run: chmod 600 ~/.kaggle/kaggle.json"
    exit 1
fi

echo "✅ Kaggle credentials found"
echo ""

# Download datasets
echo "1. Downloading Inside Airbnb NYC..."
kaggle datasets download -d dominoweir/inside-airbnb-nyc -p "$DATA_DIR/airbnb" --unzip || \
kaggle datasets download -d ahmedmagdee/inside-airbnb -p "$DATA_DIR/airbnb" --unzip

echo ""
echo "2. Downloading Hotel Booking Demand..."
kaggle datasets download -d mojtaba142/hotel-booking -p "$DATA_DIR/hotels" --unzip

echo ""
echo "3. Downloading Flight Price Prediction..."
kaggle datasets download -d shubhambathwal/flight-price-prediction -p "$DATA_DIR/flights" --unzip || \
kaggle datasets download -d dilwong/flightprices -p "$DATA_DIR/flights" --unzip

echo ""
echo "4. Downloading Global Airports..."
kaggle datasets download -d samvelkoch/global-airports-iata-icao-timezone-geo -p "$DATA_DIR/airports" --unzip

echo ""
echo "5. Downloading OpenFlights Routes..."
kaggle datasets download -d elmoallistair/airlines-airport-and-routes -p "$DATA_DIR/routes" --unzip

echo ""
echo "✅ All datasets downloaded to: $DATA_DIR"
echo ""
echo "📝 Next step: Run data processing scripts"
echo "   ./scripts/process_kaggle_data.sh"

