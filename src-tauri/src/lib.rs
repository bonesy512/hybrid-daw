pub mod audio;

use std::sync::{Arc, Mutex};
use cpal::Stream;
use rtrb::Producer;
use tauri::Manager;

use crate::audio::{
    AudioCommand, AudioEngine, ChannelSyncData, MidiDeviceDescriptor, MidiManager,
    ParsedMidiFile,
};

pub struct AudioState {
    pub producer: Mutex<Option<Producer<AudioCommand>>>,
    pub midi_producer: Arc<Mutex<Option<Producer<AudioCommand>>>>,
    pub stream: Mutex<Option<Stream>>,
    pub midi_manager: MidiManager,
}

// In CPAL on Windows, Stream contains !Send raw COM handles, but holding it
// behind a Mutex in AudioState is safe across threads for lifecycle control.
unsafe impl Send for AudioState {}
unsafe impl Sync for AudioState {}

#[tauri::command]
fn start_audio(state: tauri::State<'_, AudioState>) -> Result<String, String> {
    let mut prod_guard = state.producer.lock().map_err(|e| e.to_string())?;
    let mut stream_guard = state.stream.lock().map_err(|e| e.to_string())?;

    if prod_guard.is_some() {
        return Ok("Audio engine already active".into());
    }

    match AudioEngine::start() {
        Ok((cmd_prod, midi_prod, stream)) => {
            *prod_guard = Some(cmd_prod);
            *stream_guard = Some(stream);
            if let Ok(mut midi_p) = state.midi_producer.lock() {
                *midi_p = Some(midi_prod);
            }
            log::info!("CPAL audio engine initialized and streaming");
            Ok("Audio engine initialized successfully".into())
        }
        Err(e) => {
            log::error!("Audio engine startup failed: {}", e);
            Err(format!("Failed to start audio engine: {}", e))
        }
    }
}

#[tauri::command]
fn play_transport(state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let mut guard = state.producer.lock().map_err(|e| e.to_string())?;
    if let Some(producer) = guard.as_mut() {
        let _ = producer.push(AudioCommand::Play);
    }
    Ok(())
}

#[tauri::command]
fn stop_transport(state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let mut guard = state.producer.lock().map_err(|e| e.to_string())?;
    if let Some(producer) = guard.as_mut() {
        let _ = producer.push(AudioCommand::Stop);
    }
    Ok(())
}

#[tauri::command]
fn set_tempo(bpm: f64, state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let mut guard = state.producer.lock().map_err(|e| e.to_string())?;
    if let Some(producer) = guard.as_mut() {
        let _ = producer.push(AudioCommand::SetBpm(bpm));
    }
    Ok(())
}

#[tauri::command]
fn sync_pattern(
    channels: Vec<ChannelSyncData>,
    state: tauri::State<'_, AudioState>,
) -> Result<(), String> {
    let mut guard = state.producer.lock().map_err(|e| e.to_string())?;
    if let Some(producer) = guard.as_mut() {
        for (idx, ch) in channels.iter().enumerate() {
            let mut steps = [false; 16];
            for (i, &step) in ch.steps.iter().take(16).enumerate() {
                steps[i] = step;
            }
            let _ = producer.push(AudioCommand::UpdatePattern {
                channel_index: idx,
                steps,
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn get_midi_inputs(state: tauri::State<'_, AudioState>) -> Result<Vec<MidiDeviceDescriptor>, String> {
    state.midi_manager.list_inputs()
}

#[tauri::command]
fn connect_midi_input(
    port_index: usize,
    app: tauri::AppHandle,
    state: tauri::State<'_, AudioState>,
) -> Result<String, String> {
    state.midi_manager.connect(port_index, app)
}

#[tauri::command]
fn disconnect_midi_input(state: tauri::State<'_, AudioState>) -> Result<(), String> {
    state.midi_manager.disconnect()
}

#[tauri::command]
fn parse_midi_file(file_path: String) -> Result<ParsedMidiFile, String> {
    MidiManager::parse_file(file_path)
}

#[tauri::command]
fn parse_midi_bytes(bytes: Vec<u8>) -> Result<ParsedMidiFile, String> {
    MidiManager::parse_bytes(&bytes)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Attempt eager startup of the CPAL audio stream
            let (initial_cmd_prod, initial_midi_prod, initial_stream) = match AudioEngine::start() {
                Ok((cmd_p, midi_p, stream)) => {
                    log::info!("AudioEngine started eagerly on setup");
                    (Some(cmd_p), Some(midi_p), Some(stream))
                }
                Err(err) => {
                    log::warn!("AudioEngine eager start deferred: {}", err);
                    (None, None, None)
                }
            };

            let midi_producer_arc = Arc::new(Mutex::new(initial_midi_prod));
            let midi_manager = MidiManager::new(Arc::clone(&midi_producer_arc));

            app.manage(AudioState {
                producer: Mutex::new(initial_cmd_prod),
                midi_producer: midi_producer_arc,
                stream: Mutex::new(initial_stream),
                midi_manager,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_audio,
            play_transport,
            stop_transport,
            set_tempo,
            sync_pattern,
            get_midi_inputs,
            connect_midi_input,
            disconnect_midi_input,
            parse_midi_file,
            parse_midi_bytes
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
