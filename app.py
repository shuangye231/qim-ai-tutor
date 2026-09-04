"""Compatibility launcher for the modular backend package."""

import os
import sys

import uvicorn

from backend import legacy


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8899"))
    print(f"Open http://localhost:{port}")
    uvicorn.run(legacy.app, host="0.0.0.0", port=port)
else:
    # Keep existing integrations that import `app` working during the route migration.
    sys.modules[__name__] = legacy
