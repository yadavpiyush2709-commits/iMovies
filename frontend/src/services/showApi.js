const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

export async function fetchAvailableShows({ movieId, city, date }) {
  const query = new URLSearchParams();

  if (movieId) query.set("movieId", movieId);
  if (city && city.trim()) query.set("city", city.trim());
  if (date) query.set("date", date);

  let response;

  try {
    response = await fetch(`${API_BASE_URL}/theatre/shows?${query.toString()}`);
  } catch {
    throw new Error(
      "Unable to connect to the showtime service. Check that the backend is running and try again.",
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error("The showtime service returned an invalid response.");
  }

  if (!response.ok) {
    throw new Error(
      data?.message || `Failed to load showtimes: the server returned HTTP ${response.status}.`,
    );
  }

  if (!data || data.success !== true || !Array.isArray(data.shows)) {
    throw new Error("The showtime service returned an invalid shows list.");
  }

  return data.shows;
}
