export function cookiesToHeader(cookies) {
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return "";
  }

  return cookies
    .map((cookie) => {
      if (typeof cookie === "string") {
        return cookie;
      }
      if (!cookie || typeof cookie !== "object") {
        return "";
      }
      return `${cookie.name}=${cookie.value}`;
    })
    .filter(Boolean)
    .join("; ");
}

export function hasAuthCookie(cookies) {
  if (!Array.isArray(cookies)) {
    return false;
  }
  return cookies.some((cookie) => cookie?.name === "sporza-site_profile_at" && cookie?.value);
}

export function parseCookieHeader(header) {
  const raw = String(header || "").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.indexOf("=");
      if (separator <= 0) {
        return null;
      }
      return {
        name: part.slice(0, separator).trim(),
        value: part.slice(separator + 1).trim(),
        domain: ".sporza.be",
        path: "/"
      };
    })
    .filter(Boolean);
}

export function normalizeCookies(cookies) {
  if (!Array.isArray(cookies)) {
    return [];
  }

  return cookies
    .filter((cookie) => cookie && typeof cookie === "object" && cookie.name && cookie.value)
    .map((cookie) => ({
      name: String(cookie.name),
      value: String(cookie.value),
      domain: cookie.domain || ".sporza.be",
      path: cookie.path || "/",
      expires: cookie.expires ?? -1,
      httpOnly: Boolean(cookie.httpOnly),
      secure: cookie.secure !== false,
      sameSite: cookie.sameSite || "Lax"
    }));
}
