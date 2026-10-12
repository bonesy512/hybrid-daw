use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use rtrb::{Producer, RingBuffer};
use serde::{Deserialize, Serialize};

use crate::audio::sample_engine::generate_waveform_peaks;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AudioDeviceDescriptor {
    pub id: String,
    pub name: String,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecordedClipMetadata {
    pub file_path: String,
    pub filename: String,
    pub duration_seconds: f32,
    pub sample_rate: u32,
    pub channels: u16,
    pub waveform_peaks: Vec<f32>,
    pub track_id: String,
    pub track_index: usize,
}

/// Core audio recorder managing hardware input streams and lock-free disk writes.
pub struct AudioRecorder {
    active_stream: Option<Stream>,
    is_recording: Arc<AtomicBool>,
    is_monitoring: Arc<AtomicBool>,
    peak_level: Arc<AtomicU32>,
    writer_handle: Option<std::thread::JoinHandle<Result<RecordedClipMetadata, String>>>,
    active_track_id: String,
    active_track_index: usize,
}

// Windows CPAL streams wrap COM pointers. Holding behind Mutex in Tauri state is thread-safe.
unsafe impl Send for AudioRecorder {}
unsafe impl Sync for AudioRecorder {}

impl Default for AudioRecorder {
    fn default() -> Self {
        Self::new()
    }
}

impl AudioRecorder {
    pub fn new() -> Self {
        Self {
            active_stream: None,
            is_recording: Arc::new(AtomicBool::new(false)),
            is_monitoring: Arc::new(AtomicBool::new(true)),
            peak_level: Arc::new(AtomicU32::new(0)),
            writer_handle: None,
            active_track_id: String::new(),
            active_track_index: 0,
        }
    }

    /// List physical and virtual audio inputs on the system.
    pub fn list_input_devices() -> Vec<AudioDeviceDescriptor> {
        let host = cpal::default_host();
        let default_name = host.default_input_device().and_then(|d| d.name().ok());
        let mut devices = Vec::new();

        if let Ok(input_devs) = host.input_devices() {
            for (idx, dev) in input_devs.enumerate() {
                if let Ok(name) = dev.name() {
                    let is_default = default_name.as_ref() == Some(&name);
                    devices.push(AudioDeviceDescriptor {
                        id: format!("in-{}", idx),
                        name,
                        is_default,
                    });
                }
            }
        }

        if devices.is_empty() {
            devices.push(AudioDeviceDescriptor {
                id: "default-mic".into(),
                name: "Default Microphone / Line In (WASAPI)".into(),
                is_default: true,
            });
        }

        devices
    }

    /// Start streaming incoming PCM into a lock-free queue and writing to a `.wav` file on disk.
    pub fn start_recording(
        &mut self,
        track_id: String,
        track_index: usize,
        monitor_producer: Option<Producer<f32>>,
    ) -> Result<String, String> {
        if self.is_recording.load(Ordering::SeqCst) {
            return Err("Recording session is already active".into());
        }

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .ok_or_else(|| "No default audio input device available".to_string())?;

        let default_config = device
            .default_input_config()
            .map_err(|e| format!("Failed to query default input configuration: {}", e))?;

        let sample_rate = default_config.sample_rate().0;
        let channels = default_config.channels();
        let sample_format = default_config.sample_format();
        let stream_config: StreamConfig = default_config.into();

        // Ensure recordings/ directory exists
        let recordings_dir = std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join("recordings");
        fs::create_dir_all(&recordings_dir).map_err(|e| e.to_string())?;

        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let filename = format!("rec_{}_t{}_{}.wav", track_id, track_index + 1, timestamp);
        let wav_path = recordings_dir.join(&filename);
        let file_path_str = wav_path.to_string_lossy().to_string();

        // 131,072 float buffer (~1.5 seconds of stereo 44.1kHz headroom for disk writer)
        let (producer, mut consumer) = RingBuffer::<f32>::new(131_072);

        let is_recording = Arc::clone(&self.is_recording);
        is_recording.store(true, Ordering::SeqCst);

        let writer_path = wav_path.clone();
        let writer_track_id = track_id.clone();
        let writer_track_index = track_index;
        let writer_is_rec = Arc::clone(&is_recording);

        // Spawn dedicated background file-writer thread
        let handle = std::thread::spawn(move || -> Result<RecordedClipMetadata, String> {
            let spec = hound::WavSpec {
                channels,
                sample_rate,
                bits_per_sample: 32,
                sample_format: hound::SampleFormat::Float,
            };

            let mut writer = hound::WavWriter::create(&writer_path, spec)
                .map_err(|e| format!("Failed to create WAV writer: {}", e))?;

            let mut recorded_samples = Vec::new();

            while writer_is_rec.load(Ordering::SeqCst) || !consumer.is_empty() {
                let mut chunk_count = 0;
                while let Ok(sample) = consumer.pop() {
                    writer
                        .write_sample(sample)
                        .map_err(|e| format!("WAV write error: {}", e))?;
                    recorded_samples.push(sample);
                    chunk_count += 1;
                    if chunk_count > 4096 {
                        break;
                    }
                }

                if chunk_count == 0 {
                    std::thread::sleep(Duration::from_millis(5));
                }
            }

            // Flush and finalize WAV headers
            writer
                .finalize()
                .map_err(|e| format!("Failed to finalize WAV header: {}", e))?;

            // Generate normalized waveform peaks
            let peaks = if channels == 1 {
                let mut stereo_equiv = Vec::with_capacity(recorded_samples.len() * 2);
                for s in &recorded_samples {
                    stereo_equiv.push(*s);
                    stereo_equiv.push(*s);
                }
                generate_waveform_peaks(&stereo_equiv, 64)
            } else {
                generate_waveform_peaks(&recorded_samples, 64)
            };

            let total_frames = recorded_samples.len() / (channels as usize).max(1);
            let duration_seconds = total_frames as f32 / sample_rate as f32;

            Ok(RecordedClipMetadata {
                file_path: writer_path.to_string_lossy().to_string(),
                filename: filename.clone(),
                duration_seconds,
                sample_rate,
                channels,
                waveform_peaks: peaks,
                track_id: writer_track_id,
                track_index: writer_track_index,
            })
        });

        self.writer_handle = Some(handle);
        self.active_track_id = track_id;
        self.active_track_index = track_index;

        let err_fn = |err| {
            log::error!("Audio input stream error: {:?}", err);
        };

        let mut producer_opt = Some(producer);
        let mut monitor_opt = monitor_producer;

        // Real-time safe audio input callback
        let stream = match sample_format {
            SampleFormat::F32 => {
                let mut prod = producer_opt.take().unwrap();
                let mut mon = monitor_opt.take();
                let mon_flag = Arc::clone(&self.is_monitoring);
                let peak_meter = Arc::clone(&self.peak_level);
                device.build_input_stream(
                    &stream_config,
                    move |data: &[f32], _: &cpal::InputCallbackInfo| {
                        let mut max_abs: f32 = 0.0;
                        for &s in data {
                            let abs = s.abs();
                            if abs > max_abs {
                                max_abs = abs;
                            }
                            let _ = prod.push(s);
                            if mon_flag.load(Ordering::Relaxed) {
                                if let Some(ref mut m) = mon {
                                    let _ = m.push(s);
                                }
                            }
                        }
                        peak_meter.store(max_abs.to_bits(), Ordering::Relaxed);
                    },
                    err_fn,
                    None,
                ).map_err(|e| format!("Failed to build F32 input stream: {}", e))?
            }
            SampleFormat::I16 => {
                let mut prod = producer_opt.take().unwrap();
                let mut mon = monitor_opt.take();
                let mon_flag = Arc::clone(&self.is_monitoring);
                let peak_meter = Arc::clone(&self.peak_level);
                device.build_input_stream(
                    &stream_config,
                    move |data: &[i16], _: &cpal::InputCallbackInfo| {
                        let mut max_abs: f32 = 0.0;
                        for &s in data {
                            let f = s as f32 / i16::MAX as f32;
                            let abs = f.abs();
                            if abs > max_abs {
                                max_abs = abs;
                            }
                            let _ = prod.push(f);
                            if mon_flag.load(Ordering::Relaxed) {
                                if let Some(ref mut m) = mon {
                                    let _ = m.push(f);
                                }
                            }
                        }
                        peak_meter.store(max_abs.to_bits(), Ordering::Relaxed);
                    },
                    err_fn,
                    None,
                ).map_err(|e| format!("Failed to build I16 input stream: {}", e))?
            }
            SampleFormat::U16 => {
                let mut prod = producer_opt.take().unwrap();
                let mut mon = monitor_opt.take();
                let mon_flag = Arc::clone(&self.is_monitoring);
                let peak_meter = Arc::clone(&self.peak_level);
                device.build_input_stream(
                    &stream_config,
                    move |data: &[u16], _: &cpal::InputCallbackInfo| {
                        let mut max_abs: f32 = 0.0;
                        for &s in data {
                            let f = (s as f32 / 32768.0) - 1.0;
                            let abs = f.abs();
                            if abs > max_abs {
                                max_abs = abs;
                            }
                            let _ = prod.push(f);
                            if mon_flag.load(Ordering::Relaxed) {
                                if let Some(ref mut m) = mon {
                                    let _ = m.push(f);
                                }
                            }
                        }
                        peak_meter.store(max_abs.to_bits(), Ordering::Relaxed);
                    },
                    err_fn,
                    None,
                ).map_err(|e| format!("Failed to build U16 input stream: {}", e))?
            }
            _ => return Err("Unsupported CPAL input sample format".into()),
        };

        stream
            .play()
            .map_err(|e| format!("Failed to start input stream playback: {}", e))?;

        self.active_stream = Some(stream);
        log::info!("Audio recording stream active: {}", file_path_str);
        Ok(file_path_str)
    }

    /// Stop recording session, finalize the WAV file on disk, and return clip metadata.
    pub fn stop_recording(&mut self) -> Result<RecordedClipMetadata, String> {
        if !self.is_recording.load(Ordering::SeqCst) {
            return Err("No recording session is currently active".into());
        }

        // Signal writer thread to drain and finalize
        self.is_recording.store(false, Ordering::SeqCst);

        // Pause and drop input stream
        if let Some(stream) = self.active_stream.take() {
            let _ = stream.pause();
        }

        // Await background writer thread
        if let Some(handle) = self.writer_handle.take() {
            match handle.join() {
                Ok(res) => res,
                Err(_) => Err("Recorder worker thread panicked".into()),
            }
        } else {
            Err("No active writer thread handle found".into())
        }
    }

    /// Live peak input overload detector.
    pub fn get_peak_level(&self) -> f32 {
        f32::from_bits(self.peak_level.load(Ordering::Relaxed))
    }

    pub fn set_monitoring(&self, enabled: bool) {
        self.is_monitoring.store(enabled, Ordering::SeqCst);
    }
}
