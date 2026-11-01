# homebridge-simple-reolink-doorbell

Exposes a Reolink video doorbell's button press as a native HomeKit **Doorbell**
accessory, so ringing it triggers HomePod "someone is at the door" chime and
announcements the same way a first-party HomeKit video doorbell would.

No camera feed, no camera.ui — just the ring event (plus a still snapshot).

This is a fork of
[`homebridge-reolink-doorbell`](https://github.com/Ultra-Sack/homebridge-reolink-doorbell),
whose published npm releases require a camera.ui setup. It has been renamed
so it doesn't collide with that package.

## How it works

The plugin connects directly to the doorbell over Reolink's **Baichuan**
protocol (TCP port 9000) using
[`@apocaliss92/nodelink-js`](https://github.com/apocaliss92/nodelink-js), and
listens for its `doorbell` push event. This is instant (no polling) and the
library handles reconnection/re-subscription on its own if the connection
drops.

## Requirements

- Homebridge 2.0+, Node 24
- A standalone Reolink doorbell (WiFi or PoE) reachable on your LAN
- The camera's local username/password (the same ones used in the Reolink
  app — not a Reolink Cloud account)

## Installation

This isn't published to npm, so the Homebridge UI's plugin search won't find
it (searching for "reolink doorbell" finds the original camera.ui-based
plugin instead). Install it from GitHub; the `prepare` script builds it
during install:

```bash
# from the Homebridge UI terminal, or inside the Homebridge container
cd /var/lib/homebridge   # your Homebridge storage directory
npm install github:bendiksolheim/homebridge-simple-reolink-doorbell
```

Then restart Homebridge.

## Configuration

Add a `SimpleReolinkDoorbell` platform block to `config.json` (or use the
Homebridge UI, since `config.schema.json` is included):

```json
{
  "platforms": [
    {
      "platform": "SimpleReolinkDoorbell",
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

Multiple doorbells can be listed.

## After adding to HomeKit

Once the accessory shows up in the Home app as a **Doorbell**:
1. Open its settings and confirm it's assigned to the right room.
2. HomePods in range will announce rings automatically — no extra
   automation needed, since this is a real HomeKit Doorbell service rather
   than a switch or motion sensor.

## Notes / limitations

- HomeKit only supports a Doorbell service that sits on the same accessory
  as a camera (a ring-only accessory shows as "Not Supported"), so the
  accessory also exposes a **placeholder camera**. It has no video: the tile
  and ring notifications show a still snapshot fetched from the doorbell
  (or a blank image if that fails), and live view won't start.
- If the doorbell is ever moved behind an NVR, set `channel` to its NVR
  channel index and point `host`/credentials at the NVR instead.
