pub mod audio;

use std::sync::Mutex;
use cpal::Stream;
use rtrb::Producer;
use tauri::Manager;

use crate::audio::{AudioCommand, AudioEngine, ChannelSyncData};

pub struct AudioState {
    pub producer: Mutex<Option<Producer<AudioCommand>>>,
    pub stream: Mutex<Option<Stream>>,
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
        Ok((producer, stream)) => {
            *prod_guard = Some(producer);
            *stream_guard = Some(stream);
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
            let (initial_producer, initial_stream) = match AudioEngine::start() {
                Ok((prod, stream)) => {
                    log::info!("AudioEngine started eagerly on setup");
                    (Some(prod), Some(stream))
                }
                Err(err) => {
                    log::warn!("AudioEngine eager start deferred: {}", err);
                    (None, None)
                }
            };

            app.manage(AudioState {
                producer: Mutex::new(initial_producer),
                stream: Mutex::new(initial_stream),
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_audio,
            play_transport,
            stop_transport,
            set_tempo,
            sync_pattern
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
