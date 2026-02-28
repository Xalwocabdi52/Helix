#!/usr/bin/env python3
"""
NOVA Noise Gate Service
Real-time audio noise removal using local spectral gating.

Captures a noise profile at startup (1-2 seconds of ambient room noise),
then applies spectral subtraction to every audio chunk in real time.
Perfect for stationary noise like server hum, fans, HVAC.

Pipeline: USB Mic -> Spectral Gate -> BlackHole virtual device -> Voicemode

Usage:
    python noise_gate.py                    # Auto-detect devices
    python noise_gate.py --list-devices     # Show available audio devices
    python noise_gate.py --input-device 1 --output-device 2
    python noise_gate.py --profile-seconds 3  # Longer noise profile
"""

import argparse
import os
import sys
import signal
import threading
import queue
import time
import logging
from logging.handlers import RotatingFileHandler
import traceback
import functools

import numpy as np
import sounddevice as sd
from scipy.signal import butter, sosfilt

# --- Configuration ---
SAMPLE_RATE = 48000  # Match BlackHole 2ch native rate (48kHz) — voicemode also set to 48kHz
CHANNELS = 1
DTYPE = np.float32

# Processing parameters
CHUNK_MS = 30              # 30ms chunks — good FFT resolution at 48kHz (1440 samples)
CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_MS // 1000
FFT_SIZE = 2048            # Next power of 2 above chunk size for better FFT
HOP_SIZE = CHUNK_SAMPLES   # Non-overlapping for lowest latency

# Noise reduction tuning
NOISE_FLOOR_MULTIPLIER = 1.0   # How aggressively to suppress noise (1.0=gentle, 3.0=heavy)
SMOOTHING_ALPHA = 0.0          # Disabled — zero profile at startup causes adaptation to suppress speech

# High-pass filter to kill sub-80Hz rumble (fans, hum fundamentals)
HIGHPASS_CUTOFF = 80  # Hz

# --- Logging Configuration ---
LOG_DIR = os.path.join(os.path.dirname(__file__), "logs")
LOG_FILE = os.path.join(LOG_DIR, "noise_gate.log")
LOG_MAX_BYTES = 10 * 1024 * 1024  # 10MB
LOG_BACKUP_COUNT = 5

