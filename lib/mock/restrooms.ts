import { Bathroom, NearbyBathroom, Review } from "@/types";

const DEFAULT_ORIGIN = { lat: 37.7749, lng: -122.4194 };

export const mockBathrooms: Bathroom[] = [
  {
    id: "bath_001",
    name: "Market Street Transit Hub",
    place_type: "transit_station",
    address: "1 Market St",
    city: "San Francisco",
    state: "CA",
    lat: 37.7936,
    lng: -122.3965,
    access_type: "public",
    has_baby_station: true,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:00:00.000Z",
    status: "active",
    source: "city_open_data",
    source_external_id: "sf_transit_001"
  },
  {
    id: "bath_002",
    name: "Blue Bottle Hayes",
    place_type: "cafe",
    address: "315 Linden St",
    city: "San Francisco",
    state: "CA",
    lat: 37.7763,
    lng: -122.4248,
    access_type: "customer_only",
    has_baby_station: false,
    is_gender_neutral: false,
    is_accessible: true,
    requires_purchase: true,
    created_by: "seed",
    created_at: "2026-02-01T10:02:00.000Z",
    status: "active",
    source: "user",
    source_external_id: null
  },
  {
    id: "bath_003",
    name: "Mission Dolores Park North Restroom",
    place_type: "park",
    address: "19th St & Dolores St",
    city: "San Francisco",
    state: "CA",
    lat: 37.7596,
    lng: -122.4269,
    access_type: "public",
    has_baby_station: true,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:04:00.000Z",
    status: "active",
    source: "city_open_data",
    source_external_id: "park_2190"
  },
  {
    id: "bath_004",
    name: "Yerba Buena Mall Level 2",
    place_type: "mall",
    address: "845 Market St",
    city: "San Francisco",
    state: "CA",
    lat: 37.7847,
    lng: -122.4062,
    access_type: "public",
    has_baby_station: true,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:06:00.000Z",
    status: "active",
    source: "google_places",
    source_external_id: "gpid_97218"
  },
  {
    id: "bath_005",
    name: "Union Square Public Facility",
    place_type: "other",
    address: "333 Post St",
    city: "San Francisco",
    state: "CA",
    lat: 37.788,
    lng: -122.4075,
    access_type: "public",
    has_baby_station: false,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:08:00.000Z",
    status: "active",
    source: "city_open_data",
    source_external_id: "sf_public_42"
  },
  {
    id: "bath_006",
    name: "Sunset Library Annex",
    place_type: "library",
    address: "1305 18th Ave",
    city: "San Francisco",
    state: "CA",
    lat: 37.7626,
    lng: -122.4768,
    access_type: "public",
    has_baby_station: true,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:10:00.000Z",
    status: "active",
    source: "city_open_data",
    source_external_id: "lib_902"
  },
  {
    id: "bath_007",
    name: "Civic Center Fitness",
    place_type: "gym",
    address: "125 Grove St",
    city: "San Francisco",
    state: "CA",
    lat: 37.7787,
    lng: -122.4188,
    access_type: "customer_only",
    has_baby_station: false,
    is_gender_neutral: false,
    is_accessible: true,
    requires_purchase: true,
    created_by: "seed",
    created_at: "2026-02-01T10:12:00.000Z",
    status: "active",
    source: "user",
    source_external_id: null
  },
  {
    id: "bath_008",
    name: "SoMa Co-Work Tower",
    place_type: "office",
    address: "350 Townsend St",
    city: "San Francisco",
    state: "CA",
    lat: 37.777,
    lng: -122.3947,
    access_type: "staff_assisted",
    has_baby_station: true,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:14:00.000Z",
    status: "active",
    source: "partner",
    source_external_id: "partner_office_77"
  },
  {
    id: "bath_009",
    name: "Ferry Building Restrooms",
    place_type: "transit_station",
    address: "1 Ferry Building",
    city: "San Francisco",
    state: "CA",
    lat: 37.7955,
    lng: -122.3937,
    access_type: "public",
    has_baby_station: true,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:16:00.000Z",
    status: "active",
    source: "google_places",
    source_external_id: "gpid_20167"
  },
  {
    id: "bath_010",
    name: "Mission Tacos",
    place_type: "restaurant",
    address: "2200 Mission St",
    city: "San Francisco",
    state: "CA",
    lat: 37.7608,
    lng: -122.4192,
    access_type: "customer_only",
    has_baby_station: false,
    is_gender_neutral: false,
    is_accessible: false,
    requires_purchase: true,
    created_by: "seed",
    created_at: "2026-02-01T10:18:00.000Z",
    status: "active",
    source: "user",
    source_external_id: null
  },
  {
    id: "bath_011",
    name: "Golden Gate Park East Meadow",
    place_type: "park",
    address: "501 Stanyan St",
    city: "San Francisco",
    state: "CA",
    lat: 37.7694,
    lng: -122.4862,
    access_type: "public",
    has_baby_station: true,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:20:00.000Z",
    status: "active",
    source: "city_open_data",
    source_external_id: "park_774"
  },
  {
    id: "bath_012",
    name: "Caltrain Station Southbound",
    place_type: "transit_station",
    address: "700 4th St",
    city: "San Francisco",
    state: "CA",
    lat: 37.7765,
    lng: -122.394,
    access_type: "code_required",
    has_baby_station: false,
    is_gender_neutral: true,
    is_accessible: true,
    requires_purchase: false,
    created_by: "seed",
    created_at: "2026-02-01T10:22:00.000Z",
    status: "active",
    source: "google_places",
    source_external_id: "gpid_62177"
  }
];

