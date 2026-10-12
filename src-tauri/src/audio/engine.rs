use std::f32::consts::PI;
use std::sync::atomic::AtomicU32;
use std::sync::Arc;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{SampleFormat, Stream, StreamConfig};
use rtrb::{Consumer, Producer, RingBuffer};
use serde::{Deserialize, Serialize};

use crate::audio::compressor::{Compressor, CompressorParams};
use crate::audio::equalizer::{Equalizer, EqualizerParams, SPECTRUM_BINS};
use crate::audio::sample_engine::{SampleData, SamplePlaybackVoice, VoicePool};
use crate::audio::synth::{PolySynth, SynthParams};

pub const MAX_CHANNELS: usize = 8;
pub const STEP_COUNT: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoundType {
    Kick,
    Snare,
    HiHat,
    Clap,
}

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
    SetMonitorConsumer(Option<Consumer<f32>>),
    SetMonitorGain(f32),
    SetCompressorParams {
        track_index: usize,
        params: CompressorParams,
    },
    SetEqualizerParams {
        track_index: usize,
        params: EqualizerParams,
    },
    SetSynthParams {
        track_index: usize,
        params: SynthParams,
    },
    SetSynthMorph {
        track_index: usize,
        x: f32,
        y: f32,
    },
    SynthNoteOn {
        track_index: usize,
        note: u8,
        velocity: f32,
    },
    SynthNoteOff {
        track_index: usize,
        note: u8,
    },
    SynthAllNotesOff {
        track_index: usize,
    },
}

impl std::fmt::Debug for AudioCommand {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AudioCommand::Play => write!(f, "Play"),
            AudioCommand::Stop => write!(f, "Stop"),
            AudioCommand::SetBpm(bpm) => write!(f, "SetBpm({})", bpm),
            AudioCommand::UpdatePattern { channel_index, .. } => {
                write!(f, "UpdatePattern(ch: {})", channel_index)
            }
            AudioCommand::TriggerVoice { channel_index, velocity } => {
                write!(f, "TriggerVoice(ch: {}, vel: {})", channel_index, velocity)
            }
            AudioCommand::MidiNoteOn { note, velocity, .. } => {
                write!(f, "MidiNoteOn(note: {}, vel: {})", note, velocity)
            }
            AudioCommand::MidiNoteOff { note, .. } => write!(f, "MidiNoteOff({})", note),
            AudioCommand::AssignChannelSample { channel_index, .. } => {
                write!(f, "AssignChannelSample(ch: {})", channel_index)
            }
            AudioCommand::TriggerSample { channel_index, .. } => {
                write!(f, "TriggerSample(ch: {})", channel_index)
            }
            AudioCommand::PreviewSample(_) => write!(f, "PreviewSample"),
            AudioCommand::StopPreview => write!(f, "StopPreview"),
            AudioCommand::SetMonitorConsumer(_) => write!(f, "SetMonitorConsumer"),
            AudioCommand::SetMonitorGain(g) => write!(f, "SetMonitorGain({})", g),
            AudioCommand::SetCompressorParams { track_index, .. } => {
                write!(f, "SetCompressorParams(track: {})", track_index)
            }
            AudioCommand::SetEqualizerParams { track_index, .. } => {
                write!(f, "SetEqualizerParams(track: {})", track_index)
            }
            AudioCommand::SetSynthParams { track_index, .. } => {
                write!(f, "SetSynthParams(track: {})", track_index)
            }
            AudioCommand::SetSynthMorph { track_index, x, y } => {
                write!(f, "SetSynthMorph(track: {}, x: {}, y: {})", track_index, x, y)
            }
            AudioCommand::SynthNoteOn { track_index, note, velocity } => {
                write!(f, "SynthNoteOn(track: {}, note: {}, vel: {})", track_index, note, velocity)
            }
            AudioCommand::SynthNoteOff { track_index, note } => {
                write!(f, "SynthNoteOff(track: {}, note: {})", track_index, note)
            }
            AudioCommand::SynthAllNotesOff { track_index } => {
                write!(f, "SynthAllNotesOff(track: {})", track_index)
            }
        }
    }
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
    voices: Box<[PercussionVoice; MAX_CHANNELS]>,
    channel_samples: Box<[Option<Arc<SampleData>>; MAX_CHANNELS]>,
    sample_voices: Box<VoicePool>,
    preview_voice: Box<SamplePlaybackVoice>,
    channel_equalizers: Box<[Equalizer; MAX_CHANNELS]>,
    master_equalizer: Box<Equalizer>,
    channel_compressors: Box<[Compressor; MAX_CHANNELS]>,
    master_compressor: Box<Compressor>,
    channel_synths: Box<[PolySynth; MAX_CHANNELS]>,
    rng: XorShift32,
    cmd_consumer: Consumer<AudioCommand>,
    midi_consumer: Consumer<AudioCommand>,
    monitor_consumer: Option<Consumer<f32>>,
    monitor_gain: f32,
}

