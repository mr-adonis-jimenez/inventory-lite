# Local Vault

**Local Vault** is a high-speed, client-side inventory management tool designed for environments where simplicity, performance, and data ownership matter.

No servers.  
No accounts.  
No latency.

Your inventory lives exactly where it should: locally.

---

## What It Does

- Tracks inventory items with quantity and location
- Persists data using browser localStorage
- Runs entirely client-side
- Works offline
- Zero backend dependencies

Old-school reliability, modern execution.

---

## Why Local Vault

Inventory management fails when systems are:
- Slow
- Overbuilt
- Dependent on connectivity

Local Vault flips the model:
- Instant reads/writes
- No network risk
- No vendor lock-in
- No surprise outages

## Advanced Modes

### Encrypted Vault Mode
- AES-256-GCM encryption
- Password-derived keys
- Zero plaintext persistence
- Data unrecoverable without password (by design)

### IndexedDB Storage
- Handles large inventories
- Async, indexed access
- No browser quota surprises

### Desktop Application
- Electron-powered
- Cross-platform (Windows / macOS / Linux)
- Fully offline
- Local-only data

---

## Security Model

- Client-side encryption only
- No key storage
- No telemetry
- No cloud sync unless explicitly added

If your threat model includes forgotten passwords, this tool is not for you.


## Architecture

```text
UI → Vault Engine → Local Storage

