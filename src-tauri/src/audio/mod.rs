pub mod compressor;
pub mod engine;
pub mod equalizer;
pub mod midi;
pub mod recorder;
pub mod sample_engine;
pub mod synth;

pub use compressor::{Compressor, CompressorCircuit, CompressorParams};
pub use equalizer::{EqBandParams, Equalizer, EqualizerParams, FilterType, SPECTRUM_BINS};
pub use synth::{
    AhdsrParams, FilterMode, FilterParams, LfoParams, LfoWaveform, OscParams, OscWaveform,
    PolySynth, SynthParams, SynthSnapshot, POLYPHONY_VOICES,
};
pub use engine::{AudioCommand, AudioEngine, ChannelSyncData, MAX_STEPS};
pub use midi::{
    MidiDeviceDescriptor, MidiManager, ParsedMidiFile, ParsedMidiNote, ParsedMidiTrack,
};
pub use recorder::{AudioDeviceDescriptor, AudioRecorder, RecordedClipMetadata};
pub use sample_engine::{
    decode_audio_file, ensure_factory_samples, BrowserEntry, SampleData, SampleMetadata,
    SamplePlaybackVoice, VoicePool, VOICE_POOL_SIZE,
};

