use std::f32::consts::PI;
use std::sync::Arc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use rtrb::{Consumer, Producer, RingBuffer};
use serde::{Deserialize, Serialize};

use crate::audio::sample_engine::{SampleData, SamplePlaybackVoice, VoicePool};

pub const MAX_CHANNELS: usize = 8;
pub const STEP_COUNT: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundType {
    Kick,
    Snare,
    HiHat,
    Clap,
}

#[derive(Debug, Clone)]
pub enum AudioCommand {
    Play,
    Stop,
    SetBpm(f64),
    UpdatePattern {
        channel_index: usize,
        steps: [bool; STEP_COUNT],
    },
    TriggerVoice {
        channel_index: usize,
        velocity: f32,
    },
    MidiNoteOn {
        channel: u8,
        note: u8,
        velocity: u8,
    },
    MidiNoteOff {
        channel: u8,
        note: u8,
    },
    AssignChannelSample {
        channel_index: usize,
        sample: Arc<SampleData>,
    },
    TriggerSample {
        channel_index: usize,
        sample_id: String,
        velocity: f32,
        pitch_offset: f32,
    },
    PreviewSample(Arc<SampleData>),
    StopPreview,
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
    channel_samples: [Option<Arc<SampleData>>; MAX_CHANNELS],
    sample_voices: VoicePool,
    preview_voice: SamplePlaybackVoice,
    rng: XorShift32,
    cmd_consumer: Consumer<AudioCommand>,
    midi_consumer: Consumer<AudioCommand>,
}

