<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:0f0f23,50:1e1b4b,100:312e81&height=200&section=header&text=WaveTransfer&fontSize=52&fontColor=e2e8f0&animation=fadeIn&fontAlignY=38&desc=Send%20files%20through%20sound.%20No%20internet.%20No%20setup.%20Just%20audio.&descSize=14&descAlignY=58&descColor=94a3b8" width="100%" />

</div>

<br />

<div align="center">

[![Visitors](https://visitor-badge.laobi.icu/badge?page_id=astranode.wavetransfer&left_color=1e1b4b&right_color=6d28d9&left_text=visitors&style=flat-square)](https://github.com/yourusername/wavetransfer)&nbsp;
[![Stars](https://img.shields.io/github/stars/astranode/wavetransfer?style=flat-square&logo=github&logoColor=white&label=stars&color=6d28d9&labelColor=1e1b4b)](https://github.com/yourusername/wavetransfer/stargazers)&nbsp;
[![Forks](https://img.shields.io/github/forks/astranode/wavetransfer?style=flat-square&logo=git&logoColor=white&label=forks&color=7c3aed&labelColor=1e1b4b)](https://github.com/yourusername/wavetransfer/network/members)&nbsp;
[![License](https://img.shields.io/badge/license-MIT-8b5cf6?style=flat-square&labelColor=1e1b4b)](LICENSE)&nbsp;
[![Deploy](https://img.shields.io/badge/vercel-live-a78bfa?style=flat-square&logo=vercel&logoColor=white&labelColor=1e1b4b)](https://wavetransfer.vercel.app)

</div>

<div align="center">

[![Next.js](https://img.shields.io/badge/Next.js_14-0f0f23?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org)&nbsp;
[![TypeScript](https://img.shields.io/badge/TypeScript-0f0f23?style=flat-square&logo=typescript&logoColor=3178c6)](https://typescriptlang.org)&nbsp;
[![Tailwind](https://img.shields.io/badge/Tailwind_CSS-0f0f23?style=flat-square&logo=tailwindcss&logoColor=38bdf8)](https://tailwindcss.com)&nbsp;
[![shadcn/ui](https://img.shields.io/badge/shadcn%2Fui-0f0f23?style=flat-square&logo=shadcnui&logoColor=white)](https://ui.shadcn.com)&nbsp;
[![Web Audio](https://img.shields.io/badge/Web_Audio_API-0f0f23?style=flat-square&logo=googlechrome&logoColor=f97316)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)

</div>

<br />

---

<br />

<div align="center">

**WaveTransfer encodes your files into audio tones, plays them out loud,**
**and lets another device decode them through its microphone — in real time.**

*Works on planes. In Faraday cages. On air-gapped machines.*
*Anywhere two devices can physically hear each other.*

</div>

<br />

---

<br />

## &nbsp;The Protocol

WaveTransfer uses **16-FSK (Frequency-Shift Keying)** — the same class of modulation that powered early modems and underwater acoustic systems. Each symbol is one of 16 audio frequencies, encoding 4 bits at a time. Detection runs entirely via the **Goertzel algorithm**, which is significantly more efficient than FFT when you're hunting for a known set of frequencies.

<br />

<div align="center">

```
DROP FILE  ──▶  nibbles  ──▶  16 frequencies  ──▶  speaker  ──▶  mic  ──▶  Goertzel  ──▶  nibbles  ──▶  FILE
```

</div>

<br />

Every transmission follows a strict four-phase sequence:

<br />

| Phase | Signal | Purpose |
|---|---|---|
| 🔔 &nbsp;**Handshake** | 1800 Hz · 1 second | Receiver locks on and prepares |
| ⚡ &nbsp;**Sync burst** | 2500 Hz · 0.3 seconds | Data stream is incoming |
| 📡 &nbsp;**Data** | 800 – 3800 Hz · 16-FSK | Payload at 150 baud |
| 🔚 &nbsp;**End marker** | 4200 Hz · 0.5 seconds | Triggers checksum verification |

<br />

A **CRC-8 checksum** appended to every transmission catches corruption before anything reaches the user. If the data doesn't verify, you get an explicit error — never a silently broken file.

<br />

```
Throughput   ≈ 600 bps effective  (150 baud × 4 bits/symbol)
Freq range     800 Hz – 3800 Hz in 200 Hz steps
Tones          16 data symbols  ·  3 reserved for control
Error check    CRC-8 over full payload including header
```

<br />

---

<br />

## &nbsp;Features

<br />

- **Zero infrastructure** — no server, no pairing, no accounts, no install required
- **Air-gap ready** — designed for environments where WiFi and Bluetooth are off-limits
- **Fully client-side** — files never leave your browser, ever
- **Live waveform visualizer** — watch your data travel as sound in real time
- **Symbol-accurate progress** — live symbol count, percentage, and elapsed time during transfer
- **Graceful mic handling** — clear, browser-specific error messages with step-by-step fix instructions
- **Drag & drop** — with instant transfer time and symbol count estimates before you send
- **CRC-8 verification** — every received file is verified before the download button appears
- **Image preview** — images are previewed inline on the receiver side before download

<br />

---

<br />

## &nbsp;Getting Started

<br />

```bash
git clone https://github.com/yourusername/wavetransfer.git
cd wavetransfer
npm install
npm run dev
```

Open [`http://localhost:3000`](http://localhost:3000) — no environment variables needed.

<br />

> **Heads up:** Microphone access requires either `https://` or `localhost`. Browsers silently block mic requests over plain HTTP, so avoid testing from a raw IP address.

<br />

### One-click deploy

<br />

<div align="center">

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/AstraNode/wavetransfer)

</div>

<br />

The `vercel.json` in this repo ships with all required `Permissions-Policy` headers for microphone access. Nothing extra to configure.

<br />

---

<br />

## &nbsp;How to Use

<br />

**Sending a file**

1. Open WaveTransfer on the sender device and go to the **Send** tab
2. Drop any file onto the upload zone — you'll see an estimated transfer time instantly
3. On the **receiver** device, open WaveTransfer and press **Start Listening**
4. Back on the sender, press **Transmit via Audio** — turn volume all the way up
5. Keep devices 1–3 feet apart and wait for the waveform to go quiet

<br />

**Receiving a file**

1. Press **Start Listening** *before* the sender starts transmitting
2. Watch the waveform monitor — you'll see the handshake tone register
3. A progress bar appears once data symbols start arriving
4. When the CRC passes, a download button appears — your file is ready

<br />

> **Best results:** Small files under 1 KB transfer in seconds. The protocol is designed for bootstrapping — a URL, a password, a small config — not replacing your flash drive. Quiet environments improve accuracy significantly.

<br />

---

<br />

## &nbsp;Project Structure

<br />

```
wavetransfer/
│
├── app/
│   ├── page.tsx                   # Root layout and tab shell
│   ├── layout.tsx                 # Metadata and global providers
│   └── globals.css                # Tailwind base + glass utilities
│
├── components/
│   ├── sender-tab.tsx             # File selection, estimates, transmit controls
│   ├── receiver-tab.tsx           # Mic listener, decode UI, status machine
│   ├── waveform-visualizer.tsx    # Canvas-based real-time waveform renderer
│   ├── file-dropzone.tsx          # Drag & drop with file type icons
│   └── download-card.tsx          # Post-receive file preview + download
│
├── hooks/
│   ├── use-audio-transmitter.ts   # Web Audio scheduler + FSK tone generator
│   └── use-audio-receiver.ts      # Mic pipeline + Goertzel state machine
│
└── lib/
    ├── audio-protocol.ts          # Encoding, decoding, frequency detection
    ├── crc8.ts                    # CRC-8 checksum (polynomial 0x31)
    ├── types.ts                   # Shared TypeScript interfaces
    └── utils.ts                   # Formatting helpers
```

<br />

---

<br />

## &nbsp;Technical Notes

<br />

<details>
<summary><strong>Why Goertzel and not FFT?</strong></summary>

<br />

FFT gives you the full frequency spectrum but computes power proportional to the entire window size. When you already know exactly which 16 frequencies you care about, Goertzel is the better call — it runs a targeted second-order IIR filter per frequency. For 16 known tones on every audio buffer, it's meaningfully cheaper and simpler to reason about.

Each symbol window gets scored against all 16 candidate frequencies. The highest magnitude wins. Confidence is calculated as `(best − second_best) / best` — low-confidence windows get discarded rather than guessed.

<br />

</details>

<details>
<summary><strong>Handshake detection — avoiding false positives</strong></summary>

<br />

A single frame detecting 1800 Hz isn't enough. WaveTransfer requires at least 5 consecutive positive detections with a signal-to-noise ratio above 3× before transitioning state. Detections decay slowly on a miss rather than resetting hard — brief ambient noise won't knock the receiver out of sync mid-handshake.

<br />

</details>

<details>
<summary><strong>Symbol windowing — why alignment matters</strong></summary>

<br />

During data reception, the receiver doesn't process raw audio buffer chunks directly. It accumulates incoming samples into an exact `samplesPerSymbol` window before running detection. Precise alignment is what makes 150 baud reliably decodable — even a few samples of drift per window compounds badly across hundreds of symbols.

<br />

</details>

<details>
<summary><strong>CRC-8 — what it catches and what it doesn't</strong></summary>

<br />

CRC-8 with polynomial `0x31` catches all single-bit errors and most burst errors within a byte. For a protocol running over acoustic channels, the dominant failure mode is a dropped or doubled symbol — which CRC-8 handles well. It won't recover catastrophically noisy transmissions, but it ensures you never silently receive a corrupted file.

<br />

</details>

<br />

---

<br />

## &nbsp;Browser Support

<br />

| Browser | Transmit | Receive | Notes |
|---|---|---|---|
| Chrome / Edge 89+ | ✅ | ✅ | Full support |
| Firefox 76+ | ✅ | ✅ | Full support |
| Safari 14.1+ | ✅ | ✅ | Requires user gesture for AudioContext |
| Mobile Chrome | ✅ | ✅ | Works reliably in practice |
| Mobile Safari | ⚠️ | ⚠️ | AudioContext resume quirks on iOS 15 and below |

<br />

---

<br />

## &nbsp;Contributing

Pull requests are welcome. If you're taking on something non-trivial, open an issue first so we can align on approach — especially anything touching the core FSK protocol or Goertzel implementation, where subtle changes can silently break inter-device compatibility.

<br />

```bash
npm run dev     # local dev server
npm run lint    # eslint
npm run build   # production build
```

<br />

---

<br />

## &nbsp;License

MIT — see [`LICENSE`](LICENSE) for the full text.

<br />

---

<br />

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:312e81,50:1e1b4b,100:0f0f23&height=120&section=footer&animation=fadeIn" width="100%" />

*Built with the Web Audio API and a healthy respect for what you can do with frequencies.*

</div>
