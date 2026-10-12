use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};
use midir::{MidiInput, MidiInputConnection};
use midly::{MetaMessage, MidiMessage, Smf, Timing, TrackEventKind};
use rtrb::Producer;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};

use crate::audio::AudioCommand;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiDeviceDescriptor {
    pub port_index: usize,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MidiActivityPayload {
    pub status: u8,
    pub channel: u8,
    pub note: u8,
    pub velocity: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMidiNote {
    pub channel: u8,
    pub pitch: u8,
    pub start_tick: u32,
    pub duration_ticks: u32,
    pub velocity: f32, // 0.0 to 1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMidiTrack {
    pub index: usize,
    pub name: Option<String>,
    pub notes: Vec<ParsedMidiNote>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedMidiFile {
    pub format: u16,
    pub ppq: u16,
    pub tempo_bpm: f64,
    pub tracks: Vec<ParsedMidiTrack>,
}

pub struct MidiManager {
    connection: Mutex<Option<MidiInputConnection<()>>>,
    active_device_name: Mutex<Option<String>>,
    active_port_index: Mutex<Option<usize>>,
    midi_producer: Arc<Mutex<Option<Producer<AudioCommand>>>>,
}

// MidiManager safely encapsulates the active MidiInputConnection across threads
unsafe impl Send for MidiManager {}
unsafe impl Sync for MidiManager {}

impl MidiManager {
    pub fn new(midi_producer: Arc<Mutex<Option<Producer<AudioCommand>>>>) -> Self {
        Self {
            connection: Mutex::new(None),
            active_device_name: Mutex::new(None),
            active_port_index: Mutex::new(None),
            midi_producer,
        }
    }

    /// Enumerate all currently connected hardware MIDI input ports.
    pub fn list_inputs(&self) -> Result<Vec<MidiDeviceDescriptor>, String> {
        let midi_in = MidiInput::new("hybrid-daw-probe")
            .map_err(|e| format!("Failed to initialize MIDI subsystem: {}", e))?;
        let ports = midi_in.ports();
        let mut list = Vec::with_capacity(ports.len());

        for (idx, port) in ports.iter().enumerate() {
            let name = midi_in
                .port_name(port)
                .unwrap_or_else(|_| format!("MIDI Controller {}", idx));
            list.push(MidiDeviceDescriptor {
                port_index: idx,
                name,
            });
        }

        Ok(list)
    }

    /// Connect to a specific MIDI input port and spawn the background callback listener.
    pub fn connect(
        &self,
        port_index: usize,
        app_handle: AppHandle,
    ) -> Result<String, String> {
        let mut conn_guard = self.connection.lock().map_err(|e| e.to_string())?;
        // Disconnect existing connection if active
        *conn_guard = None;

        let midi_in = MidiInput::new("hybrid-daw-listener")
            .map_err(|e| format!("Failed to create MIDI input: {}", e))?;
        let ports = midi_in.ports();

        let port = ports
            .get(port_index)
            .ok_or_else(|| format!("Invalid MIDI port index: {}", port_index))?;

        let port_name = midi_in
            .port_name(port)
            .unwrap_or_else(|_| format!("MIDI Port {}", port_index));

        let producer_arc = Arc::clone(&self.midi_producer);
        let app = app_handle.clone();

        // Lock-free, real-time safe callback handler
        let conn = midi_in
            .connect(
                port,
                "hybrid-daw-input-stream",
                move |_timestamp, message, _| {
                    if message.is_empty() {
                        return;
                    }

                    let status = message[0];
                    let message_type = status & 0xF0;
                    let channel = status & 0x0F;
                    let data1 = if message.len() > 1 { message[1] } else { 0 };
                    let data2 = if message.len() > 2 { message[2] } else { 0 };

                    // Dispatch to audio engine ringbuffer with non-blocking try_lock:
                    if let Ok(mut prod_guard) = producer_arc.try_lock() {
                        if let Some(producer) = prod_guard.as_mut() {
                            match message_type {
                                0x90 => {
                                    // Note On (or Note Off if velocity == 0)
                                    if data2 > 0 {
                                        let _ = producer.push(AudioCommand::MidiNoteOn {
                                            channel,
                                            note: data1,
                                            velocity: data2,
                                        });
                                    } else {
                                        let _ = producer.push(AudioCommand::MidiNoteOff {
                                            channel,
                                            note: data1,
                                        });
                                    }
                                }
                                0x80 => {
                                    // Note Off
                                    let _ = producer.push(AudioCommand::MidiNoteOff {
                                        channel,
                                        note: data1,
                                    });
                                }
                                _ => {}
                            }
                        }
                    }

                    // Emit lightweight telemetry event to UI
                    let _ = app.emit(
                        "midi-activity",
                        MidiActivityPayload {
                            status,
                            channel,
                            note: data1,
                            velocity: data2,
                        },
                    );
                },
                (),
            )
            .map_err(|e| format!("Failed to connect to MIDI port {}: {}", port_name, e))?;

        *conn_guard = Some(conn);

        if let Ok(mut name_guard) = self.active_device_name.lock() {
            *name_guard = Some(port_name.clone());
        }
        if let Ok(mut idx_guard) = self.active_port_index.lock() {
            *idx_guard = Some(port_index);
        }

        log::info!("Successfully connected to MIDI input: {}", port_name);
        Ok(port_name)
    }

    /// Disconnect from the currently active MIDI input.
    pub fn disconnect(&self) -> Result<(), String> {
        let mut conn_guard = self.connection.lock().map_err(|e| e.to_string())?;
        *conn_guard = None;

        if let Ok(mut name_guard) = self.active_device_name.lock() {
            *name_guard = None;
        }
        if let Ok(mut idx_guard) = self.active_port_index.lock() {
            *idx_guard = None;
        }

        log::info!("Disconnected MIDI input");
        Ok(())
    }

    /// Read and parse a Standard MIDI File (.mid) into tracks and notes.
    pub fn parse_file<P: AsRef<Path>>(path: P) -> Result<ParsedMidiFile, String> {
        let bytes = fs::read(&path)
            .map_err(|e| format!("Failed to read MIDI file: {}", e))?;

        Self::parse_bytes(&bytes)
    }

    /// Parse raw MIDI file bytes into clean structured note representations.
    pub fn parse_bytes(bytes: &[u8]) -> Result<ParsedMidiFile, String> {
        let smf = Smf::parse(bytes)
            .map_err(|e| format!("Failed to parse Standard MIDI File: {}", e))?;

        let format = match smf.header.format {
            midly::Format::SingleTrack => 0,
            midly::Format::Parallel => 1,
            midly::Format::Sequential => 2,
        };

        let ppq = match smf.header.timing {
            Timing::Metrical(num) => num.as_int(),
            Timing::Timecode(fps, sub) => (fps.as_int() as u16) * (sub as u16),
        };

        let mut tempo_bpm = 120.0;
        let mut tracks = Vec::new();

        for (track_idx, track) in smf.tracks.iter().enumerate() {
            let mut current_tick: u32 = 0;
            let mut track_name: Option<String> = None;
            let mut notes = Vec::new();

            // Track active note-on events: pitch -> (start_tick, velocity, channel)
            let mut active_notes: [Option<(u32, f32, u8)>; 128] = [None; 128];

            for event in track.iter() {
                current_tick += event.delta.as_int();

                match event.kind {
                    TrackEventKind::Meta(MetaMessage::TrackName(name_bytes)) => {
                        let name_str = String::from_utf8_lossy(name_bytes).trim().to_string();
                        if !name_str.is_empty() {
                            track_name = Some(name_str);
                        }
                    }
                    TrackEventKind::Meta(MetaMessage::Tempo(t)) => {
                        let micros = t.as_int();
                        if micros > 0 {
                            tempo_bpm = (60_000_000.0 / micros as f64).round();
                        }
                    }
                    TrackEventKind::Midi {
                        channel,
                        message: MidiMessage::NoteOn { key, vel },
                    } => {
                        let pitch = key.as_int();
                        let velocity_byte = vel.as_int();
                        let pitch_idx = pitch as usize;

                        if pitch_idx < 128 {
                            if velocity_byte > 0 {
                                // If a note was already active on this pitch, terminate it first
                                if let Some((start_tick, prev_vel, prev_ch)) = active_notes[pitch_idx].take() {
                                    let duration = current_tick.saturating_sub(start_tick).max(1);
                                    notes.push(ParsedMidiNote {
                                        channel: prev_ch,
                                        pitch,
                                        start_tick,
                                        duration_ticks: duration,
                                        velocity: prev_vel,
                                    });
                                }

                                let velocity = (velocity_byte as f32 / 127.0).clamp(0.01, 1.0);
                                active_notes[pitch_idx] =
                                    Some((current_tick, velocity, channel.as_int()));
                            } else {
                                // Note On with velocity 0 is treated as Note Off
                                if let Some((start_tick, prev_vel, prev_ch)) = active_notes[pitch_idx].take() {
                                    let duration = current_tick.saturating_sub(start_tick).max(1);
                                    notes.push(ParsedMidiNote {
                                        channel: prev_ch,
                                        pitch,
                                        start_tick,
                                        duration_ticks: duration,
                                        velocity: prev_vel,
                                    });
                                }
                            }
                        }
                    }
                    TrackEventKind::Midi {
                        channel: _,
                        message: MidiMessage::NoteOff { key, .. },
                    } => {
                        let pitch = key.as_int();
                        let pitch_idx = pitch as usize;

                        if pitch_idx < 128 {
                            if let Some((start_tick, prev_vel, prev_ch)) = active_notes[pitch_idx].take() {
                                let duration = current_tick.saturating_sub(start_tick).max(1);
                                notes.push(ParsedMidiNote {
                                    channel: prev_ch,
                                    pitch,
                                    start_tick,
                                    duration_ticks: duration,
                                    velocity: prev_vel,
                                });
                            }
                        }
                    }
                    _ => {}
                }
            }

            // Flush any remaining unclosed active notes at the end of track
            for (pitch_idx, active) in active_notes.iter_mut().enumerate() {
                if let Some((start_tick, velocity, channel)) = active.take() {
                    let duration = current_tick.saturating_sub(start_tick).max(1);
                    notes.push(ParsedMidiNote {
                        channel,
                        pitch: pitch_idx as u8,
                        start_tick,
                        duration_ticks: duration,
                        velocity,
                    });
                }
            }

            tracks.push(ParsedMidiTrack {
                index: track_idx,
                name: track_name,
                notes,
            });
        }

        Ok(ParsedMidiFile {
            format,
            ppq,
            tempo_bpm,
            tracks,
        })
    }
}
