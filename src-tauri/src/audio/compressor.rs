use std::f32::consts::PI;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum CompressorCircuit {
    Platinum,
    VintageVca,
    VintageFet,
    VintageOpto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompressorParams {
    pub circuit: CompressorCircuit,
    pub threshold_db: f32,        // -60.0 to 0.0 dB
    pub ratio: f32,               // 1.1 to 30.0
    pub attack_ms: f32,           // 0.1 to 200.0 ms
    pub release_ms: f32,          // 10.0 to 1200.0 ms
    pub knee: f32,                // 0.0 to 1.0 (0.0 = hard knee, 1.0 = 12dB soft knee)
    pub makeup_gain_db: f32,      // -24.0 to +24.0 dB
    pub sidechain_lowcut_hz: f32, // 20.0 to 1000.0 Hz
    pub is_enabled: bool,
    pub listen_sidechain: bool,
}

impl Default for CompressorParams {
    fn default() -> Self {
        Self {
            circuit: CompressorCircuit::VintageVca,
            threshold_db: -18.0,
            ratio: 4.0,
            attack_ms: 15.0,
            release_ms: 150.0,
            knee: 0.5,
            makeup_gain_db: 0.0,
            sidechain_lowcut_hz: 80.0,
            is_enabled: true,
            listen_sidechain: false,
        }
    }
}

/// 1-pole highpass filter for the detector sidechain.
#[derive(Clone, Copy)]
struct SidechainFilter {
    alpha: f32,
    prev_x: f32,
    prev_y: f32,
}

impl SidechainFilter {
    fn new(cutoff_hz: f32, sample_rate: f32) -> Self {
        let mut s = Self {
            alpha: 0.0,
            prev_x: 0.0,
            prev_y: 0.0,
        };
        s.update(cutoff_hz, sample_rate);
        s
    }

    #[inline(always)]
    fn update(&mut self, cutoff_hz: f32, sample_rate: f32) {
        let fc = cutoff_hz.clamp(20.0, 1000.0);
        let omega = 2.0 * PI * fc / sample_rate.max(8000.0);
        self.alpha = 1.0 / (1.0 + omega);
    }

    #[inline(always)]
    fn process(&mut self, x: f32) -> f32 {
        let y = self.alpha * (self.prev_y + x - self.prev_x);
        self.prev_x = x;
        self.prev_y = if y.is_nan() || y.is_infinite() { 0.0 } else { y };
        self.prev_y
    }

    #[inline(always)]
    fn reset(&mut self) {
        self.prev_x = 0.0;
        self.prev_y = 0.0;
    }
}

/// Real-time safe stereo compressor supporting 4 modeled circuit topologies.
/// Zero heap allocations in the audio processing loop.
pub struct Compressor {
    sample_rate: f32,
    params: CompressorParams,

    // Pre-computed coefficients
    attack_coeff: f32,
    release_coeff: f32,
    makeup_gain_lin: f32,

    // Sidechain highpass filters (Left and Right)
    sc_l: SidechainFilter,
    sc_r: SidechainFilter,

    // Dynamic envelope follower states (in dB domain, <= 0.0)
    envelope_db: f32,
    opto_memory_db: f32, // Secondary slow-release photocell memory lag state

    // Feedback detection state (for VintageVca)
    prev_out_l: f32,
    prev_out_r: f32,

    // Atomic gain reduction level in positive dB (for lock-free UI meter polling)
    reduction_atomic: Arc<AtomicU32>,
}

impl Compressor {
    pub fn new(sample_rate: f32) -> Self {
        Self::new_with_meter(sample_rate, Arc::new(AtomicU32::new(0)))
    }

    pub fn new_with_meter(sample_rate: f32, reduction_atomic: Arc<AtomicU32>) -> Self {
        let params = CompressorParams::default();
        let mut comp = Self {
            sample_rate,
            params: params.clone(),
            attack_coeff: 0.0,
            release_coeff: 0.0,
            makeup_gain_lin: 1.0,
            sc_l: SidechainFilter::new(params.sidechain_lowcut_hz, sample_rate),
            sc_r: SidechainFilter::new(params.sidechain_lowcut_hz, sample_rate),
            envelope_db: 0.0,
            opto_memory_db: 0.0,
            prev_out_l: 0.0,
            prev_out_r: 0.0,
            reduction_atomic,
        };
        comp.recalculate_coefficients();
        comp
    }

    /// Expose clone of the atomic gain reduction handle for UI reading.
    pub fn reduction_handle(&self) -> Arc<AtomicU32> {
        Arc::clone(&self.reduction_atomic)
    }

    pub fn set_sample_rate(&mut self, sample_rate: f32) {
        self.sample_rate = sample_rate;
        self.sc_l.update(self.params.sidechain_lowcut_hz, sample_rate);
        self.sc_r.update(self.params.sidechain_lowcut_hz, sample_rate);
        self.recalculate_coefficients();
    }

    pub fn set_params(&mut self, params: CompressorParams) {
        self.params = params;
        self.sc_l.update(self.params.sidechain_lowcut_hz, self.sample_rate);
        self.sc_r.update(self.params.sidechain_lowcut_hz, self.sample_rate);
        self.recalculate_coefficients();
    }

    pub fn params(&self) -> &CompressorParams {
        &self.params
    }

    pub fn reset(&mut self) {
        self.sc_l.reset();
        self.sc_r.reset();
        self.envelope_db = 0.0;
        self.opto_memory_db = 0.0;
        self.prev_out_l = 0.0;
        self.prev_out_r = 0.0;
        self.reduction_atomic.store(0, Ordering::Relaxed);
    }

    #[inline(always)]
    fn recalculate_coefficients(&mut self) {
        let sr = self.sample_rate.max(8000.0);

        // Standard time constant tau to coefficient alpha: alpha = exp(-1 / (tau * sr))
        let attack_sec = (self.params.attack_ms * 0.001).max(0.00005);
        let release_sec = (self.params.release_ms * 0.001).max(0.001);

        self.attack_coeff = (-1.0 / (attack_sec * sr)).exp();
        self.release_coeff = (-1.0 / (release_sec * sr)).exp();
        self.makeup_gain_lin = 10.0f32.powf(self.params.makeup_gain_db / 20.0);
    }

    /// Calculates static gain reduction target in dB for a given input dB level.
    #[inline(always)]
    fn compute_target_gr_db(&self, input_db: f32) -> f32 {
        let threshold = self.params.threshold_db;
        let ratio = self.params.ratio.max(1.0);
        let knee_width = (self.params.knee * 12.0).max(0.0);

        if knee_width < 0.01 {
            // Hard knee
            if input_db <= threshold {
                0.0
            } else {
                let over = input_db - threshold;
                (over / ratio) - over // Negative dB value representing gain reduction
            }
        } else {
            // Soft knee quadratic interpolation
            let half_knee = knee_width * 0.5;
            let delta = input_db - threshold;

            if delta <= -half_knee {
                0.0
            } else if delta >= half_knee {
                let over = input_db - threshold;
                (over / ratio) - over
            } else {
                let x = delta + half_knee;
                let gr_linear_portion = ((1.0 / ratio) - 1.0) * (x * x) / (2.0 * knee_width);
                gr_linear_portion.min(0.0)
            }
        }
    }

    /// Process a stereo frame (L, R). Real-time safe: zero allocation, lock-free.
    #[inline(always)]
    pub fn process_frame(&mut self, in_l: f32, in_r: f32) -> (f32, f32) {
        if !self.params.is_enabled {
            self.reduction_atomic.store(0, Ordering::Relaxed);
            return (in_l, in_r);
        }

        // 1. Sidechain high-pass filtering
        let sc_l = self.sc_l.process(in_l);
        let sc_r = self.sc_r.process(in_r);

        // If Listen Sidechain is toggled, output the filtered trigger signal directly
        if self.params.listen_sidechain {
            self.reduction_atomic.store(0, Ordering::Relaxed);
            return (sc_l, sc_r);
        }

        // 2. Determine detector signal based on circuit topology
        let det_peak = match self.params.circuit {
            CompressorCircuit::VintageVca => {
                // Logarithmic feedback detection: senses prior output frame
                let fb_l = self.sc_l.process(self.prev_out_l);
                let fb_r = self.sc_r.process(self.prev_out_r);
                fb_l.abs().max(fb_r.abs()).max(1e-6)
            }
            _ => {
                // Feed-forward peak detection
                sc_l.abs().max(sc_r.abs()).max(1e-6)
            }
        };

        // Convert detector level to dB (floored at -120 dB)
        let det_db = 20.0 * det_peak.log10().max(-6.0);

        // 3. Compute static target gain reduction in dB (always <= 0.0)
        let target_gr_db = self.compute_target_gr_db(det_db);

        // 4. Circuit-specific dynamic ballistics & envelope followers
        match self.params.circuit {
            CompressorCircuit::Platinum => {
                // Clean feed-forward peak detector, linear dB gain scaling
                if target_gr_db < self.envelope_db {
                    // Attack phase (gain reduction deepening)
                    self.envelope_db =
                        self.attack_coeff * self.envelope_db + (1.0 - self.attack_coeff) * target_gr_db;
                } else {
                    // Release phase (gain reduction recovering toward 0)
                    self.envelope_db =
                        self.release_coeff * self.envelope_db + (1.0 - self.release_coeff) * target_gr_db;
                }
            }

            CompressorCircuit::VintageVca => {
                // Program-dependent attack/release adaptation
                let gr_delta = (target_gr_db - self.envelope_db).abs();
                let adapt_factor = (1.0 + (gr_delta * 0.1)).min(3.0);

                if target_gr_db < self.envelope_db {
                    // Attack adapts faster on sudden heavy transient hits
                    let fast_attack = self.attack_coeff.powf(adapt_factor);
                    self.envelope_db =
                        fast_attack * self.envelope_db + (1.0 - fast_attack) * target_gr_db;
                } else {
                    // Release slightly relaxes when deeply compressed (console bus glue)
                    let glue_release = if self.envelope_db < -6.0 {
                        self.release_coeff.powf(0.85)
                    } else {
                        self.release_coeff
                    };
                    self.envelope_db =
                        glue_release * self.envelope_db + (1.0 - glue_release) * target_gr_db;
                }
            }

            CompressorCircuit::VintageFet => {
                // Aggressive exponential peak attack (1176-style fast transient clamp)
                let fet_attack = self.attack_coeff.powf(2.5); // Accelerated attack tracking

                if target_gr_db < self.envelope_db {
                    self.envelope_db =
                        fet_attack * self.envelope_db + (1.0 - fet_attack) * target_gr_db;
                } else {
                    self.envelope_db =
                        self.release_coeff * self.envelope_db + (1.0 - self.release_coeff) * target_gr_db;
                }
            }

            CompressorCircuit::VintageOpto => {
                // Dual-stage non-linear release simulating photocell memory lag (LA-2A style)
                if target_gr_db < self.envelope_db {
                    // Attack: both stages track the input envelope
                    self.envelope_db =
                        self.attack_coeff * self.envelope_db + (1.0 - self.attack_coeff) * target_gr_db;
                    self.opto_memory_db =
                        self.attack_coeff * self.opto_memory_db + (1.0 - self.attack_coeff) * target_gr_db;
                } else {
                    // Release: Stage 1 drops fast (initial ~50%), Stage 2 lingers with long photocell lag
                    let opto_fast_rel = self.release_coeff.powf(1.8); // fast initial recovery
                    let opto_slow_rel = self.release_coeff.powf(0.25); // slow tail memory lag

                    self.envelope_db =
                        opto_fast_rel * self.envelope_db + (1.0 - opto_fast_rel) * target_gr_db;
                    self.opto_memory_db =
                        opto_slow_rel * self.opto_memory_db + (1.0 - opto_slow_rel) * target_gr_db;
                }
            }
        }

        // Effective gain reduction dB
        let effective_gr_db = if self.params.circuit == CompressorCircuit::VintageOpto {
            0.55 * self.envelope_db + 0.45 * self.opto_memory_db
        } else {
            self.envelope_db
        };

        // 5. Update atomic meter for UI polling (stored as positive dB of reduction)
        let reduction_positive_db = (-effective_gr_db).clamp(0.0, 48.0);
        self.reduction_atomic.store(reduction_positive_db.to_bits(), Ordering::Relaxed);

        // 6. Compute linear gain multiplier including makeup gain
        let total_gain_db = effective_gr_db + self.params.makeup_gain_db;
        let gain_lin = 10.0f32.powf(total_gain_db / 20.0);

        let mut out_l = in_l * gain_lin;
        let mut out_r = in_r * gain_lin;

        // 7. Topology-specific output coloring (Vintage FET soft saturation)
        if self.params.circuit == CompressorCircuit::VintageFet {
            out_l = Self::fet_soft_saturate(out_l);
            out_r = Self::fet_soft_saturate(out_r);
        }

        // Store outputs for feedback loop (Vintage VCA)
        self.prev_out_l = out_l;
        self.prev_out_r = out_r;

        (out_l, out_r)
    }

    /// Analog soft-saturation curve for Vintage FET limiting.
    #[inline(always)]
    fn fet_soft_saturate(x: f32) -> f32 {
        let abs_x = x.abs();
        if abs_x < 0.6 {
            x
        } else if abs_x < 1.4 {
            let sign = if x >= 0.0 { 1.0 } else { -1.0 };
            let norm = (abs_x - 0.6) / 0.8;
            sign * (0.6 + 0.8 * (norm - (norm.powi(3) * 0.333)))
        } else {
            let sign = if x >= 0.0 { 1.0 } else { -1.0 };
            sign * (1.13 + (abs_x - 1.4).tanh() * 0.15)
        }
    }

    /// Process in-place audio slices with zero heap allocations.
    pub fn process(&mut self, left: &mut [f32], right: &mut [f32]) {
        let count = left.len().min(right.len());
        for i in 0..count {
            let (out_l, out_r) = self.process_frame(left[i], right[i]);
            left[i] = out_l;
            right[i] = out_r;
        }
    }
}
