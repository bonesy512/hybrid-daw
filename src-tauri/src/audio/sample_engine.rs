use std::fs::{self, File};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use symphonia::core::audio::AudioBuffer;
use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_NULL};
use symphonia::core::errors::Error as SymphoniaError;
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use uuid::Uuid;

pub const VOICE_POOL_SIZE: usize = 32;

/// Thread-safe immutable audio buffer holding stereo-interleaved 32-bit floating point PCM.
#[derive(Debug, Clone)]
pub struct SampleData {
    pub id: String,
    pub name: String,
    pub sample_rate: u32,
    pub channels: u16,
    pub frames: Arc<[f32]>, // [L0, R0, L1, R1, ...]
}

/// Metadata structure returned to the frontend via Tauri IPC.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SampleMetadata {
    pub id: String,
    pub name: String,
    pub file_path: String,
    pub duration_seconds: f32,
    pub sample_rate: u32,
    pub channels: u16,
    pub waveform_peaks: Vec<f32>,
}

/// File / folder entry for the Sample Browser panel.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserEntry {
    pub name: String,
    pub path: String,
    pub is_directory: bool,
    pub extension: Option<String>,
    pub size_bytes: Option<u64>,
}

/// Real-time safe sample playback voice with linear pitch interpolation.
#[derive(Clone)]
pub struct SamplePlaybackVoice {
    pub sample_id: String,
    pub frames: Option<Arc<[f32]>>,
    pub source_sample_rate: f32,
    pub playback_frame: f64,
    pub channel_gain: f32,
    pub pitch_ratio: f32,
    pub is_active: bool,
    pub channel_index: usize,
}

impl Default for SamplePlaybackVoice {
    fn default() -> Self {
        Self::new()
    }
}

impl SamplePlaybackVoice {
    pub fn new() -> Self {
        Self {
            sample_id: String::new(),
            frames: None,
            source_sample_rate: 44100.0,
            playback_frame: 0.0,
            channel_gain: 1.0,
            pitch_ratio: 1.0,
            is_active: false,
            channel_index: 0,
        }
    }

    #[inline(always)]
    pub fn trigger(
        &mut self,
        frames: Arc<[f32]>,
        source_sample_rate: u32,
        gain: f32,
        pitch_offset_semitones: f32,
        dsp_sample_rate: f32,
        sample_id: String,
        channel_index: usize,
    ) {
        self.sample_id = sample_id;
        self.frames = Some(frames);
        self.source_sample_rate = source_sample_rate as f32;
        self.playback_frame = 0.0;
        self.channel_gain = gain.clamp(0.0, 2.0);
        let semitone_ratio = 2.0_f32.powf(pitch_offset_semitones / 12.0);
        self.pitch_ratio = semitone_ratio * (self.source_sample_rate / dsp_sample_rate);
        self.is_active = true;
        self.channel_index = channel_index;
    }

    #[inline(always)]
    pub fn stop(&mut self) {
        self.is_active = false;
        self.frames = None;
    }

    /// Read next stereo frame (Left, Right). Linear interpolation, zero allocation.
    #[inline(always)]
    pub fn process_frame(&mut self) -> (f32, f32) {
        if !self.is_active {
            return (0.0, 0.0);
        }

        let frames = match &self.frames {
            Some(f) => f,
            None => {
                self.is_active = false;
                return (0.0, 0.0);
            }
        };

        // frames are stereo interleaved: total frames = len / 2
        let total_frames = frames.len() / 2;
        let curr_f = self.playback_frame;

        if curr_f >= (total_frames.saturating_sub(1)) as f64 {
            self.is_active = false;
            self.frames = None;
            return (0.0, 0.0);
        }

        let idx0 = curr_f.floor() as usize;
        let frac = (curr_f - idx0 as f64) as f32;
        let idx1 = (idx0 + 1).min(total_frames.saturating_sub(1));

        // Linear interpolation for stereo channels
        let l0 = frames[idx0 * 2];
        let r0 = frames[idx0 * 2 + 1];
        let l1 = frames[idx1 * 2];
        let r1 = frames[idx1 * 2 + 1];

        let left = (l0 + frac * (l1 - l0)) * self.channel_gain;
        let right = (r0 + frac * (r1 - r0)) * self.channel_gain;

        self.playback_frame += self.pitch_ratio as f64;

        (left, right)
    }
}

/// Pre-allocated pool of 32 sample playback voices with voice-stealing.
pub struct VoicePool {
    voices: Box<[SamplePlaybackVoice; VOICE_POOL_SIZE]>,
}

impl Default for VoicePool {
    fn default() -> Self {
        Self::new()
    }
}

