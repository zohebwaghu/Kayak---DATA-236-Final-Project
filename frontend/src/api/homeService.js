// src/api/homeService.js
// API functions for dynamic home page data

import api from './axios';

// Optimized city image mapping with high-quality Unsplash images
const cityImages = {
  'new york': 'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&w=600&h=400&q=85',
  'los angeles': 'https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?auto=format&fit=crop&w=600&h=400&q=85',
  'chicago': 'https://images.unsplash.com/photo-1494522855154-9297ac14b55f?auto=format&fit=crop&w=600&h=400&q=85',
  'miami': 'https://images.unsplash.com/photo-1506966953602-c20cc11f75e3?auto=format&fit=crop&w=600&h=400&q=85',
  'san francisco': 'https://images.unsplash.com/photo-1501594907352-04cda38ebc29?auto=format&fit=crop&w=600&h=400&q=85',
  'las vegas': 'https://images.unsplash.com/photo-1605833556294-ea5c7a74f57d?auto=format&fit=crop&w=600&h=400&q=85',
  'seattle': 'https://images.unsplash.com/photo-1502175353174-a7a70e73b362?auto=format&fit=crop&w=600&h=400&q=85',
  'boston': 'https://images.unsplash.com/photo-1501979376754-1d09ed7dc4d4?auto=format&fit=crop&w=600&h=400&q=85',
  'denver': 'https://images.unsplash.com/photo-1546156929-a4c0ac411f47?auto=format&fit=crop&w=600&h=400&q=85',
  'austin': 'https://images.unsplash.com/photo-1531218150217-54595bc2b934?auto=format&fit=crop&w=600&h=400&q=85',
  'orlando': 'https://images.unsplash.com/photo-1513622478252-07c5137e4917?auto=format&fit=crop&w=600&h=400&q=85',
  'phoenix': 'https://images.unsplash.com/photo-1547036967-23d11aacaee0?auto=format&fit=crop&w=600&h=400&q=85',
  'san diego': 'https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=600&h=400&q=85',
  'portland': 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=600&h=400&q=85',
  'atlanta': 'https://images.unsplash.com/photo-1514565131-fce0801e5785?auto=format&fit=crop&w=600&h=400&q=85',
  'dallas': 'https://images.unsplash.com/photo-1514924013411-cbf25faa35bb?auto=format&fit=crop&w=600&h=400&q=85',
  'houston': 'https://images.unsplash.com/photo-1505142468610-359e7d316be0?auto=format&fit=crop&w=600&h=400&q=85',
  'mumbai': 'https://images.unsplash.com/photo-1529253355930-ddbe423a2ac7?auto=format&fit=crop&w=600&h=400&q=85',
  'delhi': 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=600&h=400&q=85',
  'bangalore': 'https://images.unsplash.com/photo-1605629921711-3f3a5b3b3b3b?auto=format&fit=crop&w=600&h=400&q=85',
  'chennai': 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=600&h=400&q=85',
  'kolkata': 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=600&h=400&q=85',
  'hyderabad': 'https://images.unsplash.com/photo-1582979512210-99b6a53386f9?auto=format&fit=crop&w=600&h=400&q=85',
  'default': 'https://images.unsplash.com/photo-1488646953014-85cb44e25828?auto=format&fit=crop&w=600&h=400&q=85',
};

/**
 * Get image URL for a city
 */
const getCityImage = (cityName) => {
  const normalizedCity = cityName?.toLowerCase() || '';
  return cityImages[normalizedCity] || cityImages['default'];
};

/**
 * Fetch popular destinations from hotels data
 * Groups by city and returns top destinations with min prices
 */
export const fetchPopularDestinations = async (limit = 6) => {
  try {
    // Fetch hotels to find popular cities
    const response = await api.get('/search/hotels', {
      params: { limit: 50 }
    });

    const hotels = response.data?.data || [];

    // Group by city and find min price
    const cityMap = {};
    hotels.forEach(hotel => {
      const city = hotel.address?.city || hotel.city || 'Unknown';
      const price = hotel.pricePerNight || hotel.price || 0;

      if (!cityMap[city]) {
        cityMap[city] = {
          city,
          country: hotel.address?.country || 'USA',
          minPrice: price,
          count: 1,
        };
      } else {
        cityMap[city].count++;
        if (price > 0 && price < cityMap[city].minPrice) {
          cityMap[city].minPrice = price;
        }
      }
    });

    // Sort by count (popularity) and take top N
    const destinations = Object.values(cityMap)
      .filter(d => d.city !== 'Unknown' && d.minPrice > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit)
      .map(d => ({
        city: d.city,
        country: d.country,
        price: Math.round(d.minPrice),
        image: getCityImage(d.city),
        code: d.city.substring(0, 3).toUpperCase(),
      }));

    return destinations;
  } catch (error) {
    console.error('Error fetching popular destinations:', error);
    return [];
  }
};

