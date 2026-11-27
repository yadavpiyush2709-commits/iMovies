const API_BASE_URL = (
  import.meta.env.VITE_API_URL || "http://localhost:5000/api"
).replace(/\/+$/, "");
const AUTH_SESSION_KEY = "tesseract.films.auth.session.v1";

export class AuthApiError extends Error {
  constructor(message, status = null) {
    super(message);
    this.name = "AuthApiError";
    this.status = status;
  }
}

async function request(path, { body, token } = {}) {
  let response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new AuthApiError(
      "Unable to connect to the authentication service. Check that the backend is running.",
    );
  }

  let data;

  try {
    data = await response.json();
  } catch {
    throw new AuthApiError(
      "The authentication service returned an invalid response.",
      response.status,
    );
  }

  if (!response.ok) {
    throw new AuthApiError(
      data?.message || `Authentication request failed with HTTP ${response.status}.`,
      response.status,
    );
  }

  if (!data || data.success !== true) {
    throw new AuthApiError("The authentication service returned an invalid response.");
  }

  return data;
}

export function registerUser({ name, email, phone, password, confirmPassword }) {
  return request("/auth/register", {
    body: { name, email, phone, password, confirmPassword },
  });
}

export function loginUser({ identifier, password }) {
  return request("/auth/login", {
    body: { identifier, password },
  });
}

export function verifyRegistrationOtp({ email, channel, otp }) {
  return request("/auth/verify-registration-otp", {
    body: { email, channel, otp },
  });
}

export function resendRegistrationOtp({ email, channel }) {
  return request("/auth/resend-registration-otp", {
    body: { email, channel },
  });
}

export function requestPasswordReset({ email }) {
  return request("/auth/forgot-password", {
    body: { email },
  });
}

export function resetPassword({ token, password }) {
  return request("/auth/reset-password", {
    body: { token, password },
  });
}

export function requestMobileVerification({ phone }, token) {
  return request("/auth/mobile/request-verification", {
    body: { phone },
    token,
  });
}

export function resendMobileVerification(token) {
  return request("/auth/mobile/resend-verification", { body: {}, token });
}

export function verifyMobileNumber({ otp }, token) {
  return request("/auth/mobile/verify", {
    body: { otp },
    token,
  });
}

export function getAuthenticatedUser(token) {
  return request("/auth/me", { token });
}

export function saveAuthSession(authResponse) {
  const { token, user } = authResponse || {};

  if (!token || !user || !user.id || !user.email || !user.name) {
    throw new AuthApiError("The authentication service returned incomplete account details.");
  }

  const session = { token, user };

  try {
    localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } catch {
    throw new AuthApiError("Unable to save your sign-in session in this browser.");
  }

  return session;
}

export function clearAuthSession() {
  try {
    localStorage.removeItem(AUTH_SESSION_KEY);
  } catch {
    throw new AuthApiError("Unable to clear your sign-in session in this browser.");
  }
}

function readAuthSession() {
  let serialized;

  try {
    serialized = localStorage.getItem(AUTH_SESSION_KEY);
  } catch {
    throw new AuthApiError("Unable to read your sign-in session from this browser.");
  }

  if (serialized === null) {
    return null;
  }

  let session;

  try {
    session = JSON.parse(serialized);
  } catch {
    clearAuthSession();
    return null;
  }

  if (
    !session ||
    typeof session.token !== "string" ||
    !session.token ||
    !session.user ||
    !session.user.id
  ) {
    clearAuthSession();
    return null;
  }

  return session;
}

export async function restoreAuthSession() {
  const storedSession = readAuthSession();

  if (!storedSession) {
    return null;
  }

  const response = await getAuthenticatedUser(storedSession.token);
  const verifiedUser = response.user;

  if (
    !verifiedUser ||
    String(verifiedUser.id) !== String(storedSession.user.id)
  ) {
    clearAuthSession();
    throw new AuthApiError("The saved sign-in session is no longer valid.", 401);
  }

  return {
    token: storedSession.token,
    user: {
      ...storedSession.user,
      ...verifiedUser,
    },
  };
}