impl VoicePool {
    pub fn new() -> Self {
        let voices: Box<[SamplePlaybackVoice; VOICE_POOL_SIZE]> = {
            let mut vec = Vec::with_capacity(VOICE_POOL_SIZE);
            for _ in 0..VOICE_POOL_SIZE {
                vec.push(SamplePlaybackVoice::new());
            }
            vec.into_boxed_slice()
                .try_into()
                .unwrap_or_else(|_| panic!("voice pool size mismatch"))
        };
        Self { voices }
    }

    /// Allocate or steal a voice and trigger sample playback.
    pub fn trigger_voice(
        &mut self,
        frames: Arc<[f32]>,
        source_sample_rate: u32,
        gain: f32,
        pitch_offset: f32,
        dsp_sample_rate: f32,
        sample_id: String,
        channel_index: usize,
    ) {
        // Find first idle voice
        let mut target_idx = None;
        for (i, v) in self.voices.iter().enumerate() {
            if !v.is_active {
                target_idx = Some(i);
                break;
            }
        }

        // Voice stealing: if all 32 voices are active, steal the one with the furthest playback frame
        let idx = match target_idx {
            Some(i) => i,
            None => {
                let mut oldest_idx = 0;
                let mut max_pos = -1.0;
                for (i, v) in self.voices.iter().enumerate() {
                    if v.playback_frame > max_pos {
                        max_pos = v.playback_frame;
                        oldest_idx = i;
                    }
                }
                oldest_idx
            }
        };

        self.voices[idx].trigger(
            frames,
            source_sample_rate,
            gain,
            pitch_offset,
            dsp_sample_rate,
            sample_id,
            channel_index,
        );
    }

    pub fn stop_all(&mut self) {
        for v in &mut self.voices {
            v.stop();
        }
    }

    #[inline(always)]
    pub fn process_frame(&mut self) -> (f32, f32) {
        let mut mix_l = 0.0;
        let mut mix_r = 0.0;
        for v in &mut self.voices {
            if v.is_active {
                let (l, r) = v.process_frame();
                mix_l += l;
                mix_r += r;
            }
        }
        (mix_l, mix_r)
    }

    #[inline(always)]
    pub fn process_channel_frames(
        &mut self,
        ch_l: &mut [f32],
        ch_r: &mut [f32],
    ) {
        for v in &mut self.voices {
            if v.is_active {
                let (l, r) = v.process_frame();
                let idx = v.channel_index;
                if idx < ch_l.len() && idx < ch_r.len() {
                    ch_l[idx] += l;
                    ch_r[idx] += r;
                }
            }
        }
    }
}

/// Compute 64-point normalized peak waveform overview.
pub fn generate_waveform_peaks(stereo_samples: &[f32], num_points: usize) -> Vec<f32> {
    if stereo_samples.is_empty() {
        return vec![0.0; num_points];
    }
    let total_frames = stereo_samples.len() / 2;
    if total_frames == 0 {
        return vec![0.0; num_points];
    }
    let chunk_size = (total_frames as f32 / num_points as f32).max(1.0);
    let mut peaks = Vec::with_capacity(num_points);

    for p in 0..num_points {
        let start_frame = (p as f32 * chunk_size) as usize;
        let end_frame = ((p + 1) as f32 * chunk_size).min(total_frames as f32) as usize;
        let mut max_val: f32 = 0.0;
        for f in start_frame..end_frame {
            let left = stereo_samples[f * 2].abs();
            let right = stereo_samples[f * 2 + 1].abs();
            let peak = left.max(right);
            if peak > max_val {
                max_val = peak;
            }
        }
        peaks.push(max_val.min(1.0));
    }
    peaks
}

/// Fast WAV decoder using `hound`.
fn decode_with_hound(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let mut reader = hound::WavReader::open(path).map_err(|e| e.to_string())?;
    let spec = reader.spec();
    let sample_rate = spec.sample_rate;
    let channels = spec.channels;

    let mut samples: Vec<f32> = Vec::new();
    match spec.sample_format {
        hound::SampleFormat::Float => {
            for sample in reader.samples::<f32>() {
                samples.push(sample.map_err(|e| e.to_string())?);
            }
        }
        hound::SampleFormat::Int => {
            let max_val = match spec.bits_per_sample {
                8 => 128.0,
                16 => 32768.0,
                24 => 8388608.0,
                32 => 2147483648.0,
                _ => 32768.0,
            };
            for sample in reader.samples::<i32>() {
                let s = sample.map_err(|e| e.to_string())? as f32 / max_val;
                samples.push(s);
            }
        }
    }

    // Convert to stereo interleaved
    let mut stereo_samples = Vec::with_capacity(if channels == 1 { samples.len() * 2 } else { samples.len() });
    if channels == 1 {
        for s in samples {
            stereo_samples.push(s);
            stereo_samples.push(s);
        }
    } else {
        for chunk in samples.chunks(channels as usize) {
            stereo_samples.push(chunk[0]);
            stereo_samples.push(if chunk.len() > 1 { chunk[1] } else { chunk[0] });
        }
    }

    Ok((stereo_samples, sample_rate))
}

