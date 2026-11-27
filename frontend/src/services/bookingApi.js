const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");

const SEAT_STATUSES = new Set(["available", "locked", "booked"]);

export class BookingApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "BookingApiError";
    this.status = status;
  }
}

async function request(path, { method = "GET", body, token } = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new BookingApiError(
      "Unable to connect to the seat availability service. Check that the backend is running and try again.",
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new BookingApiError(
      "The seat availability service returned an invalid response.",
      response.status,
    );
  }

  if (!response.ok) {
    throw new BookingApiError(
      data?.message || `The seat request failed with HTTP ${response.status}.`,
      response.status,
    );
  }

  if (!data || data.success !== true) {
    throw new BookingApiError("The seat availability service returned an invalid response.");
  }

  return data;
}

export async function fetchShowSeats(showId) {
  const data = await request(
    `/bookings/shows/${encodeURIComponent(showId)}/seats`,
  );

  if (
    !Array.isArray(data.seats) ||
    !data.seats.every((showSeat) =>
      showSeat &&
      typeof showSeat._id === "string" &&
      showSeat.seat &&
      typeof showSeat.seat._id === "string" &&
      SEAT_STATUSES.has(showSeat.status)
    )
  ) {
    throw new BookingApiError("The seat availability service returned an invalid seat list.");
  }

  return data.seats;
}

export async function lockShowSeats(showId, seatIds, token) {
  const data = await request(
    `/bookings/shows/${encodeURIComponent(showId)}/lock`,
    {
      method: "POST",
      body: { seatIds },
      token,
    },
  );
  const booking = data.booking;
  const amount = booking?.totalAmount;

  if (
    !booking ||
    typeof booking.id !== "string" ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount < 0 ||
    !Number.isFinite(Date.parse(booking.expiresAt))
  ) {
    throw new BookingApiError("The seat-lock service returned an invalid hold.");
  }

  return {
    totalAmount: amount,
    expiresAt: booking.expiresAt,
  };
}
