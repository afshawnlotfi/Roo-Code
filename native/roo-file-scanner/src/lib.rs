#![deny(clippy::all)]

use napi_derive::napi;
use rayon::prelude::*;
use std::path::Path;
use walkdir::WalkDir;
use ignore::gitignore::{Gitignore, GitignoreBuilder};
use std::time::Instant;

#[napi]
pub fn list_files(dir_path: String, recursive: bool, limit: u32) -> napi::Result<Vec<String>> {
    let start = Instant::now();
    let path = Path::new(&dir_path);
    
    // Load gitignore patterns if recursive
    let gitignore = if recursive {
        load_gitignore(path)?
    } else {
        None
    };
    
    // Use parallel iterator for large directories if recursive
    let files: Vec<String> = if recursive {
        // First collect all entries that match our criteria
        let entries: Vec<_> = WalkDir::new(path)
            .into_iter()
            .filter_map(Result::ok)
            .filter(|entry| {
                let is_file = entry.file_type().is_file();
                let is_allowed = match &gitignore {
                    Some(gi) => !gi.matched_path_or_any_parents(entry.path(), entry.file_type().is_dir()).is_ignore(),
                    None => true
                };
                is_file && is_allowed
            })
            .take(limit as usize)
            .collect();
            
        // Then process them in parallel
        entries.into_par_iter()
            .map(|entry| entry.path().to_string_lossy().into_owned())
            .collect()
    } else {
        // Non-recursive listing
        std::fs::read_dir(path)
            .map_err(|e| napi::Error::new(napi::Status::GenericFailure, e.to_string()))?
            .filter_map(Result::ok)
            .filter(|entry| entry.file_type().map(|ft| ft.is_file()).unwrap_or(false))
            .take(limit as usize)
            .map(|entry| entry.path().to_string_lossy().into_owned())
            .collect()
    };
    
    let duration = start.elapsed();
    println!("Rust file scanner processed {} files in {:?}", files.len(), duration);
    
    Ok(files)
}

fn load_gitignore(path: &Path) -> napi::Result<Option<Gitignore>> {
    // Look for .gitignore in the directory
    let gitignore_path = path.join(".gitignore");
    
    if gitignore_path.exists() {
        let mut builder = GitignoreBuilder::new(path);
        // The add method returns Option<Error>, not Result
        if let Some(err) = builder.add(gitignore_path) {
            println!("Error adding gitignore: {}", err);
        } else {
            match builder.build() {
                Ok(gitignore) => return Ok(Some(gitignore)),
                Err(e) => println!("Error building gitignore: {}", e),
            }
        }
    }
    
    // Also check for global gitignore
    if let Some(parent) = path.parent() {
        let global_gitignore = parent.join(".gitignore");
        if global_gitignore.exists() {
            let mut builder = GitignoreBuilder::new(parent);
            // The add method returns Option<Error>, not Result
            if let Some(err) = builder.add(global_gitignore) {
                println!("Error adding global gitignore: {}", err);
            } else {
                match builder.build() {
                    Ok(gitignore) => return Ok(Some(gitignore)),
                    Err(e) => println!("Error building global gitignore: {}", e),
                }
            }
        }
    }
    
    Ok(None)
}

// Benchmark function to compare performance
#[napi]
pub fn benchmark_file_scan(dir_path: String, recursive: bool, limit: u32) -> napi::Result<BenchmarkResult> {
    let start = Instant::now();
    let files = list_files(dir_path, recursive, limit)?;
    let duration = start.elapsed();
    
    Ok(BenchmarkResult {
        file_count: files.len() as u32,
        duration_ms: duration.as_millis() as u32,
    })
}

#[napi(object)]
pub struct BenchmarkResult {
    pub file_count: u32,
    pub duration_ms: u32,
}