/// Universal decoder using `symphonia` (MP3, FLAC, OGG, AIFF, and WAV fallback).
fn decode_with_symphonia(path: &Path) -> Result<(Vec<f32>, u32), String> {
    let src = File::open(path).map_err(|e| e.to_string())?;
    let mss = MediaSourceStream::new(Box::new(src), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        hint.with_extension(ext);
    }

    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();

    let probed = symphonia::default::get_probe()
        .format(&hint, mss, &fmt_opts, &meta_opts)
        .map_err(|e| format!("Unsupported audio format: {}", e))?;

    let mut format = probed.format;
    let track = format
        .tracks()
        .iter()
        .find(|t| t.codec_params.codec != CODEC_TYPE_NULL)
        .ok_or_else(|| "No supported audio tracks found".to_string())?;

    let track_id = track.id;
    let sample_rate = track.codec_params.sample_rate.unwrap_or(44100);

    let dec_opts: DecoderOptions = Default::default();
    let mut decoder = symphonia::default::get_codecs()
        .make(&track.codec_params, &dec_opts)
        .map_err(|e| format!("Failed to create audio decoder: {}", e))?;

    let mut interleaved_samples = Vec::new();

    loop {
        let packet = match format.next_packet() {
            Ok(packet) => packet,
            Err(SymphoniaError::IoError(e)) if e.kind() == std::io::ErrorKind::UnexpectedEof => break,
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(_) => break,
        };

        if packet.track_id() != track_id {
            continue;
        }

        match decoder.decode(&packet) {
            Ok(decoded) => {
                let spec = *decoded.spec();
                let num_frames = decoded.frames();
                let mut sample_buf = AudioBuffer::<f32>::new(decoded.capacity() as u64, spec);
                decoded.convert(&mut sample_buf);

                let planes = sample_buf.planes();
                let num_channels = spec.channels.count();

                if num_channels == 1 {
                    let mono_plane = planes.planes()[0];
                    for &s in mono_plane.iter().take(num_frames) {
                        interleaved_samples.push(s);
                        interleaved_samples.push(s);
                    }
                } else if num_channels >= 2 {
                    let left_plane = planes.planes()[0];
                    let right_plane = planes.planes()[1];
                    for i in 0..num_frames {
                        interleaved_samples.push(left_plane[i]);
                        interleaved_samples.push(right_plane[i]);
                    }
                }
            }
            Err(SymphoniaError::IoError(_)) => break,
            Err(SymphoniaError::DecodeError(_)) => continue,
            Err(SymphoniaError::ResetRequired) => {
                decoder.reset();
                continue;
            }
            Err(_) => break,
        }
    }

    Ok((interleaved_samples, sample_rate))
}

/// Decode an audio file from disk into an immutable `SampleData` and `SampleMetadata`.
pub fn decode_audio_file(file_path: &str) -> Result<(Arc<SampleData>, SampleMetadata), String> {
    let path = Path::new(file_path);
    if !path.exists() {
        return Err(format!("File does not exist: {}", file_path));
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let (stereo_samples, sample_rate) = if ext == "wav" {
        decode_with_hound(path).or_else(|_| decode_with_symphonia(path))?
    } else {
        decode_with_symphonia(path)?
    };

    if stereo_samples.is_empty() {
        return Err("Decoded audio contains 0 samples".into());
    }

    let id = Uuid::new_v4().to_string();
    let name = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Untitled Sample")
        .to_string();

    let total_frames = stereo_samples.len() / 2;
    let duration_seconds = total_frames as f32 / sample_rate as f32;
    let waveform_peaks = generate_waveform_peaks(&stereo_samples, 64);

    let sample_data = Arc::new(SampleData {
        id: id.clone(),
        name: name.clone(),
        sample_rate,
        channels: 2,
        frames: stereo_samples.into(),
    });

    let metadata = SampleMetadata {
        id,
        name,
        file_path: file_path.to_string(),
        duration_seconds,
        sample_rate,
        channels: 2,
        waveform_peaks,
    };

    Ok((sample_data, metadata))
}

/// Helper to generate default factory one-shot samples if none exist on disk.
pub fn ensure_factory_samples() -> Result<PathBuf, String> {
    let app_dir = dirs_fallback_factory_path();
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    }

    let factory_kits = [
        ("808 Kick Punch.wav", generate_synth_kick()),
        ("Trap Clap Crisp.wav", generate_synth_clap()),
        ("909 Snare Fat.wav", generate_synth_snare()),
        ("Closed Hat Metallic.wav", generate_synth_hihat(0.06)),
        ("Open Hat Sizzle.wav", generate_synth_hihat(0.35)),
        ("Perc Rimshot Oak.wav", generate_synth_rim()),
        ("Sub 808 Deep.wav", generate_synth_sub()),
    ];

    for (file_name, pcm_samples) in factory_kits {
        let dest = app_dir.join(file_name);
        if !dest.exists() {
            write_wav_file(&dest, &pcm_samples, 44100)?;
        }
    }

    Ok(app_dir)
}

