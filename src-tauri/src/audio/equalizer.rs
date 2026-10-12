use std::f32::consts::PI;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Arc;
use serde::{Deserialize, Serialize};

pub const FFT_SIZE: usize = 1024;
pub const SPECTRUM_BINS: usize = 128;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FilterType {
    Highpass,
    LowShelf,
    Peaking,
    HighShelf,
    Lowpass,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqBandParams {
    pub filter_type: FilterType,
    pub is_active: bool,
    pub frequency_hz: f32, // 20.0 to 20000.0
    pub gain_db: f32,      // -24.0 to +24.0
    pub q: f32,            // 0.1 to 30.0
    pub slope_order: u8,   // 1 for 12dB/oct (2-pole), 2 for 24dB/oct (4-pole)
}

impl Default for EqBandParams {
    fn default() -> Self {
        Self {
            filter_type: FilterType::Peaking,
            is_active: true,
            frequency_hz: 1000.0,
            gain_db: 0.0,
            q: 1.0,
            slope_order: 1,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqualizerParams {
    pub bands: [EqBandParams; 8],
    pub output_gain_db: f32,
    pub is_enabled: bool,
    pub spectrum_post_eq: bool,
}

impl Default for EqualizerParams {
    fn default() -> Self {
        Self {
            bands: [
                // Band 1: Highpass (Low Cut) 30 Hz, 12dB/oct
                EqBandParams {
                    filter_type: FilterType::Highpass,
                    is_active: false,
                    frequency_hz: 30.0,
                    gain_db: 0.0,
                    q: 0.7071,
                    slope_order: 1,
                },
                // Band 2: Low Shelf 100 Hz
                EqBandParams {
                    filter_type: FilterType::LowShelf,
                    is_active: true,
                    frequency_hz: 100.0,
                    gain_db: 0.0,
                    q: 0.7071,
                    slope_order: 1,
                },
                // Band 3: Peaking Low-Mid 250 Hz
                EqBandParams {
                    filter_type: FilterType::Peaking,
                    is_active: true,
                    frequency_hz: 250.0,
                    gain_db: 0.0,
                    q: 1.0,
                    slope_order: 1,
                },
                // Band 4: Peaking Mid 1000 Hz
                EqBandParams {
                    filter_type: FilterType::Peaking,
                    is_active: true,
                    frequency_hz: 1000.0,
                    gain_db: 0.0,
                    q: 1.0,
                    slope_order: 1,
                },
                // Band 5: Peaking High-Mid 3000 Hz
                EqBandParams {
                    filter_type: FilterType::Peaking,
                    is_active: true,
                    frequency_hz: 3000.0,
                    gain_db: 0.0,
                    q: 1.0,
                    slope_order: 1,
                },
                // Band 6: Peaking Presence 8000 Hz
                EqBandParams {
                    filter_type: FilterType::Peaking,
                    is_active: true,
                    frequency_hz: 8000.0,
                    gain_db: 0.0,
                    q: 1.0,
                    slope_order: 1,
                },
                // Band 7: High Shelf 12000 Hz
                EqBandParams {
                    filter_type: FilterType::HighShelf,
                    is_active: true,
                    frequency_hz: 12000.0,
                    gain_db: 0.0,
                    q: 0.7071,
                    slope_order: 1,
                },
                // Band 8: Lowpass (High Cut) 18000 Hz, 12dB/oct
                EqBandParams {
                    filter_type: FilterType::Lowpass,
                    is_active: false,
                    frequency_hz: 18000.0,
                    gain_db: 0.0,
                    q: 0.7071,
                    slope_order: 1,
                },
            ],
            output_gain_db: 0.0,
            is_enabled: true,
            spectrum_post_eq: true,
        }
    }
}

/// Normalized biquad filter coefficients (Direct Form II Transposed).
#[derive(Clone, Copy)]
pub struct BiquadCoeffs {
    pub b0: f32,
    pub b1: f32,
    pub b2: f32,
    pub a1: f32,
    pub a2: f32,
}

impl Default for BiquadCoeffs {
    fn default() -> Self {
        Self::identity()
    }
}

impl BiquadCoeffs {
    #[inline(always)]
    pub fn identity() -> Self {
        Self {
            b0: 1.0,
            b1: 0.0,
            b2: 0.0,
            a1: 0.0,
            a2: 0.0,
        }
    }

    /// Calculate biquad filter coefficients using standard Audio EQ Cookbook formulas.
    pub fn calculate(
        filter_type: FilterType,
        freq_hz: f32,
        gain_db: f32,
        q: f32,
        sample_rate: f32,
    ) -> Self {
        let sr = sample_rate.max(8000.0);
        let f0 = freq_hz.clamp(20.0, sr * 0.495);
        let q = q.clamp(0.1, 30.0);
        let w0 = 2.0 * PI * f0 / sr;
        let cos_w0 = w0.cos();
        let sin_w0 = w0.sin();
        let alpha = sin_w0 / (2.0 * q);
        let a_gain = 10.0f32.powf(gain_db / 40.0); // sqrt of linear power

        let (b0, b1, b2, a0, a1, a2) = match filter_type {
            FilterType::Peaking => {
                let b0 = 1.0 + alpha * a_gain;
                let b1 = -2.0 * cos_w0;
                let b2 = 1.0 - alpha * a_gain;
                let a0 = 1.0 + alpha / a_gain;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha / a_gain;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::LowShelf => {
                let sqrt_a = a_gain.sqrt();
                let b0 = a_gain * ((a_gain + 1.0) - (a_gain - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha);
                let b1 = 2.0 * a_gain * ((a_gain - 1.0) - (a_gain + 1.0) * cos_w0);
                let b2 = a_gain * ((a_gain + 1.0) - (a_gain - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha);
                let a0 = (a_gain + 1.0) + (a_gain - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha;
                let a1 = -2.0 * ((a_gain - 1.0) + (a_gain + 1.0) * cos_w0);
                let a2 = (a_gain + 1.0) + (a_gain - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::HighShelf => {
                let sqrt_a = a_gain.sqrt();
                let b0 = a_gain * ((a_gain + 1.0) + (a_gain - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha);
                let b1 = -2.0 * a_gain * ((a_gain - 1.0) + (a_gain + 1.0) * cos_w0);
                let b2 = a_gain * ((a_gain + 1.0) + (a_gain - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha);
                let a0 = (a_gain + 1.0) - (a_gain - 1.0) * cos_w0 + 2.0 * sqrt_a * alpha;
                let a1 = 2.0 * ((a_gain - 1.0) - (a_gain + 1.0) * cos_w0);
                let a2 = (a_gain + 1.0) - (a_gain - 1.0) * cos_w0 - 2.0 * sqrt_a * alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Highpass => {
                let b0 = (1.0 + cos_w0) * 0.5;
                let b1 = -(1.0 + cos_w0);
                let b2 = (1.0 + cos_w0) * 0.5;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
            FilterType::Lowpass => {
                let b0 = (1.0 - cos_w0) * 0.5;
                let b1 = 1.0 - cos_w0;
                let b2 = (1.0 - cos_w0) * 0.5;
                let a0 = 1.0 + alpha;
                let a1 = -2.0 * cos_w0;
                let a2 = 1.0 - alpha;
                (b0, b1, b2, a0, a1, a2)
            }
        };

        if a0.abs() < 1e-12 {
            Self::identity()
        } else {
            Self {
                b0: b0 / a0,
                b1: b1 / a0,
                b2: b2 / a0,
                a1: a1 / a0,
                a2: a2 / a0,
            }
        }
    }
}

/// Direct Form II Transposed filter state.
#[derive(Clone, Copy, Default)]
pub struct BiquadState {
    pub s1: f32,
    pub s2: f32,
}

impl BiquadState {
    #[inline(always)]
    pub fn process(&mut self, x: f32, coeffs: &BiquadCoeffs) -> f32 {
        let y = coeffs.b0 * x + self.s1;
        self.s1 = coeffs.b1 * x - coeffs.a1 * y + self.s2;
        self.s2 = coeffs.b2 * x - coeffs.a2 * y;

        // Anti-denormal flushing
        if self.s1.abs() < 1e-18 {
            self.s1 = 0.0;
        }
        if self.s2.abs() < 1e-18 {
            self.s2 = 0.0;
        }

        if y.is_nan() || y.is_infinite() {
            0.0
        } else {
            y
        }
    }

    #[inline(always)]
    pub fn reset(&mut self) {
        self.s1 = 0.0;
        self.s2 = 0.0;
    }
}

/// Single stereo filter band supporting up to 2 cascaded biquads (e.g. 24dB/oct slopes).
pub struct EqBandFilter {
    pub params: EqBandParams,
    pub coeffs_stage1: BiquadCoeffs,
    pub coeffs_stage2: BiquadCoeffs,
    pub is_dual_stage: bool,
    state_l1: BiquadState,
    state_l2: BiquadState,
    state_r1: BiquadState,
    state_r2: BiquadState,
}

impl EqBandFilter {
    pub fn new(params: EqBandParams, sample_rate: f32) -> Self {
        let mut filter = Self {
            params,
            coeffs_stage1: BiquadCoeffs::identity(),
            coeffs_stage2: BiquadCoeffs::identity(),
            is_dual_stage: false,
            state_l1: BiquadState::default(),
            state_l2: BiquadState::default(),
            state_r1: BiquadState::default(),
            state_r2: BiquadState::default(),
        };
        filter.recalculate(sample_rate);
        filter
    }

    pub fn recalculate(&mut self, sample_rate: f32) {
        if !self.params.is_active {
            self.coeffs_stage1 = BiquadCoeffs::identity();
            self.coeffs_stage2 = BiquadCoeffs::identity();
            self.is_dual_stage = false;
            return;
        }

        match self.params.filter_type {
            FilterType::Highpass => {
                if self.params.slope_order >= 2 {
                    // 24 dB/oct: 4th-order Butterworth cascade (Q1=0.5412, Q2=1.3065)
                    self.is_dual_stage = true;
                    let q_scale = self.params.q / 0.7071;
                    self.coeffs_stage1 = BiquadCoeffs::calculate(
                        FilterType::Highpass,
                        self.params.frequency_hz,
                        0.0,
                        0.5412 * q_scale,
                        sample_rate,
                    );
                    self.coeffs_stage2 = BiquadCoeffs::calculate(
                        FilterType::Highpass,
                        self.params.frequency_hz,
                        0.0,
                        1.3065 * q_scale,
                        sample_rate,
                    );
                } else {
                    // 12 dB/oct: single 2nd-order biquad
                    self.is_dual_stage = false;
                    self.coeffs_stage1 = BiquadCoeffs::calculate(
                        FilterType::Highpass,
                        self.params.frequency_hz,
                        0.0,
                        self.params.q,
                        sample_rate,
                    );
                }
            }
            FilterType::Lowpass => {
                if self.params.slope_order >= 2 {
                    // 24 dB/oct: 4th-order Butterworth cascade
                    self.is_dual_stage = true;
                    let q_scale = self.params.q / 0.7071;
                    self.coeffs_stage1 = BiquadCoeffs::calculate(
                        FilterType::Lowpass,
                        self.params.frequency_hz,
                        0.0,
                        0.5412 * q_scale,
                        sample_rate,
                    );
                    self.coeffs_stage2 = BiquadCoeffs::calculate(
                        FilterType::Lowpass,
                        self.params.frequency_hz,
                        0.0,
                        1.3065 * q_scale,
                        sample_rate,
                    );
                } else {
                    // 12 dB/oct
                    self.is_dual_stage = false;
                    self.coeffs_stage1 = BiquadCoeffs::calculate(
                        FilterType::Lowpass,
                        self.params.frequency_hz,
                        0.0,
                        self.params.q,
                        sample_rate,
                    );
                }
            }
            _ => {
                // Bell, Low Shelf, High Shelf
                self.is_dual_stage = false;
                self.coeffs_stage1 = BiquadCoeffs::calculate(
                    self.params.filter_type,
                    self.params.frequency_hz,
                    self.params.gain_db,
                    self.params.q,
                    sample_rate,
                );
            }
        }
    }

    #[inline(always)]
    pub fn process_frame(&mut self, left: f32, right: f32) -> (f32, f32) {
        if !self.params.is_active {
            return (left, right);
        }

        let l1 = self.state_l1.process(left, &self.coeffs_stage1);
        let r1 = self.state_r1.process(right, &self.coeffs_stage1);

        if self.is_dual_stage {
            let l2 = self.state_l2.process(l1, &self.coeffs_stage2);
            let r2 = self.state_r2.process(r1, &self.coeffs_stage2);
            (l2, r2)
        } else {
            (l1, r1)
        }
    }

    pub fn reset_state(&mut self) {
        self.state_l1.reset();
        self.state_l2.reset();
        self.state_r1.reset();
        self.state_r2.reset();
    }
}

/// Real-Time Safe FFT Spectrum Analyzer.
/// Uses precomputed twiddle factors and Hann window with zero allocations during processing.
pub struct FftAnalyzer {
    sample_rate: f32,
    input_buffer: [f32; FFT_SIZE],
    buffer_idx: usize,
    hop_counter: usize,
    hann_window: [f32; FFT_SIZE],
    bit_rev: [u16; FFT_SIZE],
    twiddle_cos: [f32; FFT_SIZE / 2],
    twiddle_sin: [f32; FFT_SIZE / 2],
    scratch_re: [f32; FFT_SIZE],
    scratch_im: [f32; FFT_SIZE],
    current_decay: [f32; SPECTRUM_BINS],
    spectrum_peaks: Arc<[AtomicU32; SPECTRUM_BINS]>,
}

impl FftAnalyzer {
    pub fn new(sample_rate: f32, spectrum_peaks: Arc<[AtomicU32; SPECTRUM_BINS]>) -> Self {
        // Precompute Hann window
        let mut hann_window = [0.0f32; FFT_SIZE];
        for i in 0..FFT_SIZE {
            hann_window[i] = 0.5 * (1.0 - (2.0 * PI * i as f32 / (FFT_SIZE as f32 - 1.0)).cos());
        }

        // Precompute bit reversal permutation for 1024 points (10 bits)
        let mut bit_rev = [0u16; FFT_SIZE];
        for i in 0..FFT_SIZE {
            let mut rev = 0u16;
            let mut temp = i;
            for _ in 0..10 {
                rev = (rev << 1) | (temp as u16 & 1);
                temp >>= 1;
            }
            bit_rev[i] = rev;
        }

        // Precompute twiddle factors: exp(-2*pi*i*k / N)
        let mut twiddle_cos = [0.0f32; FFT_SIZE / 2];
        let mut twiddle_sin = [0.0f32; FFT_SIZE / 2];
        for k in 0..(FFT_SIZE / 2) {
            let theta = -2.0 * PI * (k as f32) / (FFT_SIZE as f32);
            twiddle_cos[k] = theta.cos();
            twiddle_sin[k] = theta.sin();
        }

        Self {
            sample_rate,
            input_buffer: [0.0; FFT_SIZE],
            buffer_idx: 0,
            hop_counter: 0,
            hann_window,
            bit_rev,
            twiddle_cos,
            twiddle_sin,
            scratch_re: [0.0; FFT_SIZE],
            scratch_im: [0.0; FFT_SIZE],
            current_decay: [0.0; SPECTRUM_BINS],
            spectrum_peaks,
        }
    }

    /// Feed mono/summed sample into the circular buffer.
    /// Runs FFT every 512 samples (~86 times per second at 44.1kHz) with zero heap allocations.
    #[inline(always)]
    pub fn feed_sample(&mut self, sample: f32) {
        self.input_buffer[self.buffer_idx] = sample;
        self.buffer_idx = (self.buffer_idx + 1) % FFT_SIZE;

        self.hop_counter += 1;
        if self.hop_counter >= 512 {
            self.hop_counter = 0;
            self.compute_fft();
        }
    }

    fn compute_fft(&mut self) {
        // 1. Copy windowed data into scratch buffer in bit-reversed order
        for i in 0..FFT_SIZE {
            let circ_idx = (self.buffer_idx + i) % FFT_SIZE;
            let rev_idx = self.bit_rev[i] as usize;
            self.scratch_re[rev_idx] = self.input_buffer[circ_idx] * self.hann_window[i];
            self.scratch_im[rev_idx] = 0.0;
        }

        // 2. In-place Cooley-Tukey Radix-2 FFT
        let mut len = 2;
        while len <= FFT_SIZE {
            let half = len / 2;
            let step = FFT_SIZE / len;

            let mut k = 0;
            while k < half {
                let wr = self.twiddle_cos[k * step];
                let wi = self.twiddle_sin[k * step];

                let mut j = k;
                while j < FFT_SIZE {
                    let tr = self.scratch_re[j + half] * wr - self.scratch_im[j + half] * wi;
                    let ti = self.scratch_re[j + half] * wi + self.scratch_im[j + half] * wr;

                    let ur = self.scratch_re[j];
                    let ui = self.scratch_im[j];

                    self.scratch_re[j] = ur + tr;
                    self.scratch_im[j] = ui + ti;
                    self.scratch_re[j + half] = ur - tr;
                    self.scratch_im[j + half] = ui - ti;

                    j += len;
                }
                k += 1;
            }
            len <<= 1;
        }

        // 3. Extract 128 logarithmic frequency bands from 20 Hz to 20,000 Hz
        let bin_res = self.sample_rate / (FFT_SIZE as f32);
        let min_freq = 20.0f32;
        let max_freq = 20000.0f32;
        let log_ratio = (max_freq / min_freq).ln();
        let num_bins_f = (SPECTRUM_BINS - 1) as f32;

        let decay = 0.82f32; // Smooth peak release ballistics

        for b in 0..SPECTRUM_BINS {
            let norm_x = b as f32 / num_bins_f;
            let freq = min_freq * (norm_x * log_ratio).exp();

            let bin_idx_f = (freq / bin_res).clamp(0.0, 511.0);
            let idx_floor = bin_idx_f.floor() as usize;
            let idx_ceil = (idx_floor + 1).min(511);
            let frac = bin_idx_f - idx_floor as f32;

            let mag_floor = (self.scratch_re[idx_floor].powi(2)
                + self.scratch_im[idx_floor].powi(2))
            .sqrt();
            let mag_ceil =
                (self.scratch_re[idx_ceil].powi(2) + self.scratch_im[idx_ceil].powi(2)).sqrt();

            let mag = (mag_floor * (1.0 - frac) + mag_ceil * frac) / (FFT_SIZE as f32 * 0.5);

            // Convert to decibels (-75 dB to +6 dB mapped to 0.0 .. 1.0)
            let db = 20.0 * (mag + 1e-5).log10();
            let norm = ((db + 75.0) / 81.0).clamp(0.0, 1.0);

            // Ballistics: fast instantaneous attack with smooth decay release
            let current = self.current_decay[b] * decay;
            let val = if norm > current { norm } else { current };
            self.current_decay[b] = val;

            self.spectrum_peaks[b].store(val.to_bits(), Ordering::Relaxed);
        }
    }
}

/// Real-time safe stereo 8-Band Parametric Channel EQ.
/// Zero heap allocations inside the audio processing loop.
pub struct Equalizer {
    sample_rate: f32,
    params: EqualizerParams,
    bands: [EqBandFilter; 8],
    output_gain_lin: f32,
    fft_analyzer: FftAnalyzer,
}

impl Equalizer {
    pub fn new(sample_rate: f32) -> Self {
        let spectrum_peaks = Arc::new(std::array::from_fn(|_| AtomicU32::new(0)));
        Self::new_with_spectrum(sample_rate, spectrum_peaks)
    }

    pub fn new_with_spectrum(
        sample_rate: f32,
        spectrum_peaks: Arc<[AtomicU32; SPECTRUM_BINS]>,
    ) -> Self {
        let params = EqualizerParams::default();
        let bands = [
            EqBandFilter::new(params.bands[0].clone(), sample_rate),
            EqBandFilter::new(params.bands[1].clone(), sample_rate),
            EqBandFilter::new(params.bands[2].clone(), sample_rate),
            EqBandFilter::new(params.bands[3].clone(), sample_rate),
            EqBandFilter::new(params.bands[4].clone(), sample_rate),
            EqBandFilter::new(params.bands[5].clone(), sample_rate),
            EqBandFilter::new(params.bands[6].clone(), sample_rate),
            EqBandFilter::new(params.bands[7].clone(), sample_rate),
        ];

        let output_gain_lin = 10.0f32.powf(params.output_gain_db / 20.0);
        let fft_analyzer = FftAnalyzer::new(sample_rate, spectrum_peaks);

        Self {
            sample_rate,
            params,
            bands,
            output_gain_lin,
            fft_analyzer,
        }
    }

    pub fn spectrum_handle(&self) -> Arc<[AtomicU32; SPECTRUM_BINS]> {
        Arc::clone(&self.fft_analyzer.spectrum_peaks)
    }

    pub fn set_params(&mut self, params: EqualizerParams) {
        self.params = params;
        self.output_gain_lin = 10.0f32.powf(self.params.output_gain_db / 20.0);

        for (i, band) in self.bands.iter_mut().enumerate() {
            band.params = self.params.bands[i].clone();
            band.recalculate(self.sample_rate);
        }
    }

    /// Process a stereo frame (left, right). Real-time safe: zero allocation, lock-free.
    #[inline(always)]
    pub fn process_frame(&mut self, left: f32, right: f32) -> (f32, f32) {
        if !self.params.is_enabled {
            self.fft_analyzer.feed_sample((left + right) * 0.5);
            return (left, right);
        }

        // If pre-EQ spectrum mode is active, feed input before filtering
        if !self.params.spectrum_post_eq {
            self.fft_analyzer.feed_sample((left + right) * 0.5);
        }

        let mut l = left;
        let mut r = right;

        // Cascade through all 8 parametric filter bands
        for band in &mut self.bands {
            let (next_l, next_r) = band.process_frame(l, r);
            l = next_l;
            r = next_r;
        }

        // Apply master output gain
        l *= self.output_gain_lin;
        r *= self.output_gain_lin;

        // If post-EQ spectrum mode is active, feed output after filtering
        if self.params.spectrum_post_eq {
            self.fft_analyzer.feed_sample((l + r) * 0.5);
        }

        (l, r)
    }

    /// In-place slice processing. Zero allocation.
    pub fn process(&mut self, left: &mut [f32], right: &mut [f32]) {
        let len = left.len().min(right.len());
        for i in 0..len {
            let (out_l, out_r) = self.process_frame(left[i], right[i]);
            left[i] = out_l;
            right[i] = out_r;
        }
    }

    pub fn reset(&mut self) {
        for band in &mut self.bands {
            band.reset_state();
        }
    }
}
