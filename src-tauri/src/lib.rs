pub mod audio;

use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use cpal::Stream;
use rtrb::Producer;
use tauri::Manager;

use crate::audio::{
    decode_audio_file, ensure_factory_samples, AudioCommand, AudioDeviceDescriptor, AudioEngine,
    AudioRecorder, BrowserEntry, ChannelSyncData, MidiDeviceDescriptor, MidiManager,
    ParsedMidiFile, RecordedClipMetadata, SampleData, SampleMetadata,
};

pub struct AudioState {
    pub producer: Mutex<Option<Producer<AudioCommand>>>,
    pub midi_producer: Arc<Mutex<Option<Producer<AudioCommand>>>>,
    pub stream: Mutex<Option<Stream>>,
    pub midi_manager: MidiManager,
    pub sample_cache: Mutex<HashMap<String, Arc<SampleData>>>,
    pub recorder: Mutex<AudioRecorder>,
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

#[tauri::command]
fn load_sample(file_path: String, state: tauri::State<'_, AudioState>) -> Result<SampleMetadata, String> {
    let (sample_data, metadata) = decode_audio_file(&file_path)?;
    if let Ok(mut cache) = state.sample_cache.lock() {
        cache.insert(metadata.id.clone(), Arc::clone(&sample_data));
        cache.insert(file_path, sample_data);
    }
    Ok(metadata)
}

#[tauri::command]
fn preview_sample(file_path: String, state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let sample = {
        let mut cache = state.sample_cache.lock().map_err(|e| e.to_string())?;
        if let Some(cached) = cache.get(&file_path) {
            Arc::clone(cached)
        } else {
            let (sample_data, metadata) = decode_audio_file(&file_path)?;
            cache.insert(metadata.id.clone(), Arc::clone(&sample_data));
            cache.insert(file_path, Arc::clone(&sample_data));
            sample_data
        }
    };

    let mut guard = state.producer.lock().map_err(|e| e.to_string())?;
    if let Some(producer) = guard.as_mut() {
        let _ = producer.push(AudioCommand::PreviewSample(sample));
    }
    Ok(())
}

#[tauri::command]
fn stop_preview(state: tauri::State<'_, AudioState>) -> Result<(), String> {
    let mut guard = state.producer.lock().map_err(|e| e.to_string())?;
    if let Some(producer) = guard.as_mut() {
        let _ = producer.push(AudioCommand::StopPreview);
    }
    Ok(())
}

#[tauri::command]
fn assign_channel_sample(
    channel_index: usize,
    sample_id: String,
    state: tauri::State<'_, AudioState>,
) -> Result<(), String> {
    let sample = {
        let mut cache = state.sample_cache.lock().map_err(|e| e.to_string())?;
        if let Some(s) = cache.get(&sample_id) {
            Arc::clone(s)
        } else if Path::new(&sample_id).exists() {
            let (sample_data, meta) = decode_audio_file(&sample_id)?;
            cache.insert(meta.id.clone(), Arc::clone(&sample_data));
            cache.insert(sample_id, Arc::clone(&sample_data));
            sample_data
        } else {
            return Err(format!("Sample ID or path '{}' not found in cache", sample_id));
        }
    };

    let mut guard = state.producer.lock().map_err(|e| e.to_string())?;
    if let Some(producer) = guard.as_mut() {
        let _ = producer.push(AudioCommand::AssignChannelSample {
            channel_index,
            sample,
        });
    }
    Ok(())
}

#[tauri::command]
fn list_browser_directory(dir_path: Option<String>) -> Result<Vec<BrowserEntry>, String> {
    let target_dir: PathBuf = match dir_path {
        Some(ref p) if !p.trim().is_empty() => PathBuf::from(p),
        _ => {
            let mut bookmarks = Vec::new();

            if let Ok(factory) = ensure_factory_samples() {
                bookmarks.push(BrowserEntry {
                    name: "Factory Drum Kits".into(),
                    path: factory.to_string_lossy().to_string(),
                    is_directory: true,
                    extension: None,
                    size_bytes: None,
                });
            }

            if let Some(user_profile) = std::env::var_os("USERPROFILE") {
                let desktop = PathBuf::from(user_profile).join("Desktop");
                if desktop.exists() {
                    bookmarks.push(BrowserEntry {
                        name: "Desktop".into(),
                        path: desktop.to_string_lossy().to_string(),
                        is_directory: true,
                        extension: None,
                        size_bytes: None,
                    });
                }
            }

            if let Ok(curr) = std::env::current_dir() {
                bookmarks.push(BrowserEntry {
                    name: "Project Samples".into(),
                    path: curr.to_string_lossy().to_string(),
                    is_directory: true,
                    extension: None,
                    size_bytes: None,
                });
            }

            return Ok(bookmarks);
        }
    };

    if !target_dir.is_dir() {
        return Err(format!("Not a directory: {:?}", target_dir));
    }

    let mut dirs = Vec::new();
    let mut audio_files = Vec::new();

    let entries = fs::read_dir(&target_dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        if path.is_dir() {
            if !name.starts_with('.') && name != "target" && name != "node_modules" {
                dirs.push(BrowserEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_directory: true,
                    extension: None,
                    size_bytes: None,
                });
            }
        } else if path.is_file() {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if matches!(ext.as_str(), "wav" | "aif" | "aiff" | "mp3" | "flac" | "ogg") {
                let size_bytes = entry.metadata().ok().map(|m| m.len());
                audio_files.push(BrowserEntry {
                    name,
                    path: path.to_string_lossy().to_string(),
                    is_directory: false,
                    extension: Some(ext),
                    size_bytes,
                });
            }
        }
    }