/**
 * Fetch deals (cheapest flights and hotels)
 */
export const fetchDeals = async () => {
  try {
    // Fetch cheap flights and hotels in parallel
    const [flightsRes, hotelsRes] = await Promise.all([
      api.get('/search/flights', { params: { limit: 5 } }),
      api.get('/search/hotels', { params: { limit: 5 } }),
    ]);

    const flights = flightsRes.data?.data || [];
    const hotels = hotelsRes.data?.data || [];

    const deals = [];

    // Add flight deals with images
    flights.slice(0, 3).forEach((flight, index) => {
      const price = flight.price || 0;
      // Simulate original price (20-50% higher)
      const discount = 20 + Math.floor(Math.random() * 30);
      const originalPrice = Math.round(price * (100 / (100 - discount)));
      const destCity = (flight.destination_city || flight.destination || 'LAX').toLowerCase();

      deals.push({
        id: `flight-${index}`,
        type: 'flight',
        title: `${flight.origin || 'NYC'} → ${flight.destination || 'LAX'}`,
        subtitle: `Round trip · ${flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop`}`,
        originalPrice,
        dealPrice: Math.round(price),
        discount,
        airline: flight.airline || 'Multiple airlines',
        dates: flight.departure_time ? `Departs ${flight.departure_time}` : 'Flexible dates',
        image: getCityImage(destCity),
      });
    });

    // Add hotel deals with images
    hotels.slice(0, 2).forEach((hotel, index) => {
      const price = hotel.pricePerNight || hotel.price || 0;
      const discount = 25 + Math.floor(Math.random() * 25);
      const originalPrice = Math.round(price * (100 / (100 - discount)));
      const name = hotel.name || hotel.hotelName || 'Hotel';
      const city = hotel.address?.city || hotel.city || '';

      deals.push({
        id: `hotel-${index}`,
        type: 'hotel',
        title: name,
        subtitle: `${hotel.starRating || 4}★ · ${city}`,
        originalPrice,
        dealPrice: Math.round(price),
        discount,
        nights: '3 nights',
        dates: 'Limited time offer',
        image: getCityImage(city),
      });
    });

    return deals;
  } catch (error) {
    console.error('Error fetching deals:', error);
    return [];
  }
};

/**
 * Fetch stats (total counts of flights, hotels, cars)
 */
export const fetchStats = async () => {
  try {
    // Fetch with limit=1 to get pagination.total
    const [flightsRes, hotelsRes, carsRes] = await Promise.all([
      api.get('/search/flights', { params: { limit: 1 } }),
      api.get('/search/hotels', { params: { limit: 1 } }),
      api.get('/search/cars', { params: { limit: 1 } }),
    ]);

    const flightCount = flightsRes.data?.pagination?.total || 0;
    const hotelCount = hotelsRes.data?.pagination?.total || 0;
    const carCount = carsRes.data?.pagination?.total || 0;

    return [
      { value: formatCount(flightCount), label: 'Flights' },
      { value: formatCount(hotelCount), label: 'Hotels' },
      { value: formatCount(carCount), label: 'Car rentals' },
    ];
  } catch (error) {
    console.error('Error fetching stats:', error);
    // Return fallback values
    return [
      { value: '500+', label: 'Flights' },
      { value: '1K+', label: 'Hotels' },
      { value: '100+', label: 'Car rentals' },
    ];
  }
};

/**
 * Fetch unique airlines from flights data
 */
export const fetchAirlines = async (limit = 6) => {
  try {
    const response = await api.get('/search/flights', {
      params: { limit: 50 }
    });

    const flights = response.data?.data || [];

    // Get unique airlines
    const airlines = [...new Set(
      flights
        .map(f => f.airline)
        .filter(Boolean)
    )].slice(0, limit);

    return airlines.length > 0 ? airlines : ['United', 'Delta', 'American'];
  } catch (error) {
    console.error('Error fetching airlines:', error);
    return ['United', 'Delta', 'American'];
  }
};

/**
 * Format large numbers for display
 */
const formatCount = (num) => {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M+`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(0)}K+`;
  }
  if (num > 0) {
    return `${num}+`;
  }
  return '100+';
};
