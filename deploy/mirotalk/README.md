# MiroTalk P2P Deployment — SkilledProz Video Calls

Self-hosted WebRTC video calling. Runs on the same VPS as the backend.
Zero per-minute fees. Media flows peer-to-peer; the server only brokers
signaling traffic and provides STUN for NAT traversal.

## Architecture

    Hirer browser  <--- P2P media --->  Worker browser
           |                                    |
           +--------- signaling ---------------+
                            |
              call.skilledproz.com (Nginx)
                            |
                    MiroTalk P2P :3000
                            |
                    (same VPS as backend)

## Files in this folder

| File                              | Purpose                       | Server location                                   |
| --------------------------------- | ----------------------------- | ------------------------------------------------- |
| `docker-compose.yml`              | MiroTalk container definition | `/opt/mirotalk/docker-compose.yml`                |
| `nginx-call.skilledproz.com.conf` | Nginx site config             | `/etc/nginx/sites-available/call.skilledproz.com` |

## Local → server workflow

**Never edit files directly on the server.** Always:

1. Edit locally in this folder
2. `scp` to the server
3. Restart the affected service

## First-time deployment

1. **DNS**: `call.skilledproz.com` A record → `174.138.44.155`

2. **Docker**: install on VPS (once):
   ```bash
   curl -fsSL https://get.docker.com | sh
   ```