    dirs.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    audio_files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));

    dirs.extend(audio_files);
    Ok(dirs)
}

#[tauri::command]
fn get_audio_input_devices() -> Vec<AudioDeviceDescriptor> {
    AudioRecorder::list_input_devices()
}

#[tauri::command]
fn start_recording(
    track_id: String,
    track_index: usize,
    state: tauri::State<'_, AudioState>,
) -> Result<String, String> {
    let (mon_prod, mon_cons) = rtrb::RingBuffer::<f32>::new(16384);

    // Pass monitor consumer to audio engine for software monitoring
    if let Ok(mut prod_guard) = state.producer.lock() {
        if let Some(ref mut prod) = *prod_guard {
            let _ = prod.push(AudioCommand::SetMonitorConsumer(Some(mon_cons)));
        }
    }

    let mut recorder = state.recorder.lock().map_err(|e| e.to_string())?;
    recorder.start_recording(track_id, track_index, Some(mon_prod))
}

#[tauri::command]
fn stop_recording(
    state: tauri::State<'_, AudioState>,
) -> Result<RecordedClipMetadata, String> {
    // Detach monitor consumer from audio engine
    if let Ok(mut prod_guard) = state.producer.lock() {
        if let Some(ref mut prod) = *prod_guard {
            let _ = prod.push(AudioCommand::SetMonitorConsumer(None));
        }
    }

    let mut recorder = state.recorder.lock().map_err(|e| e.to_string())?;
    recorder.stop_recording()
}

#[tauri::command]
fn get_recording_peak_level(
    state: tauri::State<'_, AudioState>,
) -> Result<f32, String> {
    let recorder = state.recorder.lock().map_err(|e| e.to_string())?;
    Ok(recorder.get_peak_level())
}

#[tauri::command]
fn set_recording_monitoring(
    enabled: bool,
    state: tauri::State<'_, AudioState>,
) -> Result<(), String> {
    let recorder = state.recorder.lock().map_err(|e| e.to_string())?;
    recorder.set_monitoring(enabled);
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

            // Ensure factory one-shot samples exist on startup
            ensure_factory_samples().ok();

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
                sample_cache: Mutex::new(HashMap::new()),
                recorder: Mutex::new(AudioRecorder::new()),
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
            parse_midi_bytes,
            load_sample,
            preview_sample,
            stop_preview,
            assign_channel_sample,
            list_browser_directory,
            get_audio_input_devices,
            start_recording,
            stop_recording,
            get_recording_peak_level,
            set_recording_monitoring
        ])
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