def setup_logging(debug=False):
    """Configure rotating file logger."""
    os.makedirs(LOG_DIR, exist_ok=True)

    logger = logging.getLogger("noise_gate")
    logger.setLevel(logging.DEBUG if debug else logging.INFO)

    # Rotating file handler
    handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=LOG_MAX_BYTES,
        backupCount=LOG_BACKUP_COUNT,
        encoding='utf-8'
    )

    formatter = logging.Formatter(
        '[%(asctime)s.%(msecs)03d] [%(levelname)s] [%(name)s] %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    handler.setFormatter(formatter)
    logger.addHandler(handler)

    # Also log to stderr for console visibility
    console = logging.StreamHandler(sys.stderr)
    console.setFormatter(formatter)
    console.setLevel(logging.WARNING)  # Only warnings+ to console
    logger.addHandler(console)

    return logger

# Global logger (initialized in main())
logger = None


def safe_audio_callback(callback_name):
    """Decorator to catch exceptions in audio callbacks and emit silence."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                logger.error(f"Exception in {callback_name}: {type(e).__name__}: {e}")
                logger.debug(f"Traceback:\n{traceback.format_exc()}")

                # Emit silence on error (graceful degradation)
                if callback_name == "output":
                    args[0].fill(0)  # outdata

                # Track sustained errors
                if not hasattr(wrapper, 'error_count'):
                    wrapper.error_count = 0
                wrapper.error_count += 1

                if wrapper.error_count > 100:
                    logger.critical(
                        f"{callback_name} failing repeatedly (count: {wrapper.error_count})"
                    )
                    wrapper.error_count = 0  # Reset to avoid spam

        wrapper.error_count = 0
        return wrapper
    return decorator


class NoiseGateService:
    """Real-time noise removal using local spectral gating."""

    def __init__(self, input_device=None, output_device=None, profile_seconds=2):
        self.input_device = input_device
        self.output_device = output_device
        self.profile_seconds = profile_seconds
        self.running = False

        # Audio buffers
        self.output_queue = queue.Queue(maxsize=200)

        # Noise profile (computed at startup)
        self.noise_spectrum = None

        # High-pass filter state
        self._hp_sos = butter(4, HIGHPASS_CUTOFF, btype='high', fs=SAMPLE_RATE, output='sos')
        self._hp_state = np.zeros((self._hp_sos.shape[0], 2))

        # Stats
        self.chunks_processed = 0
        self.start_time = None

    def _find_device(self, name_pattern, kind):
        """Find an audio device by name pattern."""
        devices = sd.query_devices()
        for i, dev in enumerate(devices):
            if name_pattern.lower() in dev["name"].lower():
                if kind == "input" and dev["max_input_channels"] > 0:
                    return i
                if kind == "output" and dev["max_output_channels"] > 0:
                    return i
        return None

    def _auto_detect_devices(self):
        """Auto-detect USB mic (input) and BlackHole (output)."""
        logger.info("Detecting audio devices...")

        if self.input_device is None:
            self.input_device = self._find_device("USB", "input")
            if self.input_device is None:
                logger.warning("USB mic not found, using default input")
                self.input_device = sd.default.device[0]

            device_info = sd.query_devices(self.input_device)
            logger.info(f"Input: [{self.input_device}] {device_info['name']}")
            print(f"  Input:  [{self.input_device}] {device_info['name']}")

        if self.output_device is None:
            self.output_device = self._find_device("BlackHole", "output")
            if self.output_device is None:
                logger.critical("BlackHole not found")
                raise RuntimeError(
                    "BlackHole not found. Install it: brew install blackhole-2ch"
                )

            device_info = sd.query_devices(self.output_device)
            logger.info(f"Output: [{self.output_device}] {device_info['name']}")
            print(f"  Output: [{self.output_device}] {device_info['name']}")

    def _capture_noise_profile(self):
        """Record ambient noise to build the spectral profile."""
        num_samples = int(SAMPLE_RATE * self.profile_seconds)
        logger.info(f"Capturing {self.profile_seconds}s noise profile...")
        print(f"\n  Capturing {self.profile_seconds}s noise profile... (stay quiet)")

        try:
            recording = sd.rec(
                num_samples,
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="float32",
                device=self.input_device,
            )

            # Add timeout check to prevent infinite hang
            wait_timeout = self.profile_seconds + 5.0  # 5s grace period
            start_time = time.time()

            while not recording.flags['C_CONTIGUOUS']:
                if time.time() - start_time > wait_timeout:
                    logger.error(f"Noise profile capture timeout ({wait_timeout}s)")
                    raise RuntimeError("Noise profile capture timed out")
                time.sleep(0.1)

            sd.wait()

            audio = recording[:, 0]

            # Validate recording
            if len(audio) < num_samples * 0.9:  # At least 90% of expected samples
                logger.error(f"Incomplete recording: {len(audio)}/{num_samples} samples")
                raise RuntimeError("Noise profile recording incomplete")

            if np.all(audio == 0):
                logger.warning("Noise profile is all zeros (mic may be muted)")

            # Compute average power spectrum across overlapping windows
            window = np.hanning(FFT_SIZE)
            hop = FFT_SIZE // 2
            spectra = []

            for start in range(0, len(audio) - FFT_SIZE, hop):
                chunk = audio[start : start + FFT_SIZE] * window
                spectrum = np.abs(np.fft.rfft(chunk))
                spectra.append(spectrum)

            self.noise_spectrum = np.mean(spectra, axis=0)

            # Report noise characteristics
            peak_freq_bin = np.argmax(self.noise_spectrum)
            peak_freq = peak_freq_bin * SAMPLE_RATE / FFT_SIZE
            rms = np.sqrt(np.mean(audio ** 2))

            logger.info(
                f"Profile captured: RMS={rms:.6f}, peak={peak_freq:.0f}Hz, bins={len(self.noise_spectrum)}"
            )
            print(f"  Noise profile captured: RMS={rms:.6f}, peak at ~{peak_freq:.0f}Hz")
            print(f"  Spectrum bins: {len(self.noise_spectrum)}, suppression: {NOISE_FLOOR_MULTIPLIER}x")

        except Exception as e:
            logger.critical(f"Noise profile capture failed: {type(e).__name__}: {e}")
            logger.debug(f"Traceback:\n{traceback.format_exc()}")
            raise

    def _process_chunk(self, audio):
        """Apply spectral gating to a single audio chunk."""
        try:
            # 1. High-pass filter to kill low-frequency rumble
            filtered, self._hp_state = sosfilt(self._hp_sos, audio, zi=self._hp_state)

            # 2. FFT
            # Pad to FFT_SIZE if needed
            padded = np.zeros(FFT_SIZE)
            padded[:len(filtered)] = filtered
            window = np.hanning(FFT_SIZE)
            spectrum = np.fft.rfft(padded * window)
            magnitude = np.abs(spectrum)
            phase = np.angle(spectrum)

            # 3. Spectral subtraction
            # Subtract noise floor — output true silence when below threshold for VAD compatibility
            noise_threshold = self.noise_spectrum * NOISE_FLOOR_MULTIPLIER
            clean_magnitude = np.maximum(magnitude - noise_threshold, 0)

            # 4. Reconstruct signal
            clean_spectrum = clean_magnitude * np.exp(1j * phase)
            clean_audio = np.fft.irfft(clean_spectrum)

            # 5. Slowly adapt noise estimate for drifting noise (very conservative)
            self.noise_spectrum = (
                (1 - SMOOTHING_ALPHA) * self.noise_spectrum
                + SMOOTHING_ALPHA * magnitude
            )

            return clean_audio[:len(audio)].astype(np.float32)

        except Exception as e:
            logger.error(f"Processing error: {type(e).__name__}: {e}")
            logger.debug(f"Traceback:\n{traceback.format_exc()}")
            # Return unprocessed audio as fallback (better than silence)
            return audio.astype(np.float32)

    @safe_audio_callback("stream")
    def _stream_callback(self, indata, outdata, frames, time_info, status):
        """Combined input/output callback — processes in same tick, no queue desync."""
        if status:
            logger.warning(f"Stream status: {status}")
        audio = indata[:, 0].copy()
        cleaned = self._process_chunk(audio)
        outdata[:frames, 0] = cleaned[:frames]
        if outdata.shape[1] > 1:
            outdata[:frames, 1] = cleaned[:frames]
        self.chunks_processed += 1

    def start(self):
        """Start the noise gate service."""
        logger.info("=== NOVA Noise Gate Starting ===")
        print("\nNOVA Noise Gate")
        print("=" * 40)

        try:
            self._auto_detect_devices()
            self._capture_noise_profile()
        except Exception as e:
            logger.critical(f"Initialization failed: {e}")
            print(f"\n  FATAL: Initialization failed: {e}")
            return

        self.running = True
        self.start_time = time.time()

        logger.info(f"Starting streams: {SAMPLE_RATE}Hz, {CHUNK_MS}ms chunks")
        print(f"\n  Starting: {SAMPLE_RATE}Hz, {CHUNK_MS}ms chunks")
        print("  Press Ctrl+C to stop\n")

        try:
            stream = sd.Stream(
                device=(self.input_device, self.output_device),
                samplerate=SAMPLE_RATE,
                channels=(CHANNELS, 2),
                dtype="float32",
                blocksize=CHUNK_SAMPLES,
                callback=self._stream_callback,
            )

            logger.info("Stream created successfully")

        except Exception as e:
            logger.critical(f"Stream creation failed: {type(e).__name__}: {e}")
            logger.debug(f"Traceback:\n{traceback.format_exc()}")
            print(f"\n  FATAL: Stream creation failed: {e}")
            return

        with stream:
            try:
                logger.info("Streams started, entering run loop")
                while self.running:
                    time.sleep(1)
                    elapsed = time.time() - self.start_time
                    rate = self.chunks_processed / elapsed if elapsed > 0 else 0
                    print(
                        f"\r  Chunks: {self.chunks_processed:,} | Rate: {rate:.0f}/s   ",
                        end="",
                        flush=True,
                    )
            except KeyboardInterrupt:
                logger.info("Received SIGINT, stopping gracefully")
            except Exception as e:
                logger.critical(f"Run loop crashed: {type(e).__name__}: {e}")
                logger.debug(f"Traceback:\n{traceback.format_exc()}")

        logger.info("Streams stopped")
        print("\n\n  Noise gate stopped.")

    def stop(self):
        """Stop the service."""
        self.running = False


def list_devices():
    """Print available audio devices."""
    print("\nAvailable audio devices:\n")
    devices = sd.query_devices()
    for i, dev in enumerate(devices):
        kind = ""
        if dev["max_input_channels"] > 0:
            kind += "IN"
        if dev["max_output_channels"] > 0:
            kind += ("/OUT" if kind else "OUT")
        print(f"  [{i}] {dev['name']} ({kind}) - {int(dev['default_samplerate'])}Hz")
    print()


def main():
    global logger

    parser = argparse.ArgumentParser(description="NOVA Noise Gate Service")
    parser.add_argument("--list-devices", action="store_true", help="List audio devices")
    parser.add_argument("--input-device", type=int, default=None, help="Input device index")
    parser.add_argument("--output-device", type=int, default=None, help="Output device index")
    parser.add_argument("--profile-seconds", type=float, default=2.0,
                        help="Seconds of ambient noise to capture for profile (default: 2)")
    parser.add_argument("--suppression", type=float, default=1.5,
                        help="Noise suppression strength (default: 1.5)")
    parser.add_argument("--debug", action="store_true",
                        help="Enable debug logging")
    args = parser.parse_args()

    # Initialize logging FIRST
    logger = setup_logging(debug=args.debug)

    if args.list_devices:
        list_devices()
        return

    global NOISE_FLOOR_MULTIPLIER
    NOISE_FLOOR_MULTIPLIER = args.suppression

    logger.info(f"Starting with suppression={args.suppression}")

    service = NoiseGateService(
        input_device=args.input_device,
        output_device=args.output_device,
        profile_seconds=args.profile_seconds,
    )

    def handle_signal(sig, frame):
        signal_name = "SIGINT" if sig == signal.SIGINT else "SIGTERM"
        logger.info(f"Received {signal_name}, stopping...")
        service.stop()

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    try:
        service.start()
    except Exception as e:
        logger.critical(f"Unhandled exception in service.start(): {type(e).__name__}: {e}")
        logger.debug(f"Traceback:\n{traceback.format_exc()}")
        print(f"\n  FATAL ERROR: {e}")
        print(f"  Check logs: {LOG_FILE}")
        sys.exit(1)

    logger.info("Service shutdown complete")


if __name__ == "__main__":
    main()
