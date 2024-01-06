import "https://deno.land/std@0.201.0/dotenv/load.ts";
import items from "./items.json" assert { type: "json" };

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

enum UnlockStatus {
  Locked = "locked",
  Corrupted = "corrupted",
  Unlocked = "unlocked",
}

const rateLimit = 1000; // one request per second
const rateLimits = new Map<string, number>();

Deno.serve(async (request, info) => {
  const ip = info.remoteAddr.hostname;

  const lastRequest = rateLimits.get(ip) || 0;
  const now = Date.now();
  if (now - lastRequest < rateLimit) {
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

  const url = new URL(request.url);
  const xPlatformId = url.pathname.slice(1);
  if (!isXPlatformId(xPlatformId)) {
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
        return new Response("Not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      if (!response.ok) {
        console.error(await response.text());
        return new Response("Internal server error", {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      const profile = await response.json();
      let status = UnlockStatus.Corrupted;
      if (profile.profile.server.unlocks.all === undefined) {
        status = UnlockStatus.Locked;
      } else if (
        items.every((
          item,
        ) => (item in profile.profile.server.unlocks.all &&
          profile.profile.server.unlocks.all[item] === true)
        ) && Object.keys(profile.profile.server.unlocks.all).length ===
          items.length
      ) status = UnlockStatus.Unlocked;

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
                  all: items.reduce((acc, item) => {
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
        return new Response("Not found", {
          status: 404,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

      if (!response.ok) {
        console.error(await response.text());
        return new Response("Internal server error", {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
          },
        });
      }

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
