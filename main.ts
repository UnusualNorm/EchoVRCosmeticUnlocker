import "https://deno.land/std@0.201.0/dotenv/load.ts";
import itemsToUnlock from "./items.json" assert { type: "json" };

// TODO: add more
const platforms = [
  "DMO",
  "OVR-ORG",
];

const isXPlatformId = (id: string): boolean => {
  const idParts = id.split("-");
  const accountId = idParts.pop()!;
  const platform = idParts.join("-");

  if (!platforms.includes(platform)) return false;
  try {
    BigInt(accountId);
  } catch {
    return false;
  }

  return true;
};

const echoRelayEndpoint = new URL(
  Deno.env.get("ECHO_RELAY_ENDPOINT") || "http://127.0.0.1:8080/",
);
const getEndpoint = (pathname: string): URL =>
  new URL(pathname, echoRelayEndpoint);
const echoRelayApiKey = Deno.env.get("ECHO_RELAY_API_KEY") || "";
const rateLimit = Number(Deno.env.get("RATE_LIMIT") || "1000");

enum UnlockStatus {
  Locked = "locked",
  Corrupted = "corrupted",
  Unlocked = "unlocked",
}

const rateLimits = new Map<string, number>();

Deno.serve(async (request, info) => {
  const ip = info.remoteAddr.hostname;
  const url = new URL(request.url);

  const log = (
    level: "debug" | "info" | "warn" | "error",
    status: number,
    message: string,
    comment?: string,
  ) =>
    console[level](
      `${ip} ${request.method} ${url.pathname} ${status} \"${message}\"${
        comment ? ` \"${comment}\"` : ""
      }`,
    );

  const lastRequest = rateLimits.get(ip) || 0;
  const now = Date.now();
  if (now - lastRequest < rateLimit) {
    log(
      "warn",
      429,
      "Rate limit exceeded",
      String(lastRequest),
    );
    return new Response("Rate limit exceeded", {
      status: 429,
      headers: {
        "Content-Type": "text/plain",
        "Retry-After": `${(lastRequest + rateLimit - now) / 1000}`,
        "X-RateLimit-Limit": `${rateLimit / 1000}`,
        "X-RateLimit-Remaining": `${(lastRequest + rateLimit - now) / 1000}`,
      },
    });
  }
  rateLimits.set(ip, now);

  const xPlatformId = url.pathname.slice(1);
  if (!isXPlatformId(xPlatformId)) {
    log("warn", 400, "Invalid XPlatformId");
    return new Response("Invalid XPlatformId", {
      status: 400,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  }

  switch (request.method) {
    case "GET": {
      const response = await fetch(
        getEndpoint(`/accounts/${xPlatformId}`),
        {
          headers: {
            "X-Api-Key": echoRelayApiKey,
          },
        },
      );

      if (response.status === 404) {
        log("warn", 404, "Not found", await response.text());
        return new Response("Not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      if (!response.ok) {
        log("error", 500, "Internal server error", await response.text());
        return new Response("Internal server error", {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      const profile = await response.json();
      const unlockedItems = profile.profile.server.unlocks.all
        ? Object.entries(profile.profile.server.unlocks.all)
          .map(
            ([item, unlocked]) => unlocked ? item : null,
          ).filter((item): item is string => item !== null)
        : [];

      let status = UnlockStatus.Corrupted;
      if (unlockedItems.length === 0) {
        status = UnlockStatus.Locked;
      } else if (
        unlockedItems.length === itemsToUnlock.length &&
        itemsToUnlock.every((item) => unlockedItems.includes(item))
      ) {
        status = UnlockStatus.Unlocked;
      }

      log("info", 200, status);
      return new Response(status, {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
        },
      });
    }
    case "POST": {
      const response = await fetch(
        getEndpoint(`/accounts/${xPlatformId}`),
        {
          method: "POST",
          headers: {
            "X-Api-Key": echoRelayApiKey,
          },
          body: JSON.stringify({
            profile: {
              server: {
                unlocks: {
                  all: itemsToUnlock.reduce((acc, item) => {
                    acc[item] = true;
                    return acc;
                  }, {} as Record<string, boolean>),
                },
              },
            },
          }),
        },
      );

      if (response.status === 404) {
        log("warn", 404, "Not found", await response.text());
        return new Response("Not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      if (!response.ok) {
        log("error", 500, "Internal server error", await response.text());
        return new Response("Internal server error", {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      log("info", 200, "OK");
      return new Response("OK", {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
        },
      });
    }
    default: {
      return new Response("Method not allowed", {
        status: 405,
        headers: {
          "Content-Type": "text/plain",
        },
      });
    }
  }
});
