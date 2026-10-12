use std::f32::consts::PI;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};

pub const POLYPHONY_VOICES: usize = 16;
pub const MAX_UNISON: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum OscWaveform {
    Sine,
    Triangle,
    Sawtooth,
    Pulse,
    WhiteNoise,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OscParams {
    pub waveform: OscWaveform,
    pub coarse_tune: i32,    // -24 to +24 semitones
    pub fine_tune: f32,      // -100 to +100 cents
    pub pulse_width: f32,    // 0.05 to 0.95
    pub volume: f32,         // 0.0 to 1.0
    pub pan: f32,            // -1.0 to 1.0
    pub unison_voices: u8,   // 1 to 4
    pub unison_detune: f32,  // 0.0 to 1.0
    pub is_enabled: bool,
}

impl Default for OscParams {
    fn default() -> Self {
        Self {
            waveform: OscWaveform::Sawtooth,
            coarse_tune: 0,
            fine_tune: 0.0,
            pulse_width: 0.5,
            volume: 0.75,
            pan: 0.0,
            unison_voices: 1,
            unison_detune: 0.15,
            is_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AhdsrParams {
    pub attack_ms: f32,      // 0.5 to 4000.0 ms
    pub hold_ms: f32,        // 0.0 to 2000.0 ms
    pub decay_ms: f32,       // 5.0 to 6000.0 ms
    pub sustain_level: f32,  // 0.0 to 1.0
    pub release_ms: f32,     // 5.0 to 8000.0 ms
}

impl Default for AhdsrParams {
    fn default() -> Self {
        Self {
            attack_ms: 10.0,
            hold_ms: 0.0,
            decay_ms: 250.0,
            sustain_level: 0.7,
            release_ms: 300.0,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FilterMode {
    Lowpass12,
    Lowpass24,
    Highpass12,
    Highpass24,
    Bandpass,
    Notch,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilterParams {
    pub mode: FilterMode,
    pub cutoff_hz: f32,      // 20.0 to 20000.0 Hz
    pub resonance: f32,      // 0.0 to 0.98
    pub drive: f32,          // 0.0 to 1.0
    pub env2_amount: f32,    // -1.0 to 1.0
    pub is_enabled: bool,
}

impl Default for FilterParams {
    fn default() -> Self {
        Self {
            mode: FilterMode::Lowpass24,
            cutoff_hz: 2400.0,
            resonance: 0.35,
            drive: 0.1,
            env2_amount: 0.45,
            is_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum LfoWaveform {
    Sine,
    Triangle,
    Sawtooth,
    Square,
    SampleAndHold,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LfoParams {
    pub waveform: LfoWaveform,
    pub rate_hz: f32,        // 0.05 to 30.0 Hz
    pub depth_cutoff: f32,   // -1.0 to 1.0
    pub depth_pitch: f32,    // -1.0 to 1.0
    pub depth_pwm: f32,      // -1.0 to 1.0
    pub is_enabled: bool,
}

impl Default for LfoParams {
    fn default() -> Self {
        Self {
            waveform: LfoWaveform::Sine,
            rate_hz: 2.5,
            depth_cutoff: 0.2,
            depth_pitch: 0.0,
            depth_pwm: 0.15,
            is_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthSnapshot {
    pub name: String,
    pub osc_a: OscParams,
    pub osc_b: OscParams,
    pub filter: FilterParams,
    pub env1: AhdsrParams,
    pub env2: AhdsrParams,
    pub lfo: LfoParams,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SynthParams {
    pub osc_a: OscParams,
    pub osc_b: OscParams,
    pub filter: FilterParams,
    pub env1: AhdsrParams,
    pub env2: AhdsrParams,
    pub lfo: LfoParams,
    pub master_volume: f32,  // 0.0 to 1.0
    pub morph_x: f32,        // 0.0 to 1.0
    pub morph_y: f32,        // 0.0 to 1.0
    pub snapshots: [SynthSnapshot; 8],
}

impl Default for SynthParams {
    fn default() -> Self {
        let osc_a_default = OscParams {
            waveform: OscWaveform::Sawtooth,
            coarse_tune: 0,
            fine_tune: 0.0,
            pulse_width: 0.5,
            volume: 0.75,
            pan: -0.2,
            unison_voices: 2,
            unison_detune: 0.12,
            is_enabled: true,
        };

        let osc_b_default = OscParams {
            waveform: OscWaveform::Pulse,
            coarse_tune: 7, // Fifth above
            fine_tune: 5.0,
            pulse_width: 0.4,
            volume: 0.55,
            pan: 0.2,
            unison_voices: 2,
            unison_detune: 0.15,
            is_enabled: true,
        };

        let filter_default = FilterParams::default();
        let env1_default = AhdsrParams::default();
        let env2_default = AhdsrParams {
            attack_ms: 15.0,
            hold_ms: 0.0,
            decay_ms: 350.0,
            sustain_level: 0.2,
            release_ms: 250.0,
        };
        let lfo_default = LfoParams::default();

        // 8 Snapshot nodes on the perimeter of the Transform Pad
        let snapshot_names = [
            "1: PURE SAW",
            "2: ACID BITE",
            "3: SUB REZ",
            "4: PULSE PWM",
            "5: LUSH PAD",
            "6: PLUCK BELL",
            "7: GLIDE LEAD",
            "8: RETRO NOISE",
        ];

        let snapshots = std::array::from_fn(|i| {
            let mut snap_osc_a = osc_a_default.clone();
            let mut snap_osc_b = osc_b_default.clone();
            let mut snap_flt = filter_default.clone();
            let mut snap_env1 = env1_default.clone();
            let mut snap_env2 = env2_default.clone();

            match i {
                0 => {
                    // 1: PURE SAW (Top-Left)
                    snap_osc_a.waveform = OscWaveform::Sawtooth;
                    snap_osc_b.is_enabled = false;
                    snap_flt.cutoff_hz = 12000.0;
                    snap_flt.resonance = 0.1;
                }
                1 => {
                    // 2: ACID BITE (Top-Mid)
                    snap_osc_a.waveform = OscWaveform::Sawtooth;
                    snap_flt.cutoff_hz = 900.0;
                    snap_flt.resonance = 0.85;
                    snap_flt.drive = 0.6;
                    snap_flt.env2_amount = 0.8;
                }
                2 => {
                    // 3: SUB REZ (Top-Right)
                    snap_osc_a.waveform = OscWaveform::Sine;
                    snap_osc_b.waveform = OscWaveform::Triangle;
                    snap_osc_b.coarse_tune = -12;
                    snap_flt.cutoff_hz = 450.0;
                    snap_flt.resonance = 0.4;
                }
                3 => {
                    // 4: PULSE PWM (Mid-Right)
                    snap_osc_a.waveform = OscWaveform::Pulse;
                    snap_osc_a.pulse_width = 0.2;
                    snap_osc_b.waveform = OscWaveform::Pulse;
                    snap_osc_b.pulse_width = 0.7;
                    snap_flt.cutoff_hz = 3200.0;
                }
                4 => {
                    // 5: LUSH PAD (Bottom-Right)
                    snap_osc_a.unison_voices = 4;
                    snap_osc_a.unison_detune = 0.35;
                    snap_osc_b.unison_voices = 4;
                    snap_osc_b.unison_detune = 0.40;
                    snap_env1.attack_ms = 450.0;
                    snap_env1.release_ms = 1200.0;
                    snap_flt.cutoff_hz = 1800.0;
                }
                5 => {
                    // 6: PLUCK BELL (Bottom-Mid)
                    snap_osc_a.waveform = OscWaveform::Sine;
                    snap_osc_b.waveform = OscWaveform::Triangle;
                    snap_osc_b.coarse_tune = 19; // Octave + Fifth
                    snap_env1.decay_ms = 180.0;
                    snap_env1.sustain_level = 0.0;
                    snap_env2.decay_ms = 120.0;
                    snap_env2.sustain_level = 0.0;
                    snap_flt.env2_amount = 0.9;
                }
                6 => {
                    // 7: GLIDE LEAD (Bottom-Left)
                    snap_osc_a.waveform = OscWaveform::Sawtooth;
                    snap_osc_b.waveform = OscWaveform::Pulse;
                    snap_flt.cutoff_hz = 6500.0;
                    snap_flt.drive = 0.3;
                }
                _ => {
                    // 8: RETRO NOISE (Mid-Left)
                    snap_osc_a.waveform = OscWaveform::Pulse;
                    snap_osc_b.waveform = OscWaveform::WhiteNoise;
                    snap_osc_b.volume = 0.25;
                    snap_flt.cutoff_hz = 4000.0;
                    snap_flt.resonance = 0.6;
                }
            }

            SynthSnapshot {
                name: snapshot_names[i].to_string(),
                osc_a: snap_osc_a,
                osc_b: snap_osc_b,
                filter: snap_flt,
                env1: snap_env1,
                env2: snap_env2,
                lfo: lfo_default.clone(),
            }
        });

        Self {
            osc_a: osc_a_default,
            osc_b: osc_b_default,
            filter: filter_default,
            env1: env1_default,
            env2: env2_default,
            lfo: lfo_default,
            master_volume: 0.8,
            morph_x: 0.0,
            morph_y: 0.0,
            snapshots,
        }
    }
}

// ── ANDREW SIMPER TRAPEZOIDAL SVF (STATE VARIABLE FILTER) ──
#[derive(Clone, Copy, Default)]
pub struct StateVariableFilter {
    s1: f32,
    s2: f32,
    s1_stage2: f32,
    s2_stage2: f32,
}

impl StateVariableFilter {
    #[inline(always)]
    pub fn process(&mut self, input: f32, cutoff_hz: f32, resonance: f32, mode: FilterMode, drive: f32, sample_rate: f32) -> f32 {
        let sr = sample_rate.max(8000.0);
        let f0 = cutoff_hz.clamp(20.0, sr * 0.495);
        let r = resonance.clamp(0.0, 0.98);

        // Optional drive soft saturation
        let x = if drive > 0.01 {
            let driven = input * (1.0 + drive * 3.5);
            driven / (1.0 + driven.abs())
        } else {
            input
        };

        // Trapezoidal integration tuning
        let g = (PI * f0 / sr).tan();
        let k = 2.0 * (1.0 - r);
        let a1 = 1.0 / (1.0 + g * (g + k));
        let a2 = g * a1;
        let a3 = g * a2;

        let v3 = x - self.s2;
        let v1 = a1 * self.s1 + a2 * v3;
        let v2 = self.s2 + a2 * self.s1 + a3 * v3;
        self.s1 = 2.0 * v1 - self.s1;
        self.s2 = 2.0 * v2 - self.s2;

        // Anti-denormal flush
        if self.s1.abs() < 1e-18 { self.s1 = 0.0; }
        if self.s2.abs() < 1e-18 { self.s2 = 0.0; }

        let out1 = match mode {
            FilterMode::Lowpass12 | FilterMode::Lowpass24 => v2,
            FilterMode::Highpass12 | FilterMode::Highpass24 => x - k * v1 - v2,
            FilterMode::Bandpass => v1,
            FilterMode::Notch => x - k * v1,
        };

        // 24 dB/octave mode cascades a second identical SVF stage
        if matches!(mode, FilterMode::Lowpass24 | FilterMode::Highpass24) {
            let v3_2 = out1 - self.s2_stage2;
            let v1_2 = a1 * self.s1_stage2 + a2 * v3_2;
            let v2_2 = self.s2_stage2 + a2 * self.s1_stage2 + a3 * v3_2;
            self.s1_stage2 = 2.0 * v1_2 - self.s1_stage2;
            self.s2_stage2 = 2.0 * v2_2 - self.s2_stage2;

            if self.s1_stage2.abs() < 1e-18 { self.s1_stage2 = 0.0; }
            if self.s2_stage2.abs() < 1e-18 { self.s2_stage2 = 0.0; }

            match mode {
                FilterMode::Lowpass24 => v2_2,
                FilterMode::Highpass24 => out1 - k * v1_2 - v2_2,
                _ => out1,
            }
        } else {
            out1
        }
    }

    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
        self.s1_stage2 = 0.0;
        self.s2_stage2 = 0.0;
    }
}

// ── AHDSR ENVELOPE GENERATOR ──
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum EnvStage {
    Idle,
    Attack,
    Hold,
    Decay,
    Sustain,
    Release,
}

#[derive(Clone, Copy)]
pub struct AhdsrEnvelope {
    pub stage: EnvStage,
    pub level: f32,
    hold_samples_remaining: usize,
}

impl Default for AhdsrEnvelope {
    fn default() -> Self {
        Self {
            stage: EnvStage::Idle,
            level: 0.0,
            hold_samples_remaining: 0,
        }
    }
}

impl AhdsrEnvelope {
    #[inline(always)]
    pub fn trigger(&mut self, hold_ms: f32, sample_rate: f32) {
        self.stage = EnvStage::Attack;
        self.hold_samples_remaining = ((hold_ms * 0.001 * sample_rate) as usize).max(0);
    }

    #[inline(always)]
    pub fn release(&mut self) {
        if self.stage != EnvStage::Idle {
            self.stage = EnvStage::Release;
        }
    }

    #[inline(always)]
    pub fn process(&mut self, params: &AhdsrParams, sample_rate: f32) -> f32 {
        let sr = sample_rate.max(8000.0);

        match self.stage {
            EnvStage::Idle => {
                self.level = 0.0;
            }
            EnvStage::Attack => {
                let attack_samples = (params.attack_ms.max(0.5) * 0.001 * sr).max(1.0);
                self.level += 1.0 / attack_samples;
                if self.level >= 1.0 {
                    self.level = 1.0;
                    self.stage = if self.hold_samples_remaining > 0 {
                        EnvStage::Hold
                    } else {
                        EnvStage::Decay
                    };
                }
            }
            EnvStage::Hold => {
                self.level = 1.0;
                if self.hold_samples_remaining > 0 {
                    self.hold_samples_remaining -= 1;
                } else {
                    self.stage = EnvStage::Decay;
                }
            }
            EnvStage::Decay => {
                let decay_samples = (params.decay_ms.max(5.0) * 0.001 * sr).max(1.0);
                let diff = (1.0 - params.sustain_level.clamp(0.0, 1.0)) / decay_samples;
                self.level -= diff;
                if self.level <= params.sustain_level {
                    self.level = params.sustain_level;
                    self.stage = EnvStage::Sustain;
                }
            }
            EnvStage::Sustain => {
                self.level = params.sustain_level;
            }
            EnvStage::Release => {
                let release_samples = (params.release_ms.max(5.0) * 0.001 * sr).max(1.0);
                self.level -= 1.0 / release_samples;
                if self.level <= 0.0001 {
                    self.level = 0.0;
                    self.stage = EnvStage::Idle;
                }
            }
        }

        self.level
    }
}

// ── POLYPHONIC SYNTH VOICE ──
#[derive(Clone, Copy)]
pub struct SynthVoice {
    pub is_active: bool,
    pub note: u8,
    pub velocity: f32,
    pub age: u64,
    pub env1: AhdsrEnvelope, // Amp
    pub env2: AhdsrEnvelope, // Filter / Mod
    phase_a: [f32; MAX_UNISON],
    phase_b: [f32; MAX_UNISON],
    filter_l: StateVariableFilter,
    filter_r: StateVariableFilter,
}

impl Default for SynthVoice {
    fn default() -> Self {
        Self {
            is_active: false,
            note: 60,
            velocity: 0.8,
            age: 0,
            env1: AhdsrEnvelope::default(),
            env2: AhdsrEnvelope::default(),
            phase_a: [0.0; MAX_UNISON],
            phase_b: [0.0; MAX_UNISON],
            filter_l: StateVariableFilter::default(),
            filter_r: StateVariableFilter::default(),
        }
    }
}

impl SynthVoice {
    pub fn trigger(&mut self, note: u8, velocity: f32, age: u64, params: &SynthParams, sample_rate: f32) {
        self.is_active = true;
        self.note = note;
        self.velocity = velocity;
        self.age = age;

        self.env1.trigger(params.env1.hold_ms, sample_rate);
        self.env2.trigger(params.env2.hold_ms, sample_rate);

        // De-correlate oscillator phases slightly to avoid phase cancellation on note-on
        for i in 0..MAX_UNISON {
            self.phase_a[i] = (i as f32 * 0.231) % 1.0;
            self.phase_b[i] = (i as f32 * 0.377) % 1.0;
        }

        self.filter_l.reset();
        self.filter_r.reset();
    }

    pub fn release(&mut self) {
        self.env1.release();
        self.env2.release();
    }

    #[inline(always)]
    fn render_osc_sample(
        waveform: OscWaveform,
        phase: f32,
        dt: f32,
        pulse_width: f32,
        prng: &mut u32,
    ) -> f32 {
        match waveform {
            OscWaveform::Sine => (2.0 * PI * phase).sin(),
            OscWaveform::Triangle => 2.0 * (2.0 * phase - 1.0).abs() - 1.0,
            OscWaveform::Sawtooth => {
                // PolyBLEP anti-aliased saw
                let mut saw = 2.0 * phase - 1.0;
                if phase < dt {
                    let t = phase / dt;
                    saw -= t - t * t * 0.5 - 0.5;
                } else if phase > 1.0 - dt {
                    let t = (phase - 1.0) / dt;
                    saw -= t + t * t * 0.5 + 0.5;
                }
                saw
            }
            OscWaveform::Pulse => {
                let pw = pulse_width.clamp(0.05, 0.95);
                let mut pulse = if phase < pw { 1.0 } else { -1.0 };
                // PolyBLEP for rising and falling edges
                if phase < dt {
                    let t = phase / dt;
                    pulse -= t - t * t * 0.5 - 0.5;
                } else if (phase - pw).abs() < dt {
                    let t = (phase - pw) / dt;
                    pulse += t - t * t * 0.5 - 0.5;
                }
                pulse
            }
            OscWaveform::WhiteNoise => {
                *prng ^= *prng << 13;
                *prng ^= *prng >> 17;
                *prng ^= *prng << 5;
                (*prng as f32 / 2_147_483_648.0) - 1.0
            }
        }
    }

    #[inline(always)]
    pub fn process(
        &mut self,
        params: &SynthParams,
        lfo_val: f32,
        sample_rate: f32,
        prng: &mut u32,
    ) -> (f32, f32) {
        if !self.is_active {
            return (0.0, 0.0);
        }

        // Process Envelopes
        let amp_env = self.env1.process(&params.env1, sample_rate);
        let mod_env = self.env2.process(&params.env2, sample_rate);

        if self.env1.stage == EnvStage::Idle {
            self.is_active = false;
            return (0.0, 0.0);
        }

        let base_midi = self.note as f32 + (lfo_val * params.lfo.depth_pitch * 2.0);

        let mut osc_out_l = 0.0f32;
        let mut osc_out_r = 0.0f32;

        // ── 1. Source A Generation (with up to 4 unison voices) ──
        if params.osc_a.is_enabled {
            let u_count = (params.osc_a.unison_voices as usize).clamp(1, MAX_UNISON);
            let u_scale = 1.0 / (u_count as f32).sqrt();

            for u in 0..u_count {
                let detune_cents = if u_count > 1 {
                    let spread = (u as f32 / (u_count - 1) as f32) * 2.0 - 1.0;
                    spread * params.osc_a.unison_detune * 40.0
                } else {
                    0.0
                };

                let note_val = base_midi
                    + params.osc_a.coarse_tune as f32
                    + (params.osc_a.fine_tune + detune_cents) / 100.0;

                let freq = 440.0 * 2.0f32.powf((note_val - 69.0) / 12.0);
                let dt = (freq / sample_rate).clamp(0.00001, 0.49);

                let pw = (params.osc_a.pulse_width + lfo_val * params.lfo.depth_pwm * 0.3).clamp(0.05, 0.95);
                let sample = Self::render_osc_sample(
                    params.osc_a.waveform,
                    self.phase_a[u],
                    dt,
                    pw,
                    prng,
                );

                self.phase_a[u] = (self.phase_a[u] + dt) % 1.0;

                // Stereo spread
                let pan_u = (params.osc_a.pan + if u_count > 1 { ((u as f32 / (u_count - 1) as f32) * 2.0 - 1.0) * 0.4 } else { 0.0 }).clamp(-1.0, 1.0);
                let gain_l = ((1.0 - pan_u) * 0.5).sqrt() * params.osc_a.volume * u_scale;
                let gain_r = ((1.0 + pan_u) * 0.5).sqrt() * params.osc_a.volume * u_scale;

                osc_out_l += sample * gain_l;
                osc_out_r += sample * gain_r;
            }
        }

        // ── 2. Source B Generation (with up to 4 unison voices) ──
        if params.osc_b.is_enabled {
            let u_count = (params.osc_b.unison_voices as usize).clamp(1, MAX_UNISON);
            let u_scale = 1.0 / (u_count as f32).sqrt();

            for u in 0..u_count {
                let detune_cents = if u_count > 1 {
                    let spread = (u as f32 / (u_count - 1) as f32) * 2.0 - 1.0;
                    spread * params.osc_b.unison_detune * 40.0
                } else {
                    0.0
                };

                let note_val = base_midi
                    + params.osc_b.coarse_tune as f32
                    + (params.osc_b.fine_tune + detune_cents) / 100.0;

                let freq = 440.0 * 2.0f32.powf((note_val - 69.0) / 12.0);
                let dt = (freq / sample_rate).clamp(0.00001, 0.49);

                let pw = (params.osc_b.pulse_width + lfo_val * params.lfo.depth_pwm * 0.3).clamp(0.05, 0.95);
                let sample = Self::render_osc_sample(
                    params.osc_b.waveform,
                    self.phase_b[u],
                    dt,
                    pw,
                    prng,
                );

                self.phase_b[u] = (self.phase_b[u] + dt) % 1.0;

                let pan_u = (params.osc_b.pan + if u_count > 1 { ((u as f32 / (u_count - 1) as f32) * 2.0 - 1.0) * 0.4 } else { 0.0 }).clamp(-1.0, 1.0);
                let gain_l = ((1.0 - pan_u) * 0.5).sqrt() * params.osc_b.volume * u_scale;
                let gain_r = ((1.0 + pan_u) * 0.5).sqrt() * params.osc_b.volume * u_scale;

                osc_out_l += sample * gain_l;
                osc_out_r += sample * gain_r;
            }
        }

        // ── 3. Resonant State-Variable Filter (SVF) ──
        let mut final_l = osc_out_l;
        let mut final_r = osc_out_r;

        if params.filter.is_enabled {
            // Cutoff modulated by Env2 and LFO
            let env_mod = mod_env * params.filter.env2_amount * 6000.0;
            let lfo_mod = lfo_val * params.lfo.depth_cutoff * 4000.0;
            let eff_cutoff = (params.filter.cutoff_hz + env_mod + lfo_mod).clamp(20.0, 20000.0);

            final_l = self.filter_l.process(
                osc_out_l,
                eff_cutoff,
                params.filter.resonance,
                params.filter.mode,
                params.filter.drive,
                sample_rate,
            );
            final_r = self.filter_r.process(
                osc_out_r,
                eff_cutoff,
                params.filter.resonance,
                params.filter.mode,
                params.filter.drive,
                sample_rate,
            );
        }

        // ── 4. Amplitude Staging ──
        let master_gain = amp_env * self.velocity * params.master_volume;
        (final_l * master_gain, final_r * master_gain)
    }
}

// ── POLYPHONIC MULTI-ENGINE SYNTHESIZER ──
pub struct PolySynth {
    sample_rate: f32,
    params: SynthParams,
    active_params: SynthParams, // Interpolated after Transform Pad
    voices: Box<[SynthVoice; POLYPHONY_VOICES]>,
    active_voices_atomic: Arc<AtomicU32>,
    lfo_phase: f32,
    lfo_sh_val: f32,
    prng: u32,
    age_counter: u64,
}

impl PolySynth {
    pub fn new(sample_rate: f32) -> Self {
        Self::new_with_meter(sample_rate, Arc::new(AtomicU32::new(0)))
    }

    pub fn new_with_meter(sample_rate: f32, active_voices_atomic: Arc<AtomicU32>) -> Self {
        let params = SynthParams::default();
        let voices: Box<[SynthVoice; POLYPHONY_VOICES]> = {
            let mut vec = Vec::with_capacity(POLYPHONY_VOICES);
            for _ in 0..POLYPHONY_VOICES {
                vec.push(SynthVoice::default());
            }
            vec.into_boxed_slice()
                .try_into()
                .unwrap_or_else(|_| panic!("polyphony voice size mismatch"))
        };
        let mut synth = Self {
            sample_rate,
            params: params.clone(),
            active_params: params,
            voices,
            active_voices_atomic,
            lfo_phase: 0.0,
            lfo_sh_val: 0.0,
            prng: 0x9e37_79b9,
            age_counter: 0,
        };
        synth.recalculate_morph();
        synth
    }

    pub fn voices_handle(&self) -> Arc<AtomicU32> {
        Arc::clone(&self.active_voices_atomic)
    }

    pub fn set_params(&mut self, params: SynthParams) {
        self.params = params;
        self.recalculate_morph();
    }

    pub fn set_morph(&mut self, x: f32, y: f32) {
        self.params.morph_x = x.clamp(0.0, 1.0);
        self.params.morph_y = y.clamp(0.0, 1.0);
        self.recalculate_morph();
    }

    /// Interpolate parameters across the 8-snapshot XY Transform Pad
    fn recalculate_morph(&mut self) {
        let x = self.params.morph_x;
        let y = self.params.morph_y;

        // 8 snapshot coordinates arranged around perimeter:
        // S0: (0.0, 0.0), S1: (0.5, 0.0), S2: (1.0, 0.0), S3: (1.0, 0.5)
        // S4: (1.0, 1.0), S5: (0.5, 1.0), S6: (0.0, 1.0), S7: (0.0, 0.5)
        let coords: [(f32, f32); 8] = [
            (0.0, 0.0), (0.5, 0.0), (1.0, 0.0), (1.0, 0.5),
            (1.0, 1.0), (0.5, 1.0), (0.0, 1.0), (0.0, 0.5),
        ];

        // Inverse distance weighting (IDW)
        let mut weights = [0.0f32; 8];
        let mut total_weight = 0.0f32;

        for (i, &(cx, cy)) in coords.iter().enumerate() {
            let dist = ((x - cx).powi(2) + (y - cy).powi(2)).sqrt();
            let w = 1.0 / (dist.max(0.02).powi(2));
            weights[i] = w;
            total_weight += w;
        }

        for w in &mut weights {
            *w /= total_weight;
        }

        // Interpolate morphable parameters
        let mut morph_osc_a_vol = 0.0;
        let mut morph_osc_b_vol = 0.0;
        let mut morph_flt_cut = 0.0;
        let mut morph_flt_res = 0.0;
        let mut morph_flt_drv = 0.0;
        let mut morph_flt_env = 0.0;
        let mut morph_env1_att = 0.0;
        let mut morph_env1_dec = 0.0;
        let mut morph_env1_sus = 0.0;
        let mut morph_env1_rel = 0.0;

        for (i, &w) in weights.iter().enumerate() {
            let s = &self.params.snapshots[i];
            morph_osc_a_vol += s.osc_a.volume * w;
            morph_osc_b_vol += s.osc_b.volume * w;
            morph_flt_cut += s.filter.cutoff_hz * w;
            morph_flt_res += s.filter.resonance * w;
            morph_flt_drv += s.filter.drive * w;
            morph_flt_env += s.filter.env2_amount * w;
            morph_env1_att += s.env1.attack_ms * w;
            morph_env1_dec += s.env1.decay_ms * w;
            morph_env1_sus += s.env1.sustain_level * w;
            morph_env1_rel += s.env1.release_ms * w;
        }

        self.active_params = self.params.clone();
        self.active_params.osc_a.volume = morph_osc_a_vol;
        self.active_params.osc_b.volume = morph_osc_b_vol;
        self.active_params.filter.cutoff_hz = morph_flt_cut;
        self.active_params.filter.resonance = morph_flt_res;
        self.active_params.filter.drive = morph_flt_drv;
        self.active_params.filter.env2_amount = morph_flt_env;
        self.active_params.env1.attack_ms = morph_env1_att;
        self.active_params.env1.decay_ms = morph_env1_dec;
        self.active_params.env1.sustain_level = morph_env1_sus;
        self.active_params.env1.release_ms = morph_env1_rel;
    }

    /// Note On: Allocates a polyphonic voice with oldest-voice stealing
    pub fn note_on(&mut self, note: u8, velocity: f32) {
        self.age_counter += 1;

        // 1. Look for idle voice
        let mut chosen_idx = None;
        for (i, v) in self.voices.iter().enumerate() {
            if !v.is_active || v.env1.stage == EnvStage::Idle {
                chosen_idx = Some(i);
                break;
            }
        }

        // 2. If all voices active, find oldest releasing voice, then oldest active voice
        if chosen_idx.is_none() {
            let mut oldest_release_idx = None;
            let mut min_release_age = u64::MAX;

            let mut oldest_active_idx = 0;
            let mut min_active_age = u64::MAX;

            for (i, v) in self.voices.iter().enumerate() {
                if v.env1.stage == EnvStage::Release && v.age < min_release_age {
                    min_release_age = v.age;
                    oldest_release_idx = Some(i);
                }
                if v.age < min_active_age {
                    min_active_age = v.age;
                    oldest_active_idx = i;
                }
            }

            chosen_idx = oldest_release_idx.or(Some(oldest_active_idx));
        }

        if let Some(idx) = chosen_idx {
            self.voices[idx].trigger(
                note,
                velocity,
                self.age_counter,
                &self.active_params,
                self.sample_rate,
            );
        }
    }

    /// Note Off: Triggers release stage for active voices with matching note
    pub fn note_off(&mut self, note: u8) {
        for v in &mut self.voices {
            if v.is_active && v.note == note {
                v.release();
            }
        }
    }

    /// Panic / All Notes Off
    pub fn all_notes_off(&mut self) {
        for v in &mut self.voices {
            v.is_active = false;
            v.env1.stage = EnvStage::Idle;
            v.env2.stage = EnvStage::Idle;
        }
    }

    /// Render a single stereo frame. Real-time safe: zero allocation, lock-free.
    #[inline(always)]
    pub fn process_frame(&mut self) -> (f32, f32) {
        // Advance LFO
        let lfo_dt = self.active_params.lfo.rate_hz / self.sample_rate.max(8000.0);
        let prev_phase = self.lfo_phase;
        self.lfo_phase = (self.lfo_phase + lfo_dt) % 1.0;

        let lfo_val = match self.active_params.lfo.waveform {
            LfoWaveform::Sine => (2.0 * PI * self.lfo_phase).sin(),
            LfoWaveform::Triangle => 2.0 * (2.0 * self.lfo_phase - 1.0).abs() - 1.0,
            LfoWaveform::Sawtooth => 2.0 * self.lfo_phase - 1.0,
            LfoWaveform::Square => if self.lfo_phase < 0.5 { 1.0 } else { -1.0 },
            LfoWaveform::SampleAndHold => {
                if self.lfo_phase < prev_phase {
                    self.prng ^= self.prng << 13;
                    self.prng ^= self.prng >> 17;
                    self.prng ^= self.prng << 5;
                    self.lfo_sh_val = (self.prng as f32 / 2_147_483_648.0) - 1.0;
                }
                self.lfo_sh_val
            }
        };

        let mut mix_l = 0.0f32;
        let mut mix_r = 0.0f32;
        let mut active_count = 0u32;

        for v in &mut self.voices {
            if v.is_active {
                let (vl, vr) = v.process(
                    &self.active_params,
                    lfo_val,
                    self.sample_rate,
                    &mut self.prng,
                );
                mix_l += vl;
                mix_r += vr;
                active_count += 1;
            }
        }

        self.active_voices_atomic.store(active_count, Ordering::Relaxed);

        (mix_l, mix_r)
    }

    /// Process in-place slice
    pub fn process(&mut self, output_left: &mut [f32], output_right: &mut [f32]) {
        let len = output_left.len().min(output_right.len());
        for i in 0..len {
            let (l, r) = self.process_frame();
            output_left[i] += l;
            output_right[i] += r;
        }
    }
}