fn dirs_fallback_factory_path() -> PathBuf {
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("samples")
        .join("factory")
}

fn write_wav_file(path: &Path, mono_samples: &[f32], sample_rate: u32) -> Result<(), String> {
    let spec = hound::WavSpec {
        channels: 1,
        sample_rate,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };
    let mut writer = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;
    for &s in mono_samples {
        let sample_i16 = (s.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer.write_sample(sample_i16).map_err(|e| e.to_string())?;
    }
    writer.finalize().map_err(|e| e.to_string())?;
    Ok(())
}

fn generate_synth_kick() -> Vec<f32> {
    let sample_rate = 44100.0;
    let len = (sample_rate * 0.45) as usize;
    let mut buf = Vec::with_capacity(len);
    let mut phase = 0.0;
    for i in 0..len {
        let t = i as f32 / sample_rate;
        let freq = 48.0 + 130.0 * (-t * 35.0).exp();
        phase += 2.0 * std::f32::consts::PI * freq / sample_rate;
        let env = (-t * 7.0).exp();
        let s = (phase.sin() * env * 1.5).tanh() * 0.9;
        buf.push(s);
    }
    buf
}

fn generate_synth_snare() -> Vec<f32> {
    let sample_rate = 44100.0;
    let len = (sample_rate * 0.3) as usize;
    let mut buf = Vec::with_capacity(len);
    let mut phase = 0.0;
    let mut rng: u32 = 0x5a17_9091;
    for i in 0..len {
        let t = i as f32 / sample_rate;
        phase += 2.0 * std::f32::consts::PI * 180.0 / sample_rate;
        let tone = phase.sin() * (-t * 22.0).exp() * 0.5;

        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        let noise = ((rng as f32 / 2_147_483_648.0) - 1.0) * (-t * 14.0).exp() * 0.6;

        let s = ((tone + noise) * 1.2).clamp(-1.0, 1.0) * 0.85;
        buf.push(s);
    }
    buf
}

fn generate_synth_clap() -> Vec<f32> {
    let sample_rate = 44100.0;
    let len = (sample_rate * 0.35) as usize;
    let mut buf = Vec::with_capacity(len);
    let mut rng: u32 = 0xbeef_cafe;
    for i in 0..len {
        let ms = (i as f32 / sample_rate) * 1000.0;
        let burst = if ms < 36.0 {
            (1.0 - (ms % 12.0) / 12.0) * 0.75
        } else {
            (-(ms - 36.0) * 0.018).exp() * 0.65
        };

        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        let noise = ((rng as f32 / 2_147_483_648.0) - 1.0) * burst;
        buf.push(noise * 0.85);
    }
    buf
}

fn generate_synth_hihat(decay_sec: f32) -> Vec<f32> {
    let sample_rate = 44100.0;
    let len = (sample_rate * decay_sec) as usize;
    let mut buf = Vec::with_capacity(len);
    let mut rng: u32 = 0x9876_5432;
    for i in 0..len {
        let t = i as f32 / sample_rate;
        let env = (-t / (decay_sec * 0.35)).exp();

        rng ^= rng << 13;
        rng ^= rng >> 17;
        rng ^= rng << 5;
        let noise = ((rng as f32 / 2_147_483_648.0) - 1.0) * env * 0.6;
        buf.push(noise);
    }
    buf
}

fn generate_synth_rim() -> Vec<f32> {
    let sample_rate = 44100.0;
    let len = (sample_rate * 0.12) as usize;
    let mut buf = Vec::with_capacity(len);
    let mut phase = 0.0;
    for i in 0..len {
        let t = i as f32 / sample_rate;
        phase += 2.0 * std::f32::consts::PI * 820.0 / sample_rate;
        let env = (-t * 45.0).exp();
        let s = phase.sin() * env * 0.75;
        buf.push(s);
    }
    buf
}

fn generate_synth_sub() -> Vec<f32> {
    let sample_rate = 44100.0;
    let len = (sample_rate * 0.8) as usize;
    let mut buf = Vec::with_capacity(len);
    let mut phase = 0.0;
    for i in 0..len {
        let t = i as f32 / sample_rate;
        phase += 2.0 * std::f32::consts::PI * 40.0 / sample_rate;
        let env = (-t * 2.5).exp();
        let s = (phase.sin() * env * 1.2).tanh() * 0.85;
        buf.push(s);
    }
    buf
}
