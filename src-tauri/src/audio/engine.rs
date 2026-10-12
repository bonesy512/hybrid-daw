use std::f32::consts::PI;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use rtrb::{Consumer, Producer, RingBuffer};
use serde::{Deserialize, Serialize};

pub const MAX_CHANNELS: usize = 8;
pub const STEP_COUNT: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundType {
    Kick,
    Snare,
    HiHat,
    Clap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AudioCommand {
    Play,
    Stop,
    SetBpm(f64),
    UpdatePattern {
        channel_index: usize,
        steps: [bool; STEP_COUNT],
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelSyncData {
    pub id: String,
    pub name: String,
    pub steps: Vec<bool>,
}

/// Simple, zero-allocation Xorshift32 PRNG for white noise synthesis.
pub struct XorShift32 {
    state: u32,
}

impl XorShift32 {
    #[inline(always)]
    pub fn new(seed: u32) -> Self {
        Self {
            state: if seed == 0 { 0x5a17_9091 } else { seed },
        }
    }

    #[inline(always)]
    pub fn next_f32(&mut self) -> f32 {
        self.state ^= self.state << 13;
        self.state ^= self.state >> 17;
        self.state ^= self.state << 5;
        (self.state as f32 / 2_147_483_648.0) - 1.0
    }
}

/// Real-time safe voice state. Zero heap allocation during audio playback.
#[derive(Clone, Copy)]
pub struct PercussionVoice {
    pub sound_type: SoundType,
    pub steps: [bool; STEP_COUNT],
    pub is_active: bool,
    pub sample_index: usize,
    pub phase: f32,
}

impl PercussionVoice {
    pub fn new(sound_type: SoundType, steps: [bool; STEP_COUNT]) -> Self {
        Self {
            sound_type,
            steps,
            is_active: false,
            sample_index: 0,
            phase: 0.0,
        }
    }

    #[inline(always)]
    pub fn trigger(&mut self) {
        self.is_active = true;
        self.sample_index = 0;
        self.phase = 0.0;
    }

    #[inline(always)]
    pub fn process_sample(&mut self, sample_rate: f32, rng: &mut XorShift32) -> f32 {
        if !self.is_active {
            return 0.0;
        }

        let t = self.sample_index as f32;
        let sample = match self.sound_type {
            SoundType::Kick => {
                // 808 Sine Pitch-Drop Kick:
                // Pitch sweeps from ~150Hz down to ~45Hz
                let freq = 45.0 + 105.0 * (-t * (40.0 / sample_rate)).exp();
                self.phase += 2.0 * PI * freq / sample_rate;
                if self.phase > 2.0 * PI {
                    self.phase -= 2.0 * PI;
                }

                let env = (-t * (4.5 / sample_rate)).exp();
                let raw = self.phase.sin() * env;
                // Subtle drive / saturation
                let s = (raw * 1.5).tanh() * 0.75;

                // Stop voice when decayed
                if env < 0.001 || self.sample_index > (sample_rate * 0.8) as usize {
                    self.is_active = false;
                }
                s
            }

            SoundType::Snare => {
                // Snare: tonal body + snappy noise burst
                let body_freq = 185.0;
                self.phase += 2.0 * PI * body_freq / sample_rate;
                if self.phase > 2.0 * PI {
                    self.phase -= 2.0 * PI;
                }

                let body_env = (-t * (18.0 / sample_rate)).exp();
                let noise_env = (-t * (8.0 / sample_rate)).exp();

                let body = self.phase.sin() * body_env * 0.45;
                let noise = rng.next_f32() * noise_env * 0.55;

                let s = (body + noise) * 0.7;

                if noise_env < 0.001 || self.sample_index > (sample_rate * 0.5) as usize {
                    self.is_active = false;
                }
                s
            }

            SoundType::Clap => {
                // Handclap: series of quick pre-bursts (at 0, 12, 24ms) then tail decay
                let ms = t / (sample_rate * 0.001);
                let burst_env = if ms < 36.0 {
                    let burst_cycle = (ms % 12.0) / 12.0;
                    (1.0 - burst_cycle).max(0.0) * 0.7
                } else {
                    let tail_ms = ms - 36.0;
                    (-tail_ms * 0.015).exp() * 0.6
                };

                let noise = rng.next_f32();
                let s = noise * burst_env;

                if burst_env < 0.001 || self.sample_index > (sample_rate * 0.6) as usize {
                    self.is_active = false;
                }
                s
            }

            SoundType::HiHat => {
                // Metallic noise burst with very quick exponential decay (40-60ms)
                let env = (-t * (32.0 / sample_rate)).exp();
                let noise = rng.next_f32();
                let s = noise * env * 0.35;

                if env < 0.001 || self.sample_index > (sample_rate * 0.25) as usize {
                    self.is_active = false;
                }
                s
            }
        };

        self.sample_index += 1;
        sample
    }
}

/// Core real-time DSP processor. Owned exclusively by the audio callback thread.
pub struct DspProcessor {
    sample_rate: f32,
    bpm: f64,
    is_playing: bool,
    samples_per_step: usize,
    sample_counter: usize,
    current_step: usize,
    voices: [PercussionVoice; MAX_CHANNELS],
    rng: XorShift32,
    cmd_consumer: Consumer<AudioCommand>,
}

impl DspProcessor {
    pub fn new(sample_rate: f32, cmd_consumer: Consumer<AudioCommand>) -> Self {
        let initial_bpm = 140.0;
        let samples_per_step = ((sample_rate as f64 * 60.0) / (initial_bpm * 4.0)).round() as usize;

        let mut voices = [
            PercussionVoice::new(SoundType::Kick, [false; STEP_COUNT]),
            PercussionVoice::new(SoundType::Clap, [false; STEP_COUNT]),
            PercussionVoice::new(SoundType::HiHat, [false; STEP_COUNT]),
            PercussionVoice::new(SoundType::Snare, [false; STEP_COUNT]),
            PercussionVoice::new(SoundType::Kick, [false; STEP_COUNT]),
            PercussionVoice::new(SoundType::Clap, [false; STEP_COUNT]),
            PercussionVoice::new(SoundType::HiHat, [false; STEP_COUNT]),
            PercussionVoice::new(SoundType::Snare, [false; STEP_COUNT]),
        ];

        // Default initial patterns matching frontend defaults:
        // Kick (0, 8)
        voices[0].steps[0] = true;
        voices[0].steps[8] = true;

        // Clap (4, 12)
        voices[1].steps[4] = true;
        voices[1].steps[12] = true;

        // HiHat (0, 2, 4, 6, 8, 10, 12, 14)
        for i in (0..16).step_by(2) {
            voices[2].steps[i] = true;
        }

        // Snare (12)
        voices[3].steps[12] = true;

        Self {
            sample_rate,
            bpm: initial_bpm,
            is_playing: false,
            samples_per_step,
            sample_counter: 0,
            current_step: 0,
            voices,
            rng: XorShift32::new(0xda3_1400),
            cmd_consumer,
        }
    }

    /// Process incoming commands from the lock-free ringbuffer.
    #[inline(always)]
    fn drain_commands(&mut self) {
        while let Ok(cmd) = self.cmd_consumer.pop() {
            match cmd {
                AudioCommand::Play => {
                    self.is_playing = true;
                }
                AudioCommand::Stop => {
                    self.is_playing = false;
                    self.current_step = 0;
                    self.sample_counter = 0;
                    for voice in &mut self.voices {
                        voice.is_active = false;
                    }
                }
                AudioCommand::SetBpm(bpm) => {
                    let sanitized = bpm.clamp(20.0, 999.0);
                    self.bpm = sanitized;
                    self.samples_per_step =
                        ((self.sample_rate as f64 * 60.0) / (sanitized * 4.0)).round() as usize;
                }
                AudioCommand::UpdatePattern {
                    channel_index,
                    steps,
                } => {
                    if channel_index < MAX_CHANNELS {
                        self.voices[channel_index].steps = steps;
                    }
                }
            }
        }
    }

    /// Process a single audio frame (stereo L/R). Real-time safe: zero allocation, lock-free.
    #[inline(always)]
    pub fn process_frame(&mut self) -> (f32, f32) {
        // Check for new commands from UI thread
        self.drain_commands();

        // Advance 16-step sequencer clock if playing
        if self.is_playing {
            if self.sample_counter == 0 {
                // Step boundary reached: trigger voices with active step
                for voice in &mut self.voices {
                    if voice.steps[self.current_step] {
                        voice.trigger();
                    }
                }
            }

            self.sample_counter += 1;
            if self.sample_counter >= self.samples_per_step {
                self.sample_counter = 0;
                self.current_step = (self.current_step + 1) % STEP_COUNT;
            }
        }

        // Sum active percussion voices
        let mut mix = 0.0;
        for voice in &mut self.voices {
            mix += voice.process_sample(self.sample_rate, &mut self.rng);
        }

        // Master soft clipping
        let clamped = (mix * 0.8).clamp(-1.0, 1.0);
        (clamped, clamped)
    }
}

pub struct AudioEngine;

impl AudioEngine {
    /// Initialize CPAL audio output stream with an rtrb lock-free command producer.
    pub fn start() -> Result<(Producer<AudioCommand>, Stream), Box<dyn std::error::Error + Send + Sync>> {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or("No default audio output device available")?;

        let default_config = device.default_output_config()?;
        let sample_rate = default_config.sample_rate().0 as f32;
        let channels = default_config.channels() as usize;
        let sample_format = default_config.sample_format();

        let stream_config: StreamConfig = default_config.into();

        // 256-command lock-free ringbuffer
        let (producer, consumer) = RingBuffer::<AudioCommand>::new(256);
        let mut dsp = DspProcessor::new(sample_rate, consumer);

        let err_fn = |err| {
            log::error!("CPAL audio stream error: {:?}", err);
        };

        let stream = match sample_format {
            SampleFormat::F32 => device.build_output_stream(
                &stream_config,
                move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                    for frame in data.chunks_mut(channels) {
                        let (left, right) = dsp.process_frame();
                        if frame.len() >= 2 {
                            frame[0] = left;
                            frame[1] = right;
                            for extra in &mut frame[2..] {
                                *extra = 0.0;
                            }
                        } else if !frame.is_empty() {
                            frame[0] = (left + right) * 0.5;
                        }
                    }
                },
                err_fn,
                None,
            )?,
            SampleFormat::I16 => device.build_output_stream(
                &stream_config,
                move |data: &mut [i16], _: &cpal::OutputCallbackInfo| {
                    for frame in data.chunks_mut(channels) {
                        let (left, right) = dsp.process_frame();
                        let l_i16 = (left * i16::MAX as f32) as i16;
                        let r_i16 = (right * i16::MAX as f32) as i16;
                        if frame.len() >= 2 {
                            frame[0] = l_i16;
                            frame[1] = r_i16;
                            for extra in &mut frame[2..] {
                                *extra = 0;
                            }
                        } else if !frame.is_empty() {
                            frame[0] = ((left + right) * 0.5 * i16::MAX as f32) as i16;
                        }
                    }
                },
                err_fn,
                None,
            )?,
            SampleFormat::U16 => device.build_output_stream(
                &stream_config,
                move |data: &mut [u16], _: &cpal::OutputCallbackInfo| {
                    for frame in data.chunks_mut(channels) {
                        let (left, right) = dsp.process_frame();
                        let l_u16 = ((left + 1.0) * 0.5 * u16::MAX as f32) as u16;
                        let r_u16 = ((right + 1.0) * 0.5 * u16::MAX as f32) as u16;
                        if frame.len() >= 2 {
                            frame[0] = l_u16;
                            frame[1] = r_u16;
                            for extra in &mut frame[2..] {
                                *extra = 32768;
                            }
                        } else if !frame.is_empty() {
                            frame[0] = (((left + right) * 0.5 + 1.0) * 0.5 * u16::MAX as f32) as u16;
                        }
                    }
                },
                err_fn,
                None,
            )?,
            _ => return Err("Unsupported CPAL sample format".into()),
        };

        stream.play()?;
        Ok((producer, stream))
    }
}
