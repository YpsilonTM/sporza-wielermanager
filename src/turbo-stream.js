const SPECIAL = {
  [-1]: null,
  [-2]: undefined,
  [-3]: true,
  [-4]: false,
  [-5]: Number.NaN,
  [-6]: Number.POSITIVE_INFINITY,
  [-7]: null
};

export function decodeTurboStream(rawText) {
  const items = JSON.parse(rawText);
  const memo = new Map();

  function unflatten(idx) {
    if (Object.prototype.hasOwnProperty.call(SPECIAL, idx)) {
      return SPECIAL[idx];
    }
    if (memo.has(idx)) {
      return memo.get(idx);
    }

    memo.set(idx, undefined);
    const value = items[idx];

    if (typeof value === "string" || typeof value === "boolean" || value === null) {
      memo.set(idx, value);
      return value;
    }

    if (typeof value === "number") {
      memo.set(idx, value);
      return value;
    }

    if (Array.isArray(value)) {
      const list = value.map((entry) => (typeof entry === "number" ? unflatten(entry) : entry));
      memo.set(idx, list);
      return list;
    }

    if (value && typeof value === "object") {
      const object = {};
      for (const [key, ref] of Object.entries(value)) {
        if (!key.startsWith("_") || typeof ref !== "number") {
          object[key] = ref;
          continue;
        }
        const keyIndex = Number(key.slice(1));
        const propertyName = items[keyIndex];
        object[propertyName] = unflatten(ref);
      }
      memo.set(idx, object);
      return object;
    }

    memo.set(idx, value);
    return value;
  }

  return unflatten(0);
}

export function extractEditionRouteLoader(decoded) {
  const root = decoded?._1 ?? decoded;
  const data = root?._3 ?? root?.data ?? root;
  const routes = data?.routes ?? data?._929 ?? null;

  if (routes && typeof routes === "object") {
    const editionRoute = routes["routes/$edition"];
    if (editionRoute) {
      return editionRoute;
    }
  }

  if (data && typeof data === "object") {
    for (const value of Object.values(data)) {
      if (value && typeof value === "object" && value.edition && value.gameStatus !== undefined) {
        return value;
      }
    }
  }

  return findEditionLoader(root);
}

function findEditionLoader(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 12) {
    return null;
  }

  if (node.edition && node.gameStatus !== undefined) {
    return node;
  }

  for (const value of Object.values(node)) {
    const found = findEditionLoader(value, depth + 1);
    if (found) {
      return found;
    }
  }

  return null;
}

export function extractRouteLoaderData(decoded, routeKey) {
  if (!decoded || typeof decoded !== "object") {
    return null;
  }

  const direct = decoded[routeKey]?.data;
  if (direct) {
    return direct;
  }

  const root = decoded.root ?? decoded._1 ?? decoded;
  const data = root?.data ?? root?._3 ?? root;
  const routes = data?.routes ?? data?._929;
  if (routes && typeof routes === "object") {
    return routes[routeKey]?.data ?? routes[routeKey.replaceAll(".", "/")]?.data ?? null;
  }

  return null;
}

export function extractUpcomingLineup(decoded) {
  const indexData = extractRouteLoaderData(decoded, "routes/$edition._index");
  return indexData?.upcomingLineup ?? null;
}

export function extractMatchLineup(decoded) {
  const teamData = extractRouteLoaderData(decoded, "routes/$edition.team.($match)");
  return teamData?.lineup ?? null;
}

export function extractTransferSummary(decoded) {
  const transferData = extractRouteLoaderData(decoded, "routes/$edition.transfers");
  return transferData?.transferSummary ?? null;
}