export const mockReviews: Review[] = [
  {
    id: "rev_001",
    bathroom_id: "bath_001",
    user_id: "user_101",
    overall_rating: 4.4,
    smell_rating: 4.1,
    cleanliness_rating: 4.3,
    wait_rating: 3.8,
    privacy_rating: 4.5,
    review_text: "Busy at rush hour, but cleaned often.",
    visit_time: "2026-03-02T18:10:00.000Z",
    created_at: "2026-03-02T18:32:00.000Z",
    status: "active"
  },
  {
    id: "rev_002",
    bathroom_id: "bath_001",
    user_id: "user_102",
    overall_rating: 4.1,
    smell_rating: 3.9,
    cleanliness_rating: 4.2,
    wait_rating: 3.5,
    privacy_rating: 4.1,
    review_text: "Line moves fast and it is usually stocked.",
    visit_time: "2026-03-03T08:40:00.000Z",
    created_at: "2026-03-03T09:03:00.000Z",
    status: "active"
  },
  {
    id: "rev_003",
    bathroom_id: "bath_002",
    user_id: "user_205",
    overall_rating: 3.7,
    smell_rating: 4.0,
    cleanliness_rating: 3.8,
    wait_rating: 3.1,
    privacy_rating: 3.6,
    review_text: "Decent but code changes often.",
    visit_time: "2026-03-01T11:00:00.000Z",
    created_at: "2026-03-01T11:22:00.000Z",
    status: "active"
  },
  {
    id: "rev_004",
    bathroom_id: "bath_003",
    user_id: "user_309",
    overall_rating: 4.0,
    smell_rating: 3.5,
    cleanliness_rating: 3.8,
    wait_rating: 4.2,
    privacy_rating: 3.9,
    review_text: "Great location in the park, can be windy.",
    visit_time: "2026-03-04T15:20:00.000Z",
    created_at: "2026-03-04T15:41:00.000Z",
    status: "active"
  },
  {
    id: "rev_005",
    bathroom_id: "bath_004",
    user_id: "user_412",
    overall_rating: 4.6,
    smell_rating: 4.5,
    cleanliness_rating: 4.7,
    wait_rating: 4.1,
    privacy_rating: 4.4,
    review_text: "Very reliable mall restroom.",
    visit_time: "2026-03-05T13:00:00.000Z",
    created_at: "2026-03-05T13:13:00.000Z",
    status: "active"
  },
  {
    id: "rev_006",
    bathroom_id: "bath_005",
    user_id: "user_413",
    overall_rating: 3.8,
    smell_rating: 3.6,
    cleanliness_rating: 3.7,
    wait_rating: 3.9,
    privacy_rating: 3.5,
    review_text: "Central and easy to find.",
    visit_time: "2026-03-01T16:15:00.000Z",
    created_at: "2026-03-01T16:29:00.000Z",
    status: "active"
  },
  {
    id: "rev_007",
    bathroom_id: "bath_006",
    user_id: "user_414",
    overall_rating: 4.3,
    smell_rating: 4.4,
    cleanliness_rating: 4.4,
    wait_rating: 4.0,
    privacy_rating: 4.1,
    review_text: "Quiet, clean, and usually available.",
    visit_time: "2026-03-02T10:40:00.000Z",
    created_at: "2026-03-02T11:02:00.000Z",
    status: "active"
  },
  {
    id: "rev_008",
    bathroom_id: "bath_007",
    user_id: "user_415",
    overall_rating: 3.4,
    smell_rating: 3.1,
    cleanliness_rating: 3.3,
    wait_rating: 3.6,
    privacy_rating: 3.5,
    review_text: "Small but usually okay in afternoons.",
    visit_time: "2026-03-03T14:30:00.000Z",
    created_at: "2026-03-03T14:56:00.000Z",
    status: "active"
  },
  {
    id: "rev_009",
    bathroom_id: "bath_008",
    user_id: "user_416",
    overall_rating: 4.2,
    smell_rating: 4.0,
    cleanliness_rating: 4.1,
    wait_rating: 4.2,
    privacy_rating: 4.3,
    review_text: "Need front-desk ask, but very clean.",
    visit_time: "2026-03-02T09:05:00.000Z",
    created_at: "2026-03-02T09:25:00.000Z",
    status: "active"
  },
  {
    id: "rev_010",
    bathroom_id: "bath_009",
    user_id: "user_417",
    overall_rating: 4.5,
    smell_rating: 4.4,
    cleanliness_rating: 4.6,
    wait_rating: 4.0,
    privacy_rating: 4.2,
    review_text: "Best option near Embarcadero.",
    visit_time: "2026-03-03T12:05:00.000Z",
    created_at: "2026-03-03T12:22:00.000Z",
    status: "active"
  },
  {
    id: "rev_011",
    bathroom_id: "bath_010",
    user_id: "user_418",
    overall_rating: 3.2,
    smell_rating: 2.8,
    cleanliness_rating: 3.1,
    wait_rating: 3.4,
    privacy_rating: 3.0,
    review_text: "Good for quick stop only.",
    visit_time: "2026-03-04T20:15:00.000Z",
    created_at: "2026-03-04T20:27:00.000Z",
    status: "active"
  },
  {
    id: "rev_012",
    bathroom_id: "bath_011",
    user_id: "user_419",
    overall_rating: 4.1,
    smell_rating: 3.9,
    cleanliness_rating: 4.0,
    wait_rating: 4.3,
    privacy_rating: 4.0,
    review_text: "Great if you are in the park area.",
    visit_time: "2026-03-05T09:30:00.000Z",
    created_at: "2026-03-05T09:49:00.000Z",
    status: "active"
  },
  {
    id: "rev_013",
    bathroom_id: "bath_012",
    user_id: "user_420",
    overall_rating: 3.9,
    smell_rating: 3.7,
    cleanliness_rating: 3.8,
    wait_rating: 3.7,
    privacy_rating: 4.0,
    review_text: "Code gate works, but can be crowded during commute.",
    visit_time: "2026-03-01T07:55:00.000Z",
    created_at: "2026-03-01T08:10:00.000Z",
    status: "active"
  }
];

