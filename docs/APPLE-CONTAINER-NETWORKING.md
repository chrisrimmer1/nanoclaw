# Apple Container Networking Setup (macOS 26)

Apple Container's vmnet networking requires manual configuration for containers to access the internet and host services.

## Quick Setup

Run these commands (requires `sudo`):

```bash
# 1. Enable IP forwarding so the host routes container traffic
sudo sysctl -w net.inet.ip.forwarding=1

# 2. Enable NAT so container traffic gets masqueraded through your internet interface
echo "nat on en0 from 192.168.64.0/24 to any -> (en0)" | sudo pfctl -ef -

# 3. Create DNS entry so containers can reach host services (e.g. credential proxy)
sudo container system dns create host.container.internal --localhost 203.0.113.1
```

> **Note:** Replace `en0` with your active internet interface. Check with: `route get 8.8.8.8 | grep interface`

## Making It Persistent

These settings reset on reboot. To make them permanent:

**IP Forwarding** — add to `/etc/sysctl.conf`:
```
net.inet.ip.forwarding=1
```

**NAT Rules** — add to `/etc/pf.conf` (before any existing rules):
```
nat on en0 from 192.168.64.0/24 to any -> (en0)
```

Then reload: `sudo pfctl -f /etc/pf.conf`

**Host DNS** — the `container system dns create` command persists across reboots automatically.

## IPv6 DNS Issue

By default, DNS resolvers return IPv6 (AAAA) records before IPv4 (A) records. Since our NAT only handles IPv4, Node.js applications inside containers will try IPv6 first and fail.

The container image and runner are configured to prefer IPv4 via:
```
NODE_OPTIONS=--dns-result-order=ipv4first
```

This is set both in the `Dockerfile` and passed via `-e` flag in `container-runner.ts`.

## Verification

```bash
# Check IP forwarding is enabled
sysctl net.inet.ip.forwarding
# Expected: net.inet.ip.forwarding: 1

# Check host DNS entry exists
container system dns list
# Expected: host.container.internal in the list

# Test container internet access
container run --rm --entrypoint curl nanoclaw-agent:latest \
  -s4 --connect-timeout 5 -o /dev/null -w "%{http_code}" https://api.anthropic.com
# Expected: 404

# Test container can reach host (with NanoClaw running)
container run --rm --entrypoint curl nanoclaw-agent:latest \
  -s --connect-timeout 5 -o /dev/null -w "%{http_code}" http://host.container.internal:3001/v1/messages
# Expected: 405
```

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `curl: (28) Connection timed out` | IP forwarding disabled | `sudo sysctl -w net.inet.ip.forwarding=1` |
| HTTP works, HTTPS times out | IPv6 DNS resolution | Add `NODE_OPTIONS=--dns-result-order=ipv4first` |
| `Could not resolve host` | DNS not forwarded | Check bridge100 exists, verify pfctl NAT rules |
| `ENOTFOUND` / API unreachable | Host DNS entry missing | `sudo container system dns create host.container.internal --localhost 203.0.113.1` |
| `EADDRNOTAVAIL` on proxy start | Stale bridge IP binding | Fixed — proxy now binds to 127.0.0.1, not bridge IP |
| Container hangs after output | Missing `process.exit(0)` in agent-runner | Rebuild container image |

## How It Works

```
Container VM (192.168.64.x)
    │
    ├── eth0 → gateway 192.168.64.1
    │
    ├── host.container.internal → routed to host loopback by Apple Container DNS
    │       └── credential proxy on 127.0.0.1:3001
    │
bridge100 (192.168.64.1) ← host bridge, created by vmnet when container runs
    │
    ├── IP forwarding (sysctl) routes packets from bridge100 → en0
    │
    ├── NAT (pfctl) masquerades 192.168.64.0/24 → en0's IP
    │
en0 (your WiFi/Ethernet) → Internet
```

## References

- [apple/container#469](https://github.com/apple/container/issues/469) — No network from container on macOS 26
- [apple/container#656](https://github.com/apple/container/issues/656) — Cannot access internet URLs during building
- [apple/container#346](https://github.com/apple/container/issues/346) — Connect to host services (--localhost DNS)
