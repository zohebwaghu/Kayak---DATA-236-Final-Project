# Kaggle Datasets Directory

This directory contains CSV files downloaded from Kaggle datasets.

## Directory Structure

```
data/kaggle/
├── airbnb/          # Inside Airbnb NYC dataset
├── hotels/          # Hotel Booking Demand dataset
├── flights/         # Flight Price Prediction dataset
├── airports/        # Global Airports dataset
└── routes/          # OpenFlights Routes dataset
```

## Expected Files

### airbnb/
- `listings.csv` or `listings_summary.csv`
- Source: https://www.kaggle.com/datasets/dominoweir/inside-airbnb-nyc

### hotels/
- `hotel_bookings.csv`
- Source: https://www.kaggle.com/datasets/mojtaba142/hotel-booking

### flights/
- `flight_prices.csv` or any CSV with flight data
- Source: https://www.kaggle.com/datasets/shubhambathwal/flight-price-prediction

### airports/
- `airports.csv` or any CSV with airport data
- Source: https://www.kaggle.com/datasets/samvelkoch/global-airports-iata-icao-timezone-geo

### routes/
- `routes.csv` or any CSV with route data
- Source: https://www.kaggle.com/datasets/elmoallistair/airlines-airport-and-routes

## Usage

1. Download CSV files from Kaggle
2. Place them in the appropriate subdirectory
3. Run: `python3 scripts/process_kaggle_data.py`

## Note

If CSV files are not found, the processing script will automatically create sample data for testing.