const roundToOne = (value: number) => Math.round(value * 10) / 10;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const haversineDistanceMiles = (origin: { lat: number; lng: number }, point: { lat: number; lng: number }) => {
  const earthRadiusMiles = 3958.8;
  const dLat = toRadians(point.lat - origin.lat);
  const dLng = toRadians(point.lng - origin.lng);
  const lat1 = toRadians(origin.lat);
  const lat2 = toRadians(point.lat);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
};

const getRatingsForBathroom = (bathroomId: string) => {
  const reviews = mockReviews.filter((review) => review.bathroom_id === bathroomId && review.status === "active");
  if (reviews.length === 0) {
    return {
      overall: 0,
      smell: 0,
      cleanliness: 0,
      reviewCount: 0
    };
  }

  const totals = reviews.reduce(
    (acc, review) => {
      acc.overall += review.overall_rating;
      acc.smell += review.smell_rating;
      acc.cleanliness += review.cleanliness_rating;
      return acc;
    },
    { overall: 0, smell: 0, cleanliness: 0 }
  );

  return {
    overall: roundToOne(totals.overall / reviews.length),
    smell: roundToOne(totals.smell / reviews.length),
    cleanliness: roundToOne(totals.cleanliness / reviews.length),
    reviewCount: reviews.length
  };
};

export const getNearbyBathrooms = (
  origin: { lat: number; lng: number } = DEFAULT_ORIGIN,
  limit = 12
): NearbyBathroom[] => {
  return mockBathrooms
    .filter((bathroom) => bathroom.status === "active")
    .map((bathroom) => ({
      ...bathroom,
      distanceMiles: roundToOne(haversineDistanceMiles(origin, { lat: bathroom.lat, lng: bathroom.lng })),
      ratings: getRatingsForBathroom(bathroom.id)
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, limit);
};

export const getBathroomById = (id: string): NearbyBathroom | undefined => {
  const bathroom = mockBathrooms.find((item) => item.id === id && item.status === "active");
  if (!bathroom) {
    return undefined;
  }

  return {
    ...bathroom,
    distanceMiles: roundToOne(haversineDistanceMiles(DEFAULT_ORIGIN, { lat: bathroom.lat, lng: bathroom.lng })),
    ratings: getRatingsForBathroom(bathroom.id)
  };
};

export const getBathroomReviews = (bathroomId: string): Review[] => {
  return mockReviews
    .filter((review) => review.bathroom_id === bathroomId && review.status === "active")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
};
