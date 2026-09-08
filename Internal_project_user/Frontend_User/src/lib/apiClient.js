import { API_BASE } from "@/utils/api";

/** Error carrying the HTTP status so retry/So auth handling can branch on it. */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

const authHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Single fetch entry point for the app.
 *
 * Paths are relative (`/api/...`) so the Vite dev proxy is used in development
 * and API_BASE in a build.
 */
export const apiRequest = async (path, { method = "GET", body, headers, ...rest } = {}) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...authHeaders(),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    ...rest,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const message =
      (data && (data.detail || data.message)) || `Request failed (${response.status})`;
    throw new ApiError(
      typeof message === "string" ? message : `Request failed (${response.status})`,
      response.status,
      data,
    );
  }

  return data;
};

export default apiRequest;