impl DspProcessor {
    pub fn new(
        sample_rate: f32,
        cmd_consumer: Consumer<AudioCommand>,
        midi_consumer: Consumer<AudioCommand>,
        meter_atomics: &[Arc<AtomicU32>; MAX_CHANNELS + 1],
        spectrum_atomics: &[Arc<[AtomicU32; SPECTRUM_BINS]>; MAX_CHANNELS + 1],
        synth_voice_atomics: &[Arc<AtomicU32>; MAX_CHANNELS],
    ) -> Self {
        let initial_bpm = 140.0;
        let samples_per_step = ((sample_rate as f64 * 60.0) / (initial_bpm * 4.0)).round() as usize;

        let voices: Box<[PercussionVoice; MAX_CHANNELS]> = {
            let mut vec = Vec::with_capacity(MAX_CHANNELS);
            vec.push(PercussionVoice::new(SoundType::Kick, [false; STEP_COUNT]));
            vec.push(PercussionVoice::new(SoundType::Clap, [false; STEP_COUNT]));
            vec.push(PercussionVoice::new(SoundType::HiHat, [false; STEP_COUNT]));
            vec.push(PercussionVoice::new(SoundType::Snare, [false; STEP_COUNT]));
            vec.push(PercussionVoice::new(SoundType::Kick, [false; STEP_COUNT]));
            vec.push(PercussionVoice::new(SoundType::Clap, [false; STEP_COUNT]));
            vec.push(PercussionVoice::new(SoundType::HiHat, [false; STEP_COUNT]));
            vec.push(PercussionVoice::new(SoundType::Snare, [false; STEP_COUNT]));
            vec.into_boxed_slice()
                .try_into()
                .unwrap_or_else(|_| panic!("voices size mismatch"))
        };

        let channel_equalizers: Box<[Equalizer; MAX_CHANNELS]> = {
            let mut vec = Vec::with_capacity(MAX_CHANNELS);
            for i in 0..MAX_CHANNELS {
                vec.push(Equalizer::new_with_spectrum(sample_rate, Arc::clone(&spectrum_atomics[i])));
            }
            vec.into_boxed_slice()
                .try_into()
                .unwrap_or_else(|_| panic!("channel equalizers size mismatch"))
        };
        let master_equalizer = Box::new(Equalizer::new_with_spectrum(
            sample_rate,
            Arc::clone(&spectrum_atomics[MAX_CHANNELS]),
        ));

        let channel_compressors: Box<[Compressor; MAX_CHANNELS]> = {
            let mut vec = Vec::with_capacity(MAX_CHANNELS);
            for i in 0..MAX_CHANNELS {
                vec.push(Compressor::new_with_meter(sample_rate, Arc::clone(&meter_atomics[i])));
            }
            vec.into_boxed_slice()
                .try_into()
                .unwrap_or_else(|_| panic!("channel compressors size mismatch"))
        };
        let master_compressor = Box::new(Compressor::new_with_meter(
            sample_rate,
            Arc::clone(&meter_atomics[MAX_CHANNELS]),
        ));

        let channel_synths: Box<[PolySynth; MAX_CHANNELS]> = {
            let mut vec = Vec::with_capacity(MAX_CHANNELS);
            for i in 0..MAX_CHANNELS {
                vec.push(PolySynth::new_with_meter(sample_rate, Arc::clone(&synth_voice_atomics[i])));
            }
            vec.into_boxed_slice()
                .try_into()
                .unwrap_or_else(|_| panic!("channel synths size mismatch"))
        };

        let channel_samples: Box<[Option<Arc<SampleData>>; MAX_CHANNELS]> = {
            let mut vec = Vec::with_capacity(MAX_CHANNELS);
            for _ in 0..MAX_CHANNELS {
                vec.push(None);
            }
            vec.into_boxed_slice()
                .try_into()
                .unwrap_or_else(|_| panic!("channel samples size mismatch"))
        };

        Self {
            sample_rate,
            bpm: initial_bpm,
            is_playing: false,
            samples_per_step,
            sample_counter: 0,
            current_step: 0,
            voices,
            channel_samples,
            sample_voices: Box::new(VoicePool::new()),
            preview_voice: Box::new(SamplePlaybackVoice::new()),
            channel_equalizers,
            master_equalizer,
            channel_compressors,
            master_compressor,
            channel_synths,
            rng: XorShift32::new(0xda3_1400),
            cmd_consumer,
            midi_consumer,
            monitor_consumer: None,
            monitor_gain: 1.0,
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
                for synth in &mut self.channel_synths {
                    synth.all_notes_off();
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
                            channel_index,
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
                            channel_index,
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
                    let vel = (velocity as f32 / 127.0).clamp(0.0, 1.0);
                    self.channel_synths[voice_idx].note_on(note, vel);
                    if let Some(sample) = &self.channel_samples[voice_idx] {
                        self.sample_voices.trigger_voice(
                            Arc::clone(&sample.frames),
                            sample.sample_rate,
                            vel,
                            0.0,
                            self.sample_rate,
                            sample.id.clone(),
                            voice_idx,
                        );
                    } else {
                        self.voices[voice_idx].trigger();
                    }
                }
            }
            AudioCommand::MidiNoteOff { channel: _, note } => {
                let voice_idx = match note {
                    35 | 36 => 0,
                    38 | 40 => 3,
                    39 => 1,
                    42 | 44 | 46 => 2,
                    other => (other as usize) % MAX_CHANNELS,
                };
                if voice_idx < MAX_CHANNELS {
                    self.channel_synths[voice_idx].note_off(note);
                }
            }
            AudioCommand::PreviewSample(sample) => {
                self.preview_voice.trigger(
                    Arc::clone(&sample.frames),
                    sample.sample_rate,
                    1.0,
                    0.0,
                    self.sample_rate,
                    sample.id.clone(),
                    0,
                );
            }
            AudioCommand::StopPreview => {
                self.preview_voice.stop();
            }
            AudioCommand::SetMonitorConsumer(consumer) => {
                self.monitor_consumer = consumer;
            }
            AudioCommand::SetMonitorGain(gain) => {
                self.monitor_gain = gain.clamp(0.0, 4.0);
            }
            AudioCommand::SetCompressorParams { track_index, params } => {
                if track_index < MAX_CHANNELS {
                    self.channel_compressors[track_index].set_params(params);
                } else if track_index == MAX_CHANNELS {
                    self.master_compressor.set_params(params);
                }
            }
            AudioCommand::SetEqualizerParams { track_index, params } => {
                if track_index < MAX_CHANNELS {
                    self.channel_equalizers[track_index].set_params(params);
                } else if track_index == MAX_CHANNELS {
                    self.master_equalizer.set_params(params);
                }
            }
            AudioCommand::SetSynthParams { track_index, params } => {
                if track_index < MAX_CHANNELS {
                    self.channel_synths[track_index].set_params(params);
                }
            }
            AudioCommand::SetSynthMorph { track_index, x, y } => {
                if track_index < MAX_CHANNELS {
                    self.channel_synths[track_index].set_morph(x, y);
                }
            }
            AudioCommand::SynthNoteOn { track_index, note, velocity } => {
                if track_index < MAX_CHANNELS {
                    self.channel_synths[track_index].note_on(note, velocity);
                }
            }
            AudioCommand::SynthNoteOff { track_index, note } => {
                if track_index < MAX_CHANNELS {
                    self.channel_synths[track_index].note_off(note);
                }
            }
            AudioCommand::SynthAllNotesOff { track_index } => {
                if track_index < MAX_CHANNELS {
                    self.channel_synths[track_index].all_notes_off();
                }
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
                                idx,
                            );
                        } else {
                            voice.trigger();
                            self.channel_synths[idx].note_on(60, 0.85);
                        }
                    } else {
                        self.channel_synths[idx].note_off(60);
                    }
                }
            }

            self.sample_counter += 1;
            if self.sample_counter >= self.samples_per_step {
                self.sample_counter = 0;
                self.current_step = (self.current_step + 1) % STEP_COUNT;
            }
        }

        // Sum synthetic percussion voices + channel samples into per-channel buffers
        let mut ch_mix_l = [0.0f32; MAX_CHANNELS];
        let mut ch_mix_r = [0.0f32; MAX_CHANNELS];

        for idx in 0..MAX_CHANNELS {
            let syn = self.voices[idx].process_sample(self.sample_rate, &mut self.rng);
            ch_mix_l[idx] += syn;
            ch_mix_r[idx] += syn;

            let (synth_l, synth_r) = self.channel_synths[idx].process_frame();
            ch_mix_l[idx] += synth_l;
            ch_mix_r[idx] += synth_r;
        }

        self.sample_voices.process_channel_frames(&mut ch_mix_l, &mut ch_mix_r);

        // Process each channel through 8-band EQ then stereo compressor and sum
        let mut mix_left = 0.0;
        let mut mix_right = 0.0;

        for idx in 0..MAX_CHANNELS {
            let (eq_l, eq_r) = self.channel_equalizers[idx].process_frame(ch_mix_l[idx], ch_mix_r[idx]);
            let (c_l, c_r) = self.channel_compressors[idx].process_frame(eq_l, eq_r);
            mix_left += c_l;
            mix_right += c_r;
        }

        // Sum audition / preview voice
        let (p_left, p_right) = self.preview_voice.process_frame();
        mix_left += p_left;
        mix_right += p_right;

        // Sum live software input monitoring
        if let Some(ref mut mon) = self.monitor_consumer {
            if let Ok(mon_s) = mon.pop() {
                let mon_val = mon_s * self.monitor_gain;
                mix_left += mon_val;
                mix_right += mon_val;
            }
        }

        // Process full stereo mix through modeled master bus 8-band EQ then compressor
        let (m_eq_l, m_eq_r) = self.master_equalizer.process_frame(mix_left, mix_right);
        let (master_l, master_r) = self.master_compressor.process_frame(m_eq_l, m_eq_r);

        // Master soft clipping
        let clamped_l = (master_l * 0.8).clamp(-1.0, 1.0);
        let clamped_r = (master_r * 0.8).clamp(-1.0, 1.0);
        (clamped_l, clamped_r)
    }
}

pub struct AudioEngine;

impl AudioEngine {
    /// Initialize CPAL audio output stream with dual lock-free command ringbuffers (UI and MIDI).
    pub fn start(
        meter_atomics: [Arc<AtomicU32>; MAX_CHANNELS + 1],
        spectrum_atomics: [Arc<[AtomicU32; SPECTRUM_BINS]>; MAX_CHANNELS + 1],
        synth_voice_atomics: [Arc<AtomicU32>; MAX_CHANNELS],
    ) -> Result<
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
        let mut dsp = Box::new(DspProcessor::new(
            sample_rate,
            cmd_consumer,
            midi_consumer,
            &meter_atomics,
            &spectrum_atomics,
            &synth_voice_atomics,
        ));

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
