# homebridge-reolink-doorbell

Exposes a Reolink video doorbell's button press as a native HomeKit **Doorbell**
accessory, so ringing it triggers HomePod "someone is at the door" chime and
announcements the same way a first-party HomeKit video doorbell would.

## Why this exists

Reolink doorbells don't support HomeKit natively. `camera.ui` and similar
plugins can show the video feed, but none of the existing Reolink Homebridge
plugins surface the actual button-press ("Visitor") event as a HomeKit
Doorbell service — which is what's needed for HomePods to announce the ring
automatically, without a separate automation.

This plugin connects directly to the doorbell over Reolink's **Baichuan**
protocol (TCP port 9000) using
[`@apocaliss92/nodelink-js`](https://github.com/apocaliss92/nodelink-js), and
listens for its `doorbell` push event. This is instant (no polling) and the
library handles reconnection/re-subscription on its own if the connection
drops.

## Requirements

- Homebridge 1.8+ or 2.0+, Node 18/20/22
- A standalone Reolink doorbell (WiFi or PoE) reachable on your LAN
- The camera's local username/password (the same ones used in the Reolink
  app — not a Reolink Cloud account)

## Installation

Build and deploy the same way as your other custom plugins — this isn't
published to npm yet, so install it into your Homebridge container from a
local copy or a private GitHub repo:

```bash
# inside the plugin directory
npm install
npm run build
```

Then either:
- `npm link` it into your Homebridge Docker container's `node_modules`, or
- publish it under `@Ultra-Sack` on npm and `npm install` it normally, same
  as `homebridge-octopus-power-lightsensor` etc.

## Configuration

Add a `ReolinkDoorbell` platform block to `config.json` (or use the
Homebridge UI, since `config.schema.json` is included):

```json
{
  "platforms": [
    {
      "platform": "ReolinkDoorbell",
      "doorbells": [
        {
          "name": "Front Door",
          "host": "192.168.1.50",
          "port": 9000,
          "username": "admin",
          "password": "your-camera-password",
          "channel": 0,
          "ringThrottleSeconds": 3
        }
      ]
    }
  ]
}
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Accessory name shown in the Home app |
| `host` | yes | Doorbell's local IP address |
| `port` | no | Baichuan port, default `9000` |
| `username` / `password` | yes | Local camera credentials |
| `channel` | no | `0` for a standalone doorbell |
| `ringThrottleSeconds` | no | Suppresses duplicate ring events fired in quick succession from one press (default `3`) |

Multiple doorbells can be listed if you add more in future.

## After adding to HomeKit

Once the accessory shows up in the Home app as a **Doorbell**:
1. Open its settings and confirm it's assigned to the right room.
2. HomePods in range will announce rings automatically — no extra
   automation needed, since this is a real HomeKit Doorbell service rather
   than a switch or motion sensor.
3. Optionally, still keep your existing Google Home / Alexa / IFTTT
   integrations in parallel — they're independent of this.

## Notes / limitations

- This plugin only handles the **ring event**. Video stays with whatever
  you're already using (`camera.ui`) to view the doorbell's stream —
  there's no reason to duplicate that here.
- If the doorbell is ever moved behind an NVR, set `channel` to its NVR
  channel index and point `host`/credentials at the NVR instead.
- Two-way audio isn't implemented, but the underlying library supports it
  (`createDedicatedTalkSession`) if you want to extend this later.