impl DspProcessor {
    pub fn new(
        sample_rate: f32,
        cmd_consumer: Consumer<AudioCommand>,
        midi_consumer: Consumer<AudioCommand>,
    ) -> Self {
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
            channel_samples: std::array::from_fn(|_| None),
            sample_voices: VoicePool::new(),
            preview_voice: SamplePlaybackVoice::new(),
            rng: XorShift32::new(0xda3_1400),
            cmd_consumer,
            midi_consumer,
        }
    }

    #[inline(always)]
    fn handle_command(&mut self, cmd: AudioCommand) {
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
                self.sample_voices.stop_all();
                self.preview_voice.stop();
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
            AudioCommand::AssignChannelSample {
                channel_index,
                sample,
            } => {
                if channel_index < MAX_CHANNELS {
                    self.channel_samples[channel_index] = Some(sample);
                }
            }
            AudioCommand::TriggerSample {
                channel_index,
                sample_id,
                velocity,
                pitch_offset,
            } => {
                if channel_index < MAX_CHANNELS {
                    if let Some(sample) = &self.channel_samples[channel_index] {
                        self.sample_voices.trigger_voice(
                            Arc::clone(&sample.frames),
                            sample.sample_rate,
                            velocity,
                            pitch_offset,
                            self.sample_rate,
                            sample_id,
                        );
                    } else {
                        self.voices[channel_index].trigger();
                    }
                }
            }
            AudioCommand::TriggerVoice { channel_index, velocity } => {
                if channel_index < MAX_CHANNELS {
                    if let Some(sample) = &self.channel_samples[channel_index] {
                        self.sample_voices.trigger_voice(
                            Arc::clone(&sample.frames),
                            sample.sample_rate,
                            velocity,
                            0.0,
                            self.sample_rate,
                            sample.id.clone(),
                        );
                    } else {
                        self.voices[channel_index].trigger();
                    }
                }
            }
            AudioCommand::MidiNoteOn { channel: _, note, velocity } => {
                // General MIDI percussion key mapping with fallback to channel indexing
                let voice_idx = match note {
                    35 | 36 => 0,       // Bass Drum 1 / Acoustic Bass Drum
                    38 | 40 => 3,       // Acoustic Snare / Electric Snare
                    39 => 1,            // Hand Clap
                    42 | 44 | 46 => 2,  // Closed Hi-Hat / Pedal / Open
                    other => (other as usize) % MAX_CHANNELS,
                };
                if velocity > 0 && voice_idx < MAX_CHANNELS {
                    if let Some(sample) = &self.channel_samples[voice_idx] {
                        let vel = (velocity as f32 / 127.0).clamp(0.0, 1.0);
                        self.sample_voices.trigger_voice(
                            Arc::clone(&sample.frames),
                            sample.sample_rate,
                            vel,
                            0.0,
                            self.sample_rate,
                            sample.id.clone(),
                        );
                    } else {
                        self.voices[voice_idx].trigger();
                    }
                }
            }
            AudioCommand::MidiNoteOff { .. } => {}
            AudioCommand::PreviewSample(sample) => {
                self.preview_voice.trigger(
                    Arc::clone(&sample.frames),
                    sample.sample_rate,
                    1.0,
                    0.0,
                    self.sample_rate,
                    sample.id.clone(),
                );
            }
            AudioCommand::StopPreview => {
                self.preview_voice.stop();
            }
        }
    }

    /// Process incoming commands from the lock-free ringbuffers (UI thread and MIDI thread).
    #[inline(always)]
    fn drain_commands(&mut self) {
        while let Ok(cmd) = self.cmd_consumer.pop() {
            self.handle_command(cmd);
        }
        while let Ok(cmd) = self.midi_consumer.pop() {
            self.handle_command(cmd);
        }
    }

    /// Process a single audio frame (stereo L/R). Real-time safe: zero allocation, lock-free.
    #[inline(always)]
    pub fn process_frame(&mut self) -> (f32, f32) {
        // Check for new commands from UI thread and MIDI controller thread
        self.drain_commands();

        // Advance 16-step sequencer clock if playing
        if self.is_playing {
            if self.sample_counter == 0 {
                // Step boundary reached: trigger active voices (sample voices if assigned, else synth)
                for (idx, voice) in self.voices.iter_mut().enumerate() {
                    if voice.steps[self.current_step] {
                        if let Some(sample) = &self.channel_samples[idx] {
                            self.sample_voices.trigger_voice(
                                Arc::clone(&sample.frames),
                                sample.sample_rate,
                                1.0,
                                0.0,
                                self.sample_rate,
                                sample.id.clone(),
                            );
                        } else {
                            voice.trigger();
                        }
                    }
                }
            }

            self.sample_counter += 1;
            if self.sample_counter >= self.samples_per_step {
                self.sample_counter = 0;
                self.current_step = (self.current_step + 1) % STEP_COUNT;
            }
        }

        // Sum synthetic percussion voices
        let mut mix_left = 0.0;
        let mut mix_right = 0.0;

        for voice in &mut self.voices {
            let syn = voice.process_sample(self.sample_rate, &mut self.rng);
            mix_left += syn;
            mix_right += syn;
        }

        // Sum active sample playback voices (stereo)
        let (s_left, s_right) = self.sample_voices.process_frame();
        mix_left += s_left;
        mix_right += s_right;

        // Sum audition / preview voice
        let (p_left, p_right) = self.preview_voice.process_frame();
        mix_left += p_left;
        mix_right += p_right;

        // Master soft clipping
        let clamped_l = (mix_left * 0.8).clamp(-1.0, 1.0);
        let clamped_r = (mix_right * 0.8).clamp(-1.0, 1.0);
        (clamped_l, clamped_r)
    }
}

pub struct AudioEngine;

impl AudioEngine {
    /// Initialize CPAL audio output stream with dual lock-free command ringbuffers (UI and MIDI).
    pub fn start() -> Result<
        (Producer<AudioCommand>, Producer<AudioCommand>, Stream),
        Box<dyn std::error::Error + Send + Sync>,
    > {
        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .ok_or("No default audio output device available")?;

        let default_config = device.default_output_config()?;
        let sample_rate = default_config.sample_rate().0 as f32;
        let channels = default_config.channels() as usize;
        let sample_format = default_config.sample_format();

        let stream_config: StreamConfig = default_config.into();

        // 256-command lock-free ringbuffer for UI commands, 512 for MIDI hardware events
        let (cmd_producer, cmd_consumer) = RingBuffer::<AudioCommand>::new(256);
        let (midi_producer, midi_consumer) = RingBuffer::<AudioCommand>::new(512);
        let mut dsp = DspProcessor::new(sample_rate, cmd_consumer, midi_consumer);

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
        Ok((cmd_producer, midi_producer, stream))
    }
}